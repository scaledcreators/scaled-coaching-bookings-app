-- Keep capacity semantics consistent and preserve booking/payment history when
-- an administrator removes a closed card from the active board.
alter table public.booking_requests
  add column if not exists admin_archived_at timestamptz,
  add column if not exists admin_archived_by text;

create index if not exists booking_requests_admin_archive_idx
  on public.booking_requests (whop_company_id, admin_archived_at, created_at desc);

create or replace function public.expire_overdue_booking_requests()
returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    update booking_requests
    set
      status = 'expired',
      expired_at = now(),
      payment_checkout_url = null,
      checkout_creation_token = null,
      checkout_creation_started_at = null,
      updated_at = now()
    where status = 'pending_payment'
      and (payment_due_at is null or payment_due_at <= now())
    returning id
  )
  select count(*)::integer from expired;
$$;

create or replace function public.is_booking_slot_blocked(
  p_company_id text,
  p_offer_id uuid,
  p_coach_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_ignore_booking_id uuid default null
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (select emergency_paused from booking_settings where whop_company_id = p_company_id),
      false
    )
    or exists (
      select 1
      from unavailable_windows u
      where u.whop_company_id = p_company_id
        and u.status = 'active'
        and (u.offer_id is null or u.offer_id = p_offer_id)
        and (u.coach_id is null or p_coach_id is null or u.coach_id = p_coach_id)
        and tstzrange(u.starts_at, u.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
    )
    or exists (
      select 1
      from booking_requests b
      where b.whop_company_id = p_company_id
        and (
          b.status in ('pending_approval', 'confirmed', 'reschedule_requested')
          or (b.status = 'pending_payment' and b.payment_due_at > now())
        )
        and (p_ignore_booking_id is null or b.id <> p_ignore_booking_id)
        and (p_coach_id is null or b.coach_id is null or b.coach_id = p_coach_id)
        and (
          (
            b.status = 'reschedule_requested'
            and (
              tstzrange(b.confirmed_start_at, b.confirmed_end_at, '[)')
                && tstzrange(p_starts_at, p_ends_at, '[)')
              or tstzrange(b.requested_start_at, b.requested_end_at, '[)')
                && tstzrange(p_starts_at, p_ends_at, '[)')
            )
          )
          or (
            b.status <> 'reschedule_requested'
            and tstzrange(
              coalesce(b.confirmed_start_at, b.requested_start_at),
              coalesce(b.confirmed_end_at, b.requested_end_at),
              '[)'
            ) && tstzrange(p_starts_at, p_ends_at, '[)')
          )
        )
    )
    or exists (
      select 1
      from booking_holds h
      where h.whop_company_id = p_company_id
        and h.expires_at > now()
        and (p_coach_id is null or h.coach_id is null or h.coach_id = p_coach_id)
        and tstzrange(h.starts_at, h.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
    );
$$;

create or replace function public.create_booking_request_atomic(
  p_company_id text,
  p_user_id text,
  p_experience_id text,
  p_offer_id uuid,
  p_coach_id uuid,
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_intake_answers jsonb,
  p_member_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_offer booking_offers%rowtype;
  v_booking_date date;
  v_daily_capacity integer;
  v_daily_count integer;
begin
  select * into v_offer
  from booking_offers
  where id = p_offer_id
    and whop_company_id = p_company_id;
  if not found then
    raise exception 'OFFER_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id, 0));
  v_booking_date := (p_starts_at at time zone p_timezone)::date;

  select coalesce(
    (
      select o.max_bookings
      from booking_capacity_overrides o
      where o.whop_company_id = p_company_id
        and o.capacity_date = v_booking_date
    ),
    (
      select s.default_daily_capacity
      from booking_settings s
      where s.whop_company_id = p_company_id
    ),
    4
  ) into v_daily_capacity;

  select count(*)::integer into v_daily_count
  from booking_requests b
  where b.whop_company_id = p_company_id
    and (
      (
        b.status = 'reschedule_requested'
        and (
          (b.confirmed_start_at at time zone p_timezone)::date = v_booking_date
          or (b.requested_start_at at time zone p_timezone)::date = v_booking_date
        )
      )
      or (
        b.status <> 'reschedule_requested'
        and (coalesce(b.confirmed_start_at, b.requested_start_at) at time zone p_timezone)::date = v_booking_date
      )
    )
    and (
      b.status in ('pending_approval', 'confirmed', 'reschedule_requested')
      or (b.status = 'pending_payment' and b.payment_due_at > now())
    );

  if v_daily_count >= v_daily_capacity then
    raise exception 'DAY_AT_CAPACITY' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from booking_requests b
    where b.whop_company_id = p_company_id
      and b.whop_user_id = p_user_id
      and (
        (
          b.status = 'reschedule_requested'
          and (
            (b.confirmed_start_at at time zone p_timezone)::date = v_booking_date
            or (b.requested_start_at at time zone p_timezone)::date = v_booking_date
          )
        )
        or (
          b.status <> 'reschedule_requested'
          and (coalesce(b.confirmed_start_at, b.requested_start_at) at time zone p_timezone)::date = v_booking_date
        )
      )
      and (
        b.status in ('pending_approval', 'confirmed', 'reschedule_requested')
        or (b.status = 'pending_payment' and b.payment_due_at > now())
      )
  ) then
    raise exception 'MEMBER_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  if public.is_booking_slot_blocked(
    p_company_id,
    p_offer_id,
    p_coach_id,
    p_starts_at - make_interval(mins => v_offer.buffer_before_minutes),
    p_ends_at + make_interval(mins => v_offer.buffer_after_minutes),
    null
  ) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  insert into booking_requests (
    whop_company_id,
    whop_user_id,
    whop_experience_id,
    offer_id,
    coach_id,
    status,
    requested_start_at,
    requested_end_at,
    timezone,
    intake_answers,
    member_note
  ) values (
    p_company_id,
    p_user_id,
    p_experience_id,
    p_offer_id,
    p_coach_id,
    p_status,
    p_starts_at,
    p_ends_at,
    p_timezone,
    coalesce(p_intake_answers, '{}'::jsonb),
    nullif(p_member_note, '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.reschedule_booking_request_atomic(
  p_booking_id uuid,
  p_company_id text,
  p_user_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking booking_requests%rowtype;
  v_offer booking_offers%rowtype;
  v_booking_date date;
  v_daily_capacity integer;
  v_daily_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id, 0));

  select * into v_booking
  from booking_requests
  where id = p_booking_id
    and whop_company_id = p_company_id
    and whop_user_id = p_user_id
  for update;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'BOOKING_NOT_CONFIRMED' using errcode = 'P0001';
  end if;

  select * into v_offer
  from booking_offers
  where id = v_booking.offer_id
    and whop_company_id = p_company_id;
  if not found then
    raise exception 'OFFER_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_booking_date := (p_starts_at at time zone p_timezone)::date;
  select coalesce(
    (
      select o.max_bookings
      from booking_capacity_overrides o
      where o.whop_company_id = p_company_id
        and o.capacity_date = v_booking_date
    ),
    (
      select s.default_daily_capacity
      from booking_settings s
      where s.whop_company_id = p_company_id
    ),
    4
  ) into v_daily_capacity;

  select count(*)::integer into v_daily_count
  from booking_requests b
  where b.whop_company_id = p_company_id
    and b.id <> p_booking_id
    and (
      b.status in ('pending_approval', 'confirmed')
      or (b.status = 'pending_payment' and b.payment_due_at > now())
      or b.status = 'reschedule_requested'
    )
    and (
      (
        b.status = 'reschedule_requested'
        and (
          (b.confirmed_start_at at time zone p_timezone)::date = v_booking_date
          or (b.requested_start_at at time zone p_timezone)::date = v_booking_date
        )
      )
      or (
        b.status <> 'reschedule_requested'
        and (coalesce(b.confirmed_start_at, b.requested_start_at) at time zone p_timezone)::date = v_booking_date
      )
    );

  if v_daily_count >= v_daily_capacity then
    raise exception 'DAY_AT_CAPACITY' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from booking_requests b
    where b.whop_company_id = p_company_id
      and b.id <> p_booking_id
      and b.whop_user_id = p_user_id
      and (
        b.status in ('pending_approval', 'confirmed')
        or (b.status = 'pending_payment' and b.payment_due_at > now())
        or b.status = 'reschedule_requested'
      )
      and (
        (
          b.status = 'reschedule_requested'
          and (
            (b.confirmed_start_at at time zone p_timezone)::date = v_booking_date
            or (b.requested_start_at at time zone p_timezone)::date = v_booking_date
          )
        )
        or (
          b.status <> 'reschedule_requested'
          and (coalesce(b.confirmed_start_at, b.requested_start_at) at time zone p_timezone)::date = v_booking_date
        )
      )
  ) then
    raise exception 'MEMBER_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  if public.is_booking_slot_blocked(
    p_company_id,
    v_booking.offer_id,
    v_booking.coach_id,
    p_starts_at - make_interval(mins => v_offer.buffer_before_minutes),
    p_ends_at + make_interval(mins => v_offer.buffer_after_minutes),
    p_booking_id
  ) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update booking_requests
  set
    status = 'reschedule_requested',
    requested_start_at = p_starts_at,
    requested_end_at = p_ends_at,
    updated_at = now()
  where id = p_booking_id
    and status = 'confirmed';

  if not found then
    raise exception 'BOOKING_CHANGED' using errcode = 'P0001';
  end if;

  return p_booking_id;
end;
$$;

revoke all on function public.expire_overdue_booking_requests()
  from public, anon, authenticated;
revoke all on function public.is_booking_slot_blocked(
  text, uuid, uuid, timestamptz, timestamptz, uuid
) from public, anon, authenticated;
revoke all on function public.create_booking_request_atomic(
  text, text, text, uuid, uuid, text, timestamptz, timestamptz, text, jsonb, text
) from public, anon, authenticated;
revoke all on function public.reschedule_booking_request_atomic(
  uuid, text, text, timestamptz, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.expire_overdue_booking_requests()
  to service_role;
grant execute on function public.is_booking_slot_blocked(
  text, uuid, uuid, timestamptz, timestamptz, uuid
) to service_role;
grant execute on function public.create_booking_request_atomic(
  text, text, text, uuid, uuid, text, timestamptz, timestamptz, text, jsonb, text
) to service_role;
grant execute on function public.reschedule_booking_request_atomic(
  uuid, text, text, timestamptz, timestamptz, text
) to service_role;

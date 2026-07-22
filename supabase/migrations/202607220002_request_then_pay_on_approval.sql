-- Request first, charge only after coach approval.
create extension if not exists pg_cron with schema pg_catalog;

alter table public.booking_requests
  drop constraint if exists booking_requests_status_check;

update public.booking_requests
set status = case
  when status = 'requested' then 'pending_approval'
  when status = 'declined' then 'rejected'
  when status = 'pending_payment' then 'expired'
  else status
end
where status in ('requested', 'declined', 'pending_payment');

alter table public.booking_requests
  add column if not exists whop_experience_id text,
  add column if not exists payment_due_at timestamptz,
  add column if not exists payment_checkout_url text,
  add column if not exists checkout_creation_token uuid,
  add column if not exists checkout_creation_started_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists expired_at timestamptz;

update public.booking_requests
set
  expired_at = coalesce(expired_at, now()),
  updated_at = now()
where status = 'expired';

update public.booking_requests b
set whop_experience_id = (
  select min(e.experience_id)
  from public.experience_installations e
  where e.whop_company_id = b.whop_company_id
)
where b.whop_experience_id is null
  and exists (
    select 1
    from public.experience_installations e
    where e.whop_company_id = b.whop_company_id
  );

alter table public.booking_requests
  add constraint booking_requests_status_check check (
    status in (
      'draft',
      'pending_approval',
      'pending_payment',
      'confirmed',
      'rejected',
      'expired',
      'reschedule_requested',
      'cancelled',
      'completed',
      'no_show'
    )
  );

create index if not exists booking_requests_payment_deadline_idx
  on public.booking_requests (payment_due_at)
  where status = 'pending_payment';

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
      and payment_due_at is not null
      and payment_due_at <= now()
    returning id
  )
  select count(*)::integer from expired;
$$;

create or replace function public.claim_booking_checkout(
  p_booking_id uuid,
  p_user_id text,
  p_token uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update booking_requests
  set
    checkout_creation_token = p_token,
    checkout_creation_started_at = now(),
    updated_at = now()
  where id = p_booking_id
    and whop_user_id = p_user_id
    and status = 'pending_payment'
    and payment_due_at > now()
    and payment_checkout_url is null
    and (
      checkout_creation_token is null
      or checkout_creation_started_at < now() - interval '5 minutes'
    );

  return found;
end;
$$;

create or replace function public.approve_booking_request_atomic(
  p_booking_id uuid,
  p_company_id text,
  p_coach_id uuid,
  p_payment_due_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking booking_requests%rowtype;
  v_offer booking_offers%rowtype;
  v_requires_payment boolean;
  v_blocked_start timestamptz;
  v_blocked_end timestamptz;
begin
  select * into v_booking
  from booking_requests
  where id = p_booking_id
    and whop_company_id = p_company_id
  for update;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_booking.status not in ('pending_approval', 'reschedule_requested') then
    raise exception 'BOOKING_ALREADY_DECIDED' using errcode = 'P0001';
  end if;

  select * into v_offer
  from booking_offers
  where id = v_booking.offer_id
    and whop_company_id = p_company_id;
  if not found then
    raise exception 'OFFER_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id, 0)
  );

  v_blocked_start := v_booking.requested_start_at
    - make_interval(mins => v_offer.buffer_before_minutes);
  v_blocked_end := v_booking.requested_end_at
    + make_interval(mins => v_offer.buffer_after_minutes);

  if public.is_booking_slot_blocked(
    p_company_id,
    v_booking.offer_id,
    p_coach_id,
    v_blocked_start,
    v_blocked_end,
    p_booking_id
  ) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_requires_payment := v_offer.access_mode = 'paid'
    and v_offer.price_cents > 0
    and v_booking.whop_payment_id is null;

  update booking_requests
  set
    status = case when v_requires_payment then 'pending_payment' else 'confirmed' end,
    coach_id = p_coach_id,
    approved_at = coalesce(approved_at, now()),
    payment_due_at = case when v_requires_payment then p_payment_due_at else null end,
    payment_checkout_url = null,
    whop_checkout_configuration_id = case
      when v_requires_payment then null
      else whop_checkout_configuration_id
    end,
    checkout_creation_token = null,
    checkout_creation_started_at = null,
    confirmed_start_at = case
      when v_requires_payment then confirmed_start_at
      else requested_start_at
    end,
    confirmed_end_at = case
      when v_requires_payment then confirmed_end_at
      else requested_end_at
    end,
    updated_at = now()
  where id = p_booking_id;

  return p_booking_id;
end;
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
          or (
            b.status = 'pending_payment'
            and (b.payment_due_at is null or b.payment_due_at > now())
          )
        )
        and (p_ignore_booking_id is null or b.id <> p_ignore_booking_id)
        and (p_coach_id is null or b.coach_id is null or b.coach_id = p_coach_id)
        and tstzrange(
          coalesce(b.confirmed_start_at, b.requested_start_at),
          coalesce(b.confirmed_end_at, b.requested_end_at),
          '[)'
        ) && tstzrange(p_starts_at, p_ends_at, '[)')
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
begin
  select * into v_offer
  from booking_offers
  where id = p_offer_id
    and whop_company_id = p_company_id;
  if not found then
    raise exception 'OFFER_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id, 0)
  );

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

revoke all on function public.expire_overdue_booking_requests()
  from public, anon, authenticated;
revoke all on function public.claim_booking_checkout(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.approve_booking_request_atomic(
  uuid,
  text,
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.create_booking_request_atomic(
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  timestamptz,
  timestamptz,
  text,
  jsonb,
  text
) from public, anon, authenticated;

grant execute on function public.expire_overdue_booking_requests()
  to service_role;
grant execute on function public.claim_booking_checkout(uuid, text, uuid)
  to service_role;
grant execute on function public.approve_booking_request_atomic(
  uuid,
  text,
  uuid,
  timestamptz
) to service_role;
grant execute on function public.create_booking_request_atomic(
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  timestamptz,
  timestamptz,
  text,
  jsonb,
  text
) to service_role;

select cron.schedule(
  'expire-overdue-coaching-bookings',
  '* * * * *',
  $job$select public.expire_overdue_booking_requests();$job$
);

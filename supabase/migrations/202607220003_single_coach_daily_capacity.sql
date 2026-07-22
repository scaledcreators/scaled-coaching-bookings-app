-- Keep one schedulable coach per company and enforce daily capacity atomically.
alter table public.booking_settings
  add column if not exists default_daily_capacity integer not null default 4;

alter table public.booking_settings
  drop constraint if exists booking_settings_default_daily_capacity_check;

alter table public.booking_settings
  add constraint booking_settings_default_daily_capacity_check
  check (default_daily_capacity between 1 and 100);

create table if not exists public.booking_capacity_overrides (
  id uuid primary key default gen_random_uuid(),
  whop_company_id text not null,
  capacity_date date not null,
  max_bookings integer not null check (max_bookings between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (whop_company_id, capacity_date)
);

create index if not exists booking_capacity_overrides_lookup_idx
  on public.booking_capacity_overrides (whop_company_id, capacity_date);

create unique index if not exists coaches_one_active_per_company_idx
  on public.coaches (whop_company_id)
  where status = 'active';

alter table public.booking_capacity_overrides enable row level security;

grant select, insert, update, delete
  on table public.booking_capacity_overrides
  to service_role;

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
    and (coalesce(b.confirmed_start_at, b.requested_start_at) at time zone p_timezone)::date = v_booking_date
    and (
      b.status in ('pending_approval', 'confirmed', 'reschedule_requested', 'completed', 'no_show')
      or (
        b.status = 'pending_payment'
        and (b.payment_due_at is null or b.payment_due_at > now())
      )
    );

  if v_daily_count >= v_daily_capacity then
    raise exception 'DAY_AT_CAPACITY' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from booking_requests b
    where b.whop_company_id = p_company_id
      and b.whop_user_id = p_user_id
      and (coalesce(b.confirmed_start_at, b.requested_start_at) at time zone p_timezone)::date = v_booking_date
      and (
        b.status in ('pending_approval', 'confirmed', 'reschedule_requested', 'completed', 'no_show')
        or (
          b.status = 'pending_payment'
          and (b.payment_due_at is null or b.payment_due_at > now())
        )
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

create extension if not exists pgcrypto;

create table if not exists public.booking_offers (
  id uuid primary key default gen_random_uuid(),
  whop_company_id text not null,
  title text not null,
  slug text not null,
  description text,
  cover_image_url text,
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'usd',
  access_mode text not null check (access_mode in ('free','paid','members_only','manual_approval')),
  status text not null default 'draft' check (status in ('draft','published','hidden','archived')),
  whop_product_id text,
  whop_plan_id text,
  checkout_url text,
  requires_manual_confirmation boolean not null default true,
  min_notice_hours integer not null default 24 check (min_notice_hours >= 0),
  max_advance_days integer not null default 60 check (max_advance_days > 0),
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 15 check (buffer_after_minutes >= 0),
  capacity_per_slot integer not null default 1 check (capacity_per_slot > 0),
  intake_schema jsonb not null default '{}'::jsonb,
  confirmation_template text,
  cancellation_policy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (whop_company_id, slug)
);

create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(), whop_company_id text not null, name text not null,
  avatar_url text, bio text, timezone text not null default 'America/Chicago',
  status text not null default 'active' check (status in ('active','hidden','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.offer_coaches (
  offer_id uuid not null references public.booking_offers(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  primary key (offer_id, coach_id)
);

create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(), whop_company_id text not null,
  coach_id uuid references public.coaches(id) on delete cascade,
  offer_id uuid references public.booking_offers(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6), start_time time not null, end_time time not null,
  timezone text not null default 'America/Chicago', status text not null default 'active' check (status in ('active','disabled')),
  check (end_time > start_time)
);

create table if not exists public.unavailable_windows (
  id uuid primary key default gen_random_uuid(), whop_company_id text not null,
  coach_id uuid references public.coaches(id) on delete cascade,
  offer_id uuid references public.booking_offers(id) on delete cascade,
  title text not null, reason text, starts_at timestamptz not null, ends_at timestamptz not null,
  all_day boolean not null default false, recurrence_rule text,
  status text not null default 'active' check (status in ('active','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(), whop_company_id text not null, whop_user_id text not null,
  offer_id uuid not null references public.booking_offers(id), coach_id uuid references public.coaches(id),
  status text not null default 'draft' check (status in ('draft','pending_payment','requested','confirmed','declined','reschedule_requested','cancelled','completed','no_show')),
  requested_start_at timestamptz, requested_end_at timestamptz, confirmed_start_at timestamptz, confirmed_end_at timestamptz,
  timezone text, intake_answers jsonb not null default '{}'::jsonb, member_note text, admin_note text,
  meeting_location text, meeting_url text, manual_join_instructions text,
  whop_payment_id text, whop_membership_id text, whop_checkout_configuration_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (requested_end_at is null or requested_start_at is null or requested_end_at > requested_start_at),
  check (confirmed_end_at is null or confirmed_start_at is null or confirmed_end_at > confirmed_start_at)
);

create table if not exists public.booking_holds (
  id uuid primary key default gen_random_uuid(), whop_company_id text not null, whop_user_id text not null,
  offer_id uuid not null references public.booking_offers(id), coach_id uuid references public.coaches(id),
  starts_at timestamptz not null, ends_at timestamptz not null, expires_at timestamptz not null,
  created_at timestamptz not null default now(), check (ends_at > starts_at)
);

create table if not exists public.booking_entitlements (
  id uuid primary key default gen_random_uuid(), whop_company_id text not null, whop_user_id text not null,
  offer_id uuid references public.booking_offers(id), status text not null check (status in ('active','revoked','expired')),
  source text not null check (source in ('payment','membership','manual')), whop_payment_id text, whop_membership_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique nulls not distinct (whop_company_id, whop_user_id, offer_id, source)
);

create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(), booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  sender text not null check (sender in ('member','admin','system')), body text not null, created_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(), whop_company_id text, event_id text unique not null,
  event_type text not null, payload jsonb not null, processed_at timestamptz, created_at timestamptz not null default now()
);

create table if not exists public.experience_installations (
  experience_id text primary key, whop_company_id text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.booking_settings (
  whop_company_id text primary key, emergency_paused boolean not null default false,
  default_timezone text not null default 'America/Chicago', support_contact text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index if not exists booking_offers_company_status_idx on public.booking_offers (whop_company_id, status);
create index if not exists coaches_company_status_idx on public.coaches (whop_company_id, status);
create index if not exists availability_rules_lookup_idx on public.availability_rules (whop_company_id, weekday, status);
create index if not exists unavailable_windows_overlap_idx on public.unavailable_windows (whop_company_id, starts_at, ends_at) where status = 'active';
create index if not exists booking_requests_company_status_idx on public.booking_requests (whop_company_id, status, requested_start_at);
create index if not exists booking_requests_user_idx on public.booking_requests (whop_company_id, whop_user_id, created_at desc);
create index if not exists booking_holds_overlap_idx on public.booking_holds (whop_company_id, starts_at, ends_at);

create or replace function public.is_booking_slot_blocked(
  p_company_id text, p_offer_id uuid, p_coach_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_ignore_booking_id uuid default null
) returns boolean language sql stable security definer set search_path = public as $$
  select
    coalesce((select emergency_paused from booking_settings where whop_company_id = p_company_id), false)
    or exists (
      select 1 from unavailable_windows u where u.whop_company_id = p_company_id and u.status = 'active'
        and (u.offer_id is null or u.offer_id = p_offer_id) and (u.coach_id is null or p_coach_id is null or u.coach_id = p_coach_id)
        and tstzrange(u.starts_at, u.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
    )
    or exists (
      select 1 from booking_requests b where b.whop_company_id = p_company_id
        and b.status in ('pending_payment','requested','confirmed','reschedule_requested')
        and (p_ignore_booking_id is null or b.id <> p_ignore_booking_id)
        and (p_coach_id is null or b.coach_id is null or b.coach_id = p_coach_id)
        and tstzrange(coalesce(b.confirmed_start_at,b.requested_start_at), coalesce(b.confirmed_end_at,b.requested_end_at), '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
    )
    or exists (
      select 1 from booking_holds h where h.whop_company_id = p_company_id and h.expires_at > now()
        and (p_coach_id is null or h.coach_id is null or h.coach_id = p_coach_id)
        and tstzrange(h.starts_at,h.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)')
    );
$$;

create or replace function public.create_booking_request_atomic(
  p_company_id text, p_user_id text, p_offer_id uuid, p_coach_id uuid,
  p_status text, p_starts_at timestamptz, p_ends_at timestamptz, p_timezone text,
  p_intake_answers jsonb, p_member_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id || ':' || coalesce(p_coach_id::text,'any') || ':' || p_starts_at::text, 0));
  if public.is_booking_slot_blocked(p_company_id,p_offer_id,p_coach_id,p_starts_at,p_ends_at,null) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  insert into booking_requests (whop_company_id,whop_user_id,offer_id,coach_id,status,requested_start_at,requested_end_at,timezone,intake_answers,member_note)
  values (p_company_id,p_user_id,p_offer_id,p_coach_id,p_status,p_starts_at,p_ends_at,p_timezone,coalesce(p_intake_answers,'{}'::jsonb),nullif(p_member_note,''))
  returning id into v_id;
  return v_id;
end;
$$;

alter table public.booking_offers enable row level security;
alter table public.coaches enable row level security;
alter table public.offer_coaches enable row level security;
alter table public.availability_rules enable row level security;
alter table public.unavailable_windows enable row level security;
alter table public.booking_requests enable row level security;
alter table public.booking_holds enable row level security;
alter table public.booking_entitlements enable row level security;
alter table public.booking_messages enable row level security;
alter table public.webhook_events enable row level security;
alter table public.experience_installations enable row level security;
alter table public.booking_settings enable row level security;

revoke all on function public.is_booking_slot_blocked(text,uuid,uuid,timestamptz,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.create_booking_request_atomic(text,text,uuid,uuid,text,timestamptz,timestamptz,text,jsonb,text) from public, anon, authenticated;

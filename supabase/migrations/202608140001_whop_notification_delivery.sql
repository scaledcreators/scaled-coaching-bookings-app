-- Deduplicated event-driven Whop notifications.

create table if not exists public.booking_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  whop_company_id text not null,
  event_key text not null,
  channel text not null check (channel = 'whop'),
  title text not null,
  content text not null,
  status text not null default 'processing'
    check (status in ('processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 1 check (attempts between 1 and 3),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_request_id, event_key, channel)
);

create index if not exists booking_notification_deliveries_status_idx
  on public.booking_notification_deliveries (status, updated_at);

alter table public.booking_notification_deliveries enable row level security;

create or replace function public.claim_booking_notification_delivery(
  p_booking_id uuid,
  p_company_id text,
  p_event_key text,
  p_channel text,
  p_title text,
  p_content text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_channel <> 'whop' then
    raise exception 'INVALID_NOTIFICATION_CHANNEL' using errcode = 'P0001';
  end if;

  insert into booking_notification_deliveries (
    booking_request_id,
    whop_company_id,
    event_key,
    channel,
    title,
    content
  ) values (
    p_booking_id,
    p_company_id,
    p_event_key,
    p_channel,
    left(p_title, 200),
    left(p_content, 2000)
  )
  on conflict (booking_request_id, event_key, channel) do update
    set
      status = 'processing',
      attempts = booking_notification_deliveries.attempts + 1,
      title = excluded.title,
      content = excluded.content,
      last_error = null,
      updated_at = now()
    where booking_notification_deliveries.status = 'failed'
      and booking_notification_deliveries.attempts < 3
      and booking_notification_deliveries.updated_at <= now() - interval '5 minutes'
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on public.booking_notification_deliveries from public, anon, authenticated;
revoke all on function public.claim_booking_notification_delivery(
  uuid, text, text, text, text, text
) from public, anon, authenticated;

grant all on public.booking_notification_deliveries to service_role;
grant execute on function public.claim_booking_notification_delivery(
  uuid, text, text, text, text, text
) to service_role;

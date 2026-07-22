alter table public.booking_requests
  add column if not exists refund_status text not null default 'not_requested',
  add column if not exists refund_reason text,
  add column if not exists refund_requested_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists whop_refund_id text;

do $$ begin
  alter table public.booking_requests add constraint booking_requests_refund_status_check
    check (refund_status in ('not_requested','requested','processing','refunded','declined','failed'));
exception when duplicate_object then null;
end $$;

create index if not exists booking_requests_refund_queue_idx
  on public.booking_requests (whop_company_id, refund_status, refund_requested_at desc);

grant select, insert, update, delete on table
  public.booking_offers, public.coaches, public.offer_coaches, public.booking_requests, public.booking_messages
to service_role;

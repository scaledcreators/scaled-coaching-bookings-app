-- Optional sample content only. Production installations are discovered from
-- Whop automatically and do not require this file.
insert into public.booking_settings (whop_company_id, default_timezone, default_daily_capacity)
values ('biz_replace_me', 'America/Chicago', 4) on conflict do nothing;

with coach as (
  insert into public.coaches (whop_company_id, name, bio, timezone)
  values ('biz_replace_me', 'Your coach', 'Private coaching for growing creators.', 'America/Chicago')
  returning id
), offer as (
  insert into public.booking_offers (whop_company_id,title,slug,description,duration_minutes,price_cents,access_mode,status)
  values ('biz_replace_me','Creator Strategy Session','creator-strategy','A focused 1:1 working session.',45,25000,'paid','draft')
  returning id
)
insert into public.offer_coaches (offer_id, coach_id) select offer.id, coach.id from offer, coach;

insert into public.availability_rules (whop_company_id, coach_id, weekday, start_time, end_time, timezone)
select 'biz_replace_me', (
  select id from public.coaches
  where whop_company_id = 'biz_replace_me' and status = 'active'
  order by created_at
  limit 1
), weekday, '09:00'::time, '16:30'::time, 'America/Chicago'
from generate_series(1,5) as weekday;

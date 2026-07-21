-- Replace these demo Whop IDs after creating the app and experience in Whop.
insert into public.booking_settings (whop_company_id, default_timezone)
values ('biz_replace_me', 'America/Chicago') on conflict do nothing;

insert into public.experience_installations (experience_id, whop_company_id)
values ('exp_replace_me', 'biz_replace_me') on conflict (experience_id) do update set whop_company_id = excluded.whop_company_id;

with coach as (
  insert into public.coaches (whop_company_id, name, bio, timezone)
  values ('biz_replace_me', 'Your coaching team', 'Private coaching for growing creators.', 'America/Chicago')
  returning id
), offer as (
  insert into public.booking_offers (whop_company_id,title,slug,description,duration_minutes,price_cents,access_mode,status)
  values ('biz_replace_me','Creator Strategy Session','creator-strategy','A focused 1:1 working session.',45,25000,'paid','draft')
  returning id
)
insert into public.offer_coaches (offer_id, coach_id) select offer.id, coach.id from offer, coach;

insert into public.availability_rules (whop_company_id, weekday, start_time, end_time, timezone)
select 'biz_replace_me', weekday, '09:00'::time, '16:30'::time, 'America/Chicago'
from generate_series(1,5) as weekday;

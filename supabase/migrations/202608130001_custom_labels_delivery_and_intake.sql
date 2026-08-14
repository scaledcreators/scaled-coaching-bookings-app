-- Additive customization for businesses that use appointments, visits, or
-- other terminology. Existing companies and sessions keep their current UI.
alter table public.booking_settings
  add column if not exists service_label_singular text not null default 'Session',
  add column if not exists service_label_plural text not null default 'Sessions',
  add column if not exists admin_bookings_label text not null default 'Bookings',
  add column if not exists member_bookings_label text not null default 'My bookings';

alter table public.booking_settings
  drop constraint if exists booking_settings_service_label_singular_check,
  drop constraint if exists booking_settings_service_label_plural_check,
  drop constraint if exists booking_settings_admin_bookings_label_check,
  drop constraint if exists booking_settings_member_bookings_label_check;

alter table public.booking_settings
  add constraint booking_settings_service_label_singular_check
    check (char_length(service_label_singular) between 1 and 30),
  add constraint booking_settings_service_label_plural_check
    check (char_length(service_label_plural) between 1 and 30),
  add constraint booking_settings_admin_bookings_label_check
    check (char_length(admin_bookings_label) between 1 and 40),
  add constraint booking_settings_member_bookings_label_check
    check (char_length(member_bookings_label) between 1 and 40);

alter table public.booking_offers
  add column if not exists delivery_mode text not null default 'decided_later';

alter table public.booking_offers
  drop constraint if exists booking_offers_delivery_mode_check;

alter table public.booking_offers
  add constraint booking_offers_delivery_mode_check
    check (delivery_mode in ('in_person', 'video', 'phone', 'decided_later'));

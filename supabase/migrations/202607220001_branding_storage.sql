-- Per-company appearance is stored as a private JSON document. Brand icons are
-- public assets because they render in the Whop iframe without browser auth.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('coaching-booking-settings', 'coaching-booking-settings', false, 5242880, array['application/json']),
  ('coaching-booking-brand-assets', 'coaching-booking-brand-assets', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

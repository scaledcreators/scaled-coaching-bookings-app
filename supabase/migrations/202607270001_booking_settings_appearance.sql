-- Persist tenant identity and theme beside the rest of the company settings.
-- Existing Storage-backed appearance remains the fallback until a company
-- saves its settings again.
alter table public.booking_settings
  add column if not exists display_name text,
  add column if not exists logo_url text,
  add column if not exists theme_name text,
  add column if not exists theme_primary text,
  add column if not exists theme_accent text,
  add column if not exists theme_highlight text;

alter table public.booking_settings
  drop constraint if exists booking_settings_display_name_length_check,
  drop constraint if exists booking_settings_theme_name_check,
  drop constraint if exists booking_settings_theme_primary_check,
  drop constraint if exists booking_settings_theme_accent_check,
  drop constraint if exists booking_settings_theme_highlight_check;

alter table public.booking_settings
  add constraint booking_settings_display_name_length_check
    check (display_name is null or char_length(display_name) between 1 and 60),
  add constraint booking_settings_theme_name_check
    check (theme_name is null or theme_name in ('Orange','Red','Blue','Pink','Violet','Teal','Emerald','Indigo','Monochrome','Copper','custom')),
  add constraint booking_settings_theme_primary_check
    check (theme_primary is null or theme_primary ~ '^#[0-9a-fA-F]{6}$'),
  add constraint booking_settings_theme_accent_check
    check (theme_accent is null or theme_accent ~ '^#[0-9a-fA-F]{6}$'),
  add constraint booking_settings_theme_highlight_check
    check (theme_highlight is null or theme_highlight ~ '^#[0-9a-fA-F]{6}$');

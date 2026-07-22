-- Correct existing installations created before service-role privileges were
-- declared explicitly. Safe to run more than once.
grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.booking_offers,
  public.coaches,
  public.offer_coaches,
  public.availability_rules,
  public.unavailable_windows,
  public.booking_requests,
  public.booking_holds,
  public.booking_entitlements,
  public.booking_messages,
  public.webhook_events,
  public.experience_installations,
  public.booking_settings
to service_role;

grant execute on function public.is_booking_slot_blocked(text,uuid,uuid,timestamptz,timestamptz,uuid) to service_role;
grant execute on function public.create_booking_request_atomic(text,text,uuid,uuid,text,timestamptz,timestamptz,text,jsonb,text) to service_role;

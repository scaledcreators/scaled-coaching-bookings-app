import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bookingReservesCapacity,
  CAPACITY_RESERVING_STATUSES,
  bookingDatesInTimezone,
  dailyCapacityConflict,
  dateKeyInTimezone,
} from "@/lib/booking-lifecycle";

export async function bookingDayConflict({
  supabase,
  companyId,
  userId,
  startsAt,
  timezone,
  ignoreBookingId,
}: {
  supabase: SupabaseClient;
  companyId: string;
  userId: string;
  startsAt: Date;
  timezone: string;
  ignoreBookingId?: string;
}) {
  const targetDate = dateKeyInTimezone(startsAt, timezone);
  const [settings, override, bookings] = await Promise.all([
    supabase
      .from("booking_settings")
      .select("default_daily_capacity")
      .eq("whop_company_id", companyId)
      .maybeSingle(),
    supabase
      .from("booking_capacity_overrides")
      .select("max_bookings")
      .eq("whop_company_id", companyId)
      .eq("capacity_date", targetDate)
      .maybeSingle(),
    supabase
      .from("booking_requests")
      .select(
        "id,whop_user_id,status,requested_start_at,confirmed_start_at,payment_due_at",
      )
      .eq("whop_company_id", companyId)
      .in("status", [...CAPACITY_RESERVING_STATUSES]),
  ]);
  if (settings.error || override.error || bookings.error) {
    throw settings.error || override.error || bookings.error;
  }

  const sameDay = (bookings.data ?? []).filter((booking) => {
    if (booking.id === ignoreBookingId) return false;
    if (!bookingReservesCapacity(booking)) return false;
    return bookingDatesInTimezone(booking, timezone).includes(targetDate);
  });
  const capacity =
    override.data?.max_bookings ??
    settings.data?.default_daily_capacity ??
    4;
  return dailyCapacityConflict(sameDay, capacity, userId);
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedParts } from "@/lib/availability-time";

const reservingStatuses = [
  "pending_approval",
  "pending_payment",
  "confirmed",
  "reschedule_requested",
  "completed",
  "no_show",
];

function dateKey(value: Date, timezone: string) {
  const parts = zonedParts(value, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

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
  const targetDate = dateKey(startsAt, timezone);
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
      .in("status", reservingStatuses),
  ]);
  if (settings.error || override.error || bookings.error) {
    throw settings.error || override.error || bookings.error;
  }

  const sameDay = (bookings.data ?? []).filter((booking) => {
    if (booking.id === ignoreBookingId) return false;
    if (
      booking.status === "pending_payment" &&
      booking.payment_due_at &&
      new Date(booking.payment_due_at) <= new Date()
    ) {
      return false;
    }
    const start = booking.confirmed_start_at ?? booking.requested_start_at;
    return start && dateKey(new Date(start), timezone) === targetDate;
  });
  if (sameDay.some((booking) => booking.whop_user_id === userId)) {
    return "MEMBER_DAILY_LIMIT" as const;
  }

  const capacity =
    override.data?.max_bookings ??
    settings.data?.default_daily_capacity ??
    4;
  if (sameDay.length >= capacity) return "DAY_AT_CAPACITY" as const;
  return null;
}

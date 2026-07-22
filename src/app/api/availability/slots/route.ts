import { requireRequestViewer } from "@/lib/auth";
import { getApplicableAvailabilityRules } from "@/lib/availability-server";
import {
  buildAvailabilityCandidates,
  zonedParts,
} from "@/lib/availability-time";
import { companyIdForExperience } from "@/lib/data";
import { getSingleActiveCoach } from "@/lib/single-coach";
import { getSupabaseAdmin } from "@/lib/supabase";

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

function monthKey(value: Date, timezone: string) {
  return dateKey(value, timezone).slice(0, 7);
}

function overlaps(
  startsAt: Date,
  endsAt: Date,
  blockedStart: string | null,
  blockedEnd: string | null,
) {
  if (!blockedStart || !blockedEnd) return false;
  return new Date(blockedStart) < endsAt && new Date(blockedEnd) > startsAt;
}

function reservesDay(booking: {
  status: string;
  payment_due_at: string | null;
}) {
  return (
    booking.status !== "pending_payment" ||
    !booking.payment_due_at ||
    new Date(booking.payment_due_at) > new Date()
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const experienceId = url.searchParams.get("experienceId");
    const offerId = url.searchParams.get("offerId");
    const requestedMonth = url.searchParams.get("month");
    if (!experienceId || !offerId) {
      return Response.json(
        { error: "experienceId and offerId are required." },
        { status: 400 },
      );
    }
    if (requestedMonth && !/^\d{4}-\d{2}$/.test(requestedMonth)) {
      return Response.json(
        { error: "month must use YYYY-MM format." },
        { status: 400 },
      );
    }

    const viewer = await requireRequestViewer(request, experienceId);
    const companyId = await companyIdForExperience(experienceId);
    const supabase = getSupabaseAdmin();
    const [{ data: offer, error: offerError }, { data: settings, error: settingsError }] =
      await Promise.all([
        supabase
          .from("booking_offers")
          .select("*")
          .eq("id", offerId)
          .eq("whop_company_id", companyId)
          .eq("status", "published")
          .single(),
        supabase
          .from("booking_settings")
          .select(
            "default_timezone,default_daily_capacity,emergency_paused",
          )
          .eq("whop_company_id", companyId)
          .maybeSingle(),
      ]);
    if (offerError || !offer) throw new Error("Offer not found.");
    if (settingsError) throw settingsError;

    const coach = await getSingleActiveCoach(supabase, companyId);
    const timezone =
      settings?.default_timezone ||
      coach.timezone ||
      process.env.DEFAULT_TIMEZONE ||
      "America/Chicago";
    const now = new Date();
    const earliest = new Date(
      now.getTime() + offer.min_notice_hours * 3_600_000,
    );
    const latest = new Date(
      now.getTime() + offer.max_advance_days * 86_400_000,
    );
    const earliestMonth = monthKey(earliest, timezone);
    const latestMonth = monthKey(latest, timezone);
    const month = requestedMonth ?? earliestMonth;
    if (month < earliestMonth || month > latestMonth) {
      return Response.json({
        month,
        earliestMonth,
        latestMonth,
        timezone,
        days: [],
        slots: [],
      });
    }

    const rules = await getApplicableAvailabilityRules(
      supabase,
      companyId,
      offerId,
      coach.id,
    );
    const candidates = buildAvailabilityCandidates({
      rules,
      now,
      earliest,
      latest,
      durationMinutes: offer.duration_minutes,
      maxAdvanceDays: Math.min(offer.max_advance_days, 366),
      limit: 10_000,
    }).filter((candidate) => monthKey(candidate, timezone) === month);

    if (settings?.emergency_paused || candidates.length === 0) {
      return Response.json({
        month,
        earliestMonth,
        latestMonth,
        timezone,
        days: [],
        slots: [],
      });
    }

    const monthStart = `${month}-01`;
    const [monthYear, monthNumber] = month.split("-").map(Number);
    const nextMonth = `${monthNumber === 12 ? monthYear + 1 : monthYear}-${String(
      monthNumber === 12 ? 1 : monthNumber + 1,
    ).padStart(2, "0")}-01`;
    const [
      { data: overrides, error: overridesError },
      { data: bookings, error: bookingsError },
      { data: windows, error: windowsError },
      { data: holds, error: holdsError },
    ] = await Promise.all([
      supabase
        .from("booking_capacity_overrides")
        .select("capacity_date,max_bookings")
        .eq("whop_company_id", companyId)
        .gte("capacity_date", monthStart)
        .lt("capacity_date", nextMonth),
      supabase
        .from("booking_requests")
        .select(
          "whop_user_id,coach_id,status,requested_start_at,requested_end_at,confirmed_start_at,confirmed_end_at,payment_due_at",
        )
        .eq("whop_company_id", companyId)
        .in("status", reservingStatuses),
      supabase
        .from("unavailable_windows")
        .select("coach_id,offer_id,starts_at,ends_at")
        .eq("whop_company_id", companyId)
        .eq("status", "active"),
      supabase
        .from("booking_holds")
        .select("coach_id,starts_at,ends_at,expires_at")
        .eq("whop_company_id", companyId)
        .gt("expires_at", now.toISOString()),
    ]);
    const queryError =
      overridesError || bookingsError || windowsError || holdsError;
    if (queryError) throw queryError;

    const capacityByDate = new Map(
      (overrides ?? []).map((override) => [
        override.capacity_date,
        override.max_bookings,
      ]),
    );
    const dayCounts = new Map<string, number>();
    const memberDays = new Set<string>();
    const activeBookings = (bookings ?? []).filter(reservesDay);
    for (const booking of activeBookings) {
      const start = booking.confirmed_start_at ?? booking.requested_start_at;
      if (!start) continue;
      const key = dateKey(new Date(start), timezone);
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
      if (booking.whop_user_id === viewer.userId) memberDays.add(key);
    }

    const slotsByDate = new Map<string, string[]>();
    for (const candidate of candidates) {
      const key = dateKey(candidate, timezone);
      const dailyCapacity =
        capacityByDate.get(key) ?? settings?.default_daily_capacity ?? 4;
      if ((dayCounts.get(key) ?? 0) >= dailyCapacity || memberDays.has(key)) {
        continue;
      }

      const slotEnd = new Date(
        candidate.getTime() + offer.duration_minutes * 60_000,
      );
      const blockedStart = new Date(
        candidate.getTime() - offer.buffer_before_minutes * 60_000,
      );
      const blockedEnd = new Date(
        slotEnd.getTime() + offer.buffer_after_minutes * 60_000,
      );
      const blockedByWindow = (windows ?? []).some(
        (window) =>
          (window.offer_id === null || window.offer_id === offerId) &&
          (window.coach_id === null || window.coach_id === coach.id) &&
          overlaps(blockedStart, blockedEnd, window.starts_at, window.ends_at),
      );
      const blockedByBooking = activeBookings.some(
        (booking) =>
          (booking.coach_id === null || booking.coach_id === coach.id) &&
          overlaps(
            blockedStart,
            blockedEnd,
            booking.confirmed_start_at ?? booking.requested_start_at,
            booking.confirmed_end_at ?? booking.requested_end_at,
          ),
      );
      const blockedByHold = (holds ?? []).some(
        (hold) =>
          (hold.coach_id === null || hold.coach_id === coach.id) &&
          overlaps(blockedStart, blockedEnd, hold.starts_at, hold.ends_at),
      );
      if (blockedByWindow || blockedByBooking || blockedByHold) continue;

      slotsByDate.set(key, [
        ...(slotsByDate.get(key) ?? []),
        candidate.toISOString(),
      ]);
    }

    const days = [...slotsByDate.entries()].map(([date, slots]) => ({
      date,
      slots,
      capacity:
        capacityByDate.get(date) ?? settings?.default_daily_capacity ?? 4,
      bookedCount: dayCounts.get(date) ?? 0,
    }));

    return Response.json({
      month,
      earliestMonth,
      latestMonth,
      timezone,
      days,
      slots: days.flatMap((day) => day.slots),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not calculate availability.",
      },
      { status: 400 },
    );
  }
}

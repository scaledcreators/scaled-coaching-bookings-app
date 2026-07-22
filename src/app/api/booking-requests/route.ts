import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getApplicableAvailabilityRules } from "@/lib/availability-server";
import { slotFitsAvailability } from "@/lib/availability-time";
import { notifyCoachOfRequest } from "@/lib/booking-notifications";
import { companyIdForExperience } from "@/lib/data";
import { getSingleActiveCoach } from "@/lib/single-coach";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.object({
  experienceId: z.string().startsWith("exp_"),
  companyId: z.string().startsWith("biz_"),
  offerId: z.string().uuid(),
  startsAt: z.iso.datetime(),
  timezone: z.string().min(1).max(100),
  intakeAnswers: z.record(z.string(), z.unknown()).default({}),
  memberNote: z.string().max(2000).optional().default(""),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const viewer = await requireRequestViewer(request, input.experienceId);
    const mappedCompanyId = await companyIdForExperience(input.experienceId);
    if (mappedCompanyId !== input.companyId) {
      return Response.json(
        { error: "Experience does not belong to this company." },
        { status: 403 },
      );
    }

    const supabase = getSupabaseAdmin();
    const [
      { data: settings, error: settingsError },
      { data: offer, error: offerError },
    ] = await Promise.all([
      supabase
        .from("booking_settings")
        .select("emergency_paused,default_timezone")
        .eq("whop_company_id", input.companyId)
        .maybeSingle(),
      supabase
        .from("booking_offers")
        .select("*")
        .eq("id", input.offerId)
        .eq("whop_company_id", input.companyId)
        .eq("status", "published")
        .single(),
    ]);

    if (settingsError || offerError || !offer) {
      throw new Error("This offer is not available.");
    }
    if (settings?.emergency_paused) {
      return Response.json(
        { error: "New bookings are temporarily paused." },
        { status: 409 },
      );
    }

    const coach = await getSingleActiveCoach(supabase, input.companyId);
    const bookingTimezone = settings?.default_timezone || coach.timezone;

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(
      startsAt.getTime() + offer.duration_minutes * 60_000,
    );
    const earliest = Date.now() + offer.min_notice_hours * 3_600_000;
    const latest = Date.now() + offer.max_advance_days * 86_400_000;
    if (startsAt.getTime() < earliest || startsAt.getTime() > latest) {
      return Response.json(
        { error: "That time is outside this offer’s booking window." },
        { status: 409 },
      );
    }

    const rules = await getApplicableAvailabilityRules(
      supabase,
      input.companyId,
      input.offerId,
      coach.id,
    );
    if (!slotFitsAvailability(startsAt, endsAt, rules)) {
      return Response.json(
        { error: "That time is outside the coach’s available hours." },
        { status: 409 },
      );
    }

    const blockedStartsAt = new Date(
      startsAt.getTime() - offer.buffer_before_minutes * 60_000,
    );
    const blockedEndsAt = new Date(
      endsAt.getTime() + offer.buffer_after_minutes * 60_000,
    );
    const { data: blocked, error: blockedError } = await supabase.rpc(
      "is_booking_slot_blocked",
      {
        p_company_id: input.companyId,
        p_offer_id: input.offerId,
        p_coach_id: coach.id,
        p_starts_at: blockedStartsAt.toISOString(),
        p_ends_at: blockedEndsAt.toISOString(),
        p_ignore_booking_id: null,
      },
    );
    if (blockedError) throw blockedError;
    if (blocked) {
      return Response.json(
        {
          error:
            "That time was just taken or is unavailable. Choose another time.",
        },
        { status: 409 },
      );
    }

    const { data: bookingId, error: bookingCreateError } = await supabase.rpc(
      "create_booking_request_atomic",
      {
        p_company_id: input.companyId,
        p_user_id: viewer.userId,
        p_experience_id: input.experienceId,
        p_offer_id: input.offerId,
        p_coach_id: coach.id,
        p_status: "pending_approval",
        p_starts_at: startsAt.toISOString(),
        p_ends_at: endsAt.toISOString(),
        p_timezone: bookingTimezone,
        p_intake_answers: input.intakeAnswers,
        p_member_note: input.memberNote,
      },
    );
    if (bookingCreateError) {
      if (bookingCreateError.message.includes("SLOT_UNAVAILABLE")) {
        return Response.json(
          {
            error:
              "That time was just taken or is unavailable. Choose another time.",
          },
          { status: 409 },
        );
      }
      if (bookingCreateError.message.includes("DAY_AT_CAPACITY")) {
        return Response.json(
          { error: "That day has reached its booking capacity." },
          { status: 409 },
        );
      }
      if (bookingCreateError.message.includes("MEMBER_DAILY_LIMIT")) {
        return Response.json(
          {
            error:
              "You already have a booking on that day. Choose another date.",
          },
          { status: 409 },
        );
      }
      throw bookingCreateError;
    }

    const { data: booking, error: bookingError } = await supabase
      .from("booking_requests")
      .select(
        "*, booking_offers(title,duration_minutes,price_cents,access_mode)",
      )
      .eq("id", bookingId)
      .single();
    if (bookingError || !booking) {
      throw bookingError ?? new Error("Booking could not be loaded.");
    }

    const paid = offer.access_mode === "paid" && offer.price_cents > 0;
    await supabase.from("booking_messages").insert({
      booking_request_id: booking.id,
      sender: "system",
      body: paid
        ? "Booking request submitted for coach approval. No payment has been collected."
        : "Free booking request submitted for coach approval.",
    });
    await notifyCoachOfRequest({
      companyId: input.companyId,
      offerTitle: offer.title,
      requestedStart: startsAt.toISOString(),
    });

    return Response.json({ booking }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create booking request.",
      },
      { status: 400 },
    );
  }
}

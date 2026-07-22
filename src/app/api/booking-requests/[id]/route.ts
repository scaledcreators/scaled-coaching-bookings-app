import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getApplicableAvailabilityRules } from "@/lib/availability-server";
import { slotFitsAvailability } from "@/lib/availability-time";
import { bookingDayConflict } from "@/lib/booking-capacity";
import { getSingleActiveCoach } from "@/lib/single-coach";
import { getSupabaseAdmin } from "@/lib/supabase";

const statuses = [
  "reschedule_requested",
  "cancelled",
  "completed",
  "no_show",
] as const;
const schema = z
  .object({
    companyId: z.string().startsWith("biz_"),
    status: z.enum(statuses).optional(),
    requestedStartAt: z.iso.datetime().optional(),
    meetingLocation: z.string().max(500).optional(),
    meetingUrl: z.url().or(z.literal("")).optional(),
    joinInstructions: z.string().max(2000).optional(),
    adminNote: z.string().max(2000).optional(),
    refundStatus: z.literal("declined").optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "companyId"),
    "No changes were supplied.",
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    await requireRequestViewer(request, input.companyId, true);
    const supabase = getSupabaseAdmin();
    const coach = await getSingleActiveCoach(supabase, input.companyId);
    const { data: existing, error: existingError } = await supabase
      .from("booking_requests")
      .select("*")
      .eq("id", id)
      .eq("whop_company_id", input.companyId)
      .single();
    if (existingError || !existing) throw new Error("Booking not found.");

    if (input.status === "completed" && existing.status !== "confirmed") {
      return Response.json(
        { error: "Only confirmed bookings can be completed." },
        { status: 409 },
      );
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      coach_id: coach.id,
    };
    if (input.status !== undefined) update.status = input.status;
    if (input.meetingLocation !== undefined)
      update.meeting_location = input.meetingLocation;
    if (input.meetingUrl !== undefined) update.meeting_url = input.meetingUrl;
    if (input.joinInstructions !== undefined)
      update.manual_join_instructions = input.joinInstructions;
    if (input.adminNote !== undefined)
      update.admin_note = input.adminNote || null;
    if (input.refundStatus !== undefined)
      update.refund_status = input.refundStatus;

    if (input.requestedStartAt !== undefined) {
      const [{ data: offer, error: offerError }, { data: settings }] =
        await Promise.all([
          supabase
            .from("booking_offers")
            .select(
              "duration_minutes,buffer_before_minutes,buffer_after_minutes",
            )
            .eq("id", existing.offer_id)
            .eq("whop_company_id", input.companyId)
            .single(),
          supabase
            .from("booking_settings")
            .select("default_timezone")
            .eq("whop_company_id", input.companyId)
            .maybeSingle(),
        ]);
      if (offerError || !offer) throw new Error("Offer not found.");
      const start = new Date(input.requestedStartAt);
      const end = new Date(
        start.getTime() + offer.duration_minutes * 60_000,
      );
      const timezone = settings?.default_timezone || coach.timezone;
      const conflict = await bookingDayConflict({
        supabase,
        companyId: input.companyId,
        userId: existing.whop_user_id,
        startsAt: start,
        timezone,
        ignoreBookingId: id,
      });
      if (conflict === "MEMBER_DAILY_LIMIT") {
        return Response.json(
          { error: "This customer already has a booking on that day." },
          { status: 409 },
        );
      }
      if (conflict === "DAY_AT_CAPACITY") {
        return Response.json(
          { error: "That day has reached its booking capacity." },
          { status: 409 },
        );
      }
      const rules = await getApplicableAvailabilityRules(
        supabase,
        input.companyId,
        existing.offer_id,
        coach.id,
      );
      if (!slotFitsAvailability(start, end, rules)) {
        return Response.json(
          { error: "That proposed time is outside available hours." },
          { status: 409 },
        );
      }
      const { data: blocked, error: blockedError } = await supabase.rpc(
        "is_booking_slot_blocked",
        {
          p_company_id: input.companyId,
          p_offer_id: existing.offer_id,
          p_coach_id: coach.id,
          p_starts_at: new Date(
            start.getTime() - offer.buffer_before_minutes * 60_000,
          ).toISOString(),
          p_ends_at: new Date(
            end.getTime() + offer.buffer_after_minutes * 60_000,
          ).toISOString(),
          p_ignore_booking_id: id,
        },
      );
      if (blockedError) throw blockedError;
      if (blocked) {
        return Response.json(
          { error: "That proposed time is unavailable." },
          { status: 409 },
        );
      }
      update.requested_start_at = start.toISOString();
      update.requested_end_at = end.toISOString();
      update.status = input.status ?? "reschedule_requested";
    }

    const { data, error } = await supabase
      .from("booking_requests")
      .update(update)
      .eq("id", id)
      .eq("whop_company_id", input.companyId)
      .select(
        "*, booking_offers(title,duration_minutes,price_cents,access_mode)",
      )
      .single();
    if (error) throw error;
    const changes = [
      input.status ? `status changed to ${input.status}` : null,
      input.requestedStartAt ? "a new time was proposed" : null,
      input.meetingLocation !== undefined || input.meetingUrl !== undefined
        ? "meeting details updated"
        : null,
      input.refundStatus ? "refund request declined" : null,
    ]
      .filter(Boolean)
      .join("; ");
    await supabase.from("booking_messages").insert({
      booking_request_id: id,
      sender: "system",
      body: `Booking ${changes}.`,
    });
    return Response.json({ booking: data });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update booking.",
      },
      { status: 400 },
    );
  }
}

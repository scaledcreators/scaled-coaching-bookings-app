import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getApplicableAvailabilityRules } from "@/lib/availability-server";
import { slotFitsAvailability } from "@/lib/availability-time";
import { companyIdForExperience } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";
import { whop } from "@/lib/whop";

const schema = z.discriminatedUnion("action", [
  z.object({
    experienceId: z.string().startsWith("exp_"),
    action: z.literal("cancel"),
  }),
  z.object({
    experienceId: z.string().startsWith("exp_"),
    action: z.literal("reschedule"),
    startsAt: z.iso.datetime(),
  }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    const viewer = await requireRequestViewer(request, input.experienceId);
    const companyId = await companyIdForExperience(input.experienceId);
    const supabase = getSupabaseAdmin();
    const { data: booking, error } = await supabase
      .from("booking_requests")
      .select(
        "*, booking_offers(title,duration_minutes,price_cents,access_mode,min_notice_hours,max_advance_days,buffer_before_minutes,buffer_after_minutes)",
      )
      .eq("id", id)
      .eq("whop_company_id", companyId)
      .eq("whop_user_id", viewer.userId)
      .eq("whop_experience_id", input.experienceId)
      .single();
    if (error || !booking || !booking.booking_offers) {
      throw new Error("Booking not found.");
    }
    if (
      ["completed", "no_show", "rejected", "expired", "cancelled"].includes(
        booking.status,
      )
    ) {
      return Response.json(
        { error: "This booking can no longer be changed." },
        { status: 409 },
      );
    }

    if (input.action === "cancel") {
      if (booking.whop_payment_id) {
        return Response.json(
          {
            error:
              "Paid bookings must be cancelled through Request a refund.",
          },
          { status: 409 },
        );
      }
      const now = new Date().toISOString();
      const { data, error: updateError } = await supabase
        .from("booking_requests")
        .update({
          status: "cancelled",
          payment_due_at: null,
          payment_checkout_url: null,
          checkout_creation_token: null,
          checkout_creation_started_at: null,
          updated_at: now,
        })
        .eq("id", id)
        .eq("status", booking.status)
        .select(
          "*, booking_offers(title,duration_minutes,price_cents,access_mode)",
        )
        .single();
      if (updateError) throw updateError;

      if (booking.whop_checkout_configuration_id) {
        await whop.checkoutConfigurations
          .delete(booking.whop_checkout_configuration_id)
          .catch(() => undefined);
      }
      await supabase.from("booking_messages").insert({
        booking_request_id: id,
        sender: "member",
        body: "Member cancelled the booking. No payment was collected.",
      });
      return Response.json({ booking: data });
    }

    if (booking.status !== "confirmed") {
      return Response.json(
        {
          error:
            "Cancel this request and choose another time if it has not been confirmed yet.",
        },
        { status: 409 },
      );
    }

    const start = new Date(input.startsAt);
    const offer = booking.booking_offers;
    const earliest = Date.now() + offer.min_notice_hours * 3_600_000;
    const latest = Date.now() + offer.max_advance_days * 86_400_000;
    if (start.getTime() < earliest || start.getTime() > latest) {
      return Response.json(
        { error: "That time is outside the booking window." },
        { status: 409 },
      );
    }

    const end = new Date(start.getTime() + offer.duration_minutes * 60_000);
    const rules = await getApplicableAvailabilityRules(
      supabase,
      companyId,
      booking.offer_id,
      booking.coach_id,
    );
    if (!slotFitsAvailability(start, end, rules)) {
      return Response.json(
        { error: "That time is outside the coach’s available hours." },
        { status: 409 },
      );
    }

    const { error: rescheduleError } = await supabase.rpc(
      "reschedule_booking_request_atomic",
      {
        p_booking_id: id,
        p_company_id: companyId,
        p_user_id: viewer.userId,
        p_starts_at: start.toISOString(),
        p_ends_at: end.toISOString(),
        p_timezone: booking.timezone || "America/Chicago",
      },
    );
    if (rescheduleError?.message.includes("MEMBER_DAILY_LIMIT")) {
      return Response.json(
        { error: "You already have another booking on that day." },
        { status: 409 },
      );
    }
    if (rescheduleError?.message.includes("DAY_AT_CAPACITY")) {
      return Response.json(
        { error: "That day has reached its booking capacity." },
        { status: 409 },
      );
    }
    if (rescheduleError?.message.includes("SLOT_UNAVAILABLE")) {
      return Response.json(
        { error: "That time is unavailable." },
        { status: 409 },
      );
    }
    if (rescheduleError) throw rescheduleError;

    const { data, error: updateError } = await supabase
      .from("booking_requests")
      .select(
        "*, booking_offers(title,duration_minutes,price_cents,access_mode)",
      )
      .eq("id", id)
      .eq("whop_company_id", companyId)
      .single();
    if (updateError || !data) throw updateError ?? new Error("Booking not found.");

    await supabase.from("booking_messages").insert({
      booking_request_id: id,
      sender: "member",
      body: `Member requested a new time: ${start.toISOString()}.`,
    });
    return Response.json({ booking: data });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not change booking.",
      },
      { status: 400 },
    );
  }
}

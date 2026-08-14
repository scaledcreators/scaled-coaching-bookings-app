import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { notifyBookingCustomer } from "@/lib/booking-notifications";
import { getSingleActiveCoach } from "@/lib/single-coach";
import { getSupabaseAdmin } from "@/lib/supabase";
import { whop } from "@/lib/whop";

const PAYMENT_WINDOW_HOURS = 24;
const PAYMENT_CUTOFF_BEFORE_SESSION_MINUTES = 60;

const schema = z.object({
  companyId: z.string().startsWith("biz_"),
  action: z.enum(["approve", "reject"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    await requireRequestViewer(request, input.companyId, true);
    const supabase = getSupabaseAdmin();

    const { data: booking, error: bookingError } = await supabase
      .from("booking_requests")
      .select("*, booking_offers(*)")
      .eq("id", id)
      .eq("whop_company_id", input.companyId)
      .single();
    if (bookingError || !booking || !booking.booking_offers) {
      throw new Error("Booking not found.");
    }
    if (!["pending_approval", "reschedule_requested"].includes(booking.status)) {
      return Response.json(
        { error: "This request has already been decided." },
        { status: 409 },
      );
    }

    const isPaidReschedule =
      booking.status === "reschedule_requested" && booking.whop_payment_id;

    if (input.action === "reject") {
      const now = new Date().toISOString();
      const legacyPaidRequest = !isPaidReschedule && booking.whop_payment_id;
      if (legacyPaidRequest) {
        try {
          await whop.payments.refund(booking.whop_payment_id);
        } catch {
          return Response.json(
            {
              error:
                "This request was paid under the previous flow, and Whop could not start its refund. The request was not rejected; retry or refund it manually.",
            },
            { status: 502 },
          );
        }
      }
      const update = isPaidReschedule
        ? {
            status: "confirmed",
            requested_start_at: booking.confirmed_start_at,
            requested_end_at: booking.confirmed_end_at,
            updated_at: now,
          }
        : {
            status: "rejected",
            rejected_at: now,
            ...(legacyPaidRequest ? { refund_status: "processing" } : {}),
            updated_at: now,
          };
      const { data, error } = await supabase
        .from("booking_requests")
        .update(update)
        .eq("id", id)
        .eq("status", booking.status)
        .select(
          "*, booking_offers(title,duration_minutes,price_cents,access_mode,delivery_mode)",
        )
        .single();
      if (error || !data) {
        return Response.json(
          { error: "This request was changed by someone else. Refresh and retry." },
          { status: 409 },
        );
      }

      await supabase.from("booking_messages").insert({
        booking_request_id: id,
        sender: "admin",
        body: isPaidReschedule
          ? "The requested time change was rejected. The original session remains confirmed."
          : legacyPaidRequest
            ? "The legacy prepaid request was rejected and its Whop payment is being refunded."
          : "The booking request was rejected. No payment was collected.",
      });
      await notifyBookingCustomer({
        bookingId: id,
        companyId: input.companyId,
        experienceId: booking.whop_experience_id,
        userId: booking.whop_user_id,
        eventKey: isPaidReschedule
          ? "reschedule_rejected"
          : "request_rejected",
        kind: isPaidReschedule
          ? "reschedule_rejected"
          : legacyPaidRequest
            ? "legacy_request_rejected"
            : "request_rejected",
        context: { offerTitle: booking.booking_offers.title },
      });

      return Response.json({ booking: data });
    }

    const coach = await getSingleActiveCoach(supabase, input.companyId);

    const offer = booking.booking_offers;
    const willRequirePayment =
      offer.access_mode === "paid" &&
      offer.price_cents > 0 &&
      !booking.whop_payment_id;
    const fullPaymentWindow = Date.now() + PAYMENT_WINDOW_HOURS * 3_600_000;
    const beforeSessionCutoff =
      new Date(booking.requested_start_at).getTime() -
      PAYMENT_CUTOFF_BEFORE_SESSION_MINUTES * 60_000;
    const paymentDueAt = new Date(
      willRequirePayment
        ? Math.min(fullPaymentWindow, beforeSessionCutoff)
        : fullPaymentWindow,
    );
    if (willRequirePayment && paymentDueAt.getTime() <= Date.now()) {
      return Response.json(
        {
          error:
            "This paid session is too close to start a safe payment window. Propose a later time or reject the request.",
        },
        { status: 409 },
      );
    }
    const { error: approvalError } = await supabase.rpc(
      "approve_booking_request_atomic",
      {
        p_booking_id: id,
        p_company_id: input.companyId,
        p_coach_id: coach.id,
        p_payment_due_at: paymentDueAt.toISOString(),
      },
    );
    if (approvalError?.message.includes("SLOT_UNAVAILABLE")) {
      return Response.json(
        {
          error:
            "That time is no longer available. Propose a new time instead.",
        },
        { status: 409 },
      );
    }
    if (approvalError) throw approvalError;

    const { data, error } = await supabase
      .from("booking_requests")
      .select(
        "*, booking_offers(title,duration_minutes,price_cents,access_mode,delivery_mode)",
      )
      .eq("id", id)
      .single();
    if (error || !data) {
      return Response.json(
        { error: "This request was changed by someone else. Refresh and retry." },
        { status: 409 },
      );
    }
    const requiresPayment = data.status === "pending_payment";

    await supabase.from("booking_messages").insert({
      booking_request_id: id,
      sender: "admin",
      body: requiresPayment
        ? `Request approved. Payment is due by ${data.payment_due_at}.`
        : "Request approved and booking confirmed.",
    });
    await notifyBookingCustomer({
      bookingId: id,
      companyId: input.companyId,
      experienceId: booking.whop_experience_id,
      userId: booking.whop_user_id,
      eventKey: requiresPayment ? "request_approved_payment" : "request_confirmed",
      kind: requiresPayment ? "request_approved_payment" : "request_confirmed",
      context: {
        offerTitle: offer.title,
        paymentDueAt: data.payment_due_at,
        timezone: data.timezone,
        startsAt: data.confirmed_start_at ?? data.requested_start_at,
      },
    });

    return Response.json({ booking: data });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not decide this request.",
      },
      { status: 400 },
    );
  }
}

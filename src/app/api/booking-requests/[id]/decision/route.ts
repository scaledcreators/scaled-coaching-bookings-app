import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { notifyCustomer } from "@/lib/booking-notifications";
import { getSupabaseAdmin } from "@/lib/supabase";
import { whop } from "@/lib/whop";

const PAYMENT_WINDOW_HOURS = 24;
const PAYMENT_CUTOFF_BEFORE_SESSION_MINUTES = 60;

const schema = z.object({
  companyId: z.string().startsWith("biz_"),
  action: z.enum(["approve", "reject"]),
  coachId: z.string().uuid().nullable().optional(),
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
          "*, booking_offers(title,duration_minutes,price_cents,access_mode)",
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
      await notifyCustomer({
        experienceId: booking.whop_experience_id,
        userId: booking.whop_user_id,
        title: isPaidReschedule
          ? "Time change not approved"
          : "Coaching request update",
        subtitle: booking.booking_offers.title,
        content: isPaidReschedule
          ? "Your original confirmed session is unchanged. Open Coaching Bookings for details."
          : legacyPaidRequest
            ? "This request was paid under the previous flow. It wasn’t approved, and the payment is being returned through Whop."
          : "Your coach couldn’t approve this request. No payment was taken.",
      });

      return Response.json({ booking: data });
    }

    const coachId = input.coachId ?? booking.coach_id;
    if (!coachId) {
      return Response.json(
        { error: "Assign a coach before approving this request." },
        { status: 409 },
      );
    }
    const { data: coach } = await supabase
      .from("coaches")
      .select("id")
      .eq("id", coachId)
      .eq("whop_company_id", input.companyId)
      .eq("status", "active")
      .maybeSingle();
    if (!coach) {
      return Response.json(
        { error: "That coach is not available." },
        { status: 409 },
      );
    }

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
        p_coach_id: coachId,
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
        "*, booking_offers(title,duration_minutes,price_cents,access_mode)",
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
    await notifyCustomer({
      experienceId: booking.whop_experience_id,
      userId: booking.whop_user_id,
      title: requiresPayment
        ? "Your coaching request was approved"
        : "Your coaching session is confirmed",
      subtitle: offer.title,
      content: requiresPayment
        ? `Complete payment by ${new Date(data.payment_due_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} to confirm your time.`
        : "Open Coaching Bookings to view your confirmed session.",
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

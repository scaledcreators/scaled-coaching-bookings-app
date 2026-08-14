import { waitUntil } from "@vercel/functions";
import { notifyBookingCustomer } from "@/lib/booking-notifications";
import { getSupabaseAdmin } from "@/lib/supabase";
import { whop } from "@/lib/whop";

type EventObject = {
  id?: string;
  status?: string;
  metadata?: Record<string, string>;
  payment?: EventObject;
};
type WhopEvent = {
  id?: string;
  type: string;
  company_id?: string;
  data: EventObject;
};

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    const event = whop.webhooks.unwrap(raw, {
      headers: Object.fromEntries(request.headers),
    }) as unknown as WhopEvent;
    const eventId = request.headers.get("webhook-id") || event.id;
    if (!eventId) return new Response("Missing webhook id", { status: 400 });
    waitUntil(processEvent(eventId, event));
    return new Response("OK");
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }
}

async function processEvent(eventId: string, event: WhopEvent) {
  const supabase = getSupabaseAdmin();
  const existing = await supabase
    .from("webhook_events")
    .select("processed_at")
    .eq("event_id", eventId)
    .maybeSingle();
  if (existing.data?.processed_at) return;

  const stored = await supabase.from("webhook_events").upsert(
    {
      event_id: eventId,
      whop_company_id: event.company_id ?? null,
      event_type: event.type,
      payload: event,
    },
    { onConflict: "event_id" },
  );
  if (stored.error) throw stored.error;

  const payment = event.data.payment ?? event.data;
  const metadata = payment.metadata ?? event.data.metadata ?? {};
  let bookingId = metadata.booking_request_id;
  const paymentId = event.type.startsWith("refund.")
    ? payment.id
    : payment.id ?? event.data.id;
  if (!bookingId && paymentId) {
    const lookup = await supabase
      .from("booking_requests")
      .select("id")
      .eq("whop_payment_id", paymentId)
      .maybeSingle();
    bookingId = lookup.data?.id;
  }

  const offerId = metadata.offer_id;
  const userId = metadata.whop_user_id;
  const companyId = metadata.whop_company_id || event.company_id;
  let acceptPaymentEntitlement = true;

  if (
    ["payment.succeeded", "invoice.paid"].includes(event.type) &&
    bookingId
  ) {
    const { data: booking } = await supabase
      .from("booking_requests")
      .select(
        "*, booking_offers(title,duration_minutes,price_cents,access_mode,delivery_mode)",
      )
      .eq("id", bookingId)
      .maybeSingle();

    const refundDuplicatePayment = async () => {
      if (!paymentId || !booking) return;
      acceptPaymentEntitlement = false;
      let refunded = false;
      try {
        await whop.payments.refund(paymentId);
        refunded = true;
      } catch (error) {
        console.error("Duplicate booking payment could not be refunded", error);
      }
      await supabase.from("booking_messages").insert({
        booking_request_id: bookingId,
        sender: "system",
        body: refunded
          ? "A duplicate payment was detected and automatically refunded."
          : `A duplicate payment (${paymentId}) requires manual refund review.`,
      });
      await notifyBookingCustomer({
        bookingId,
        companyId: booking.whop_company_id,
        experienceId: booking.whop_experience_id,
        userId: booking.whop_user_id,
        eventKey: `duplicate_payment:${paymentId}:${refunded ? "refunded" : "review"}`,
        kind: refunded
          ? "duplicate_payment_refunded"
          : "duplicate_payment_review",
        context: { offerTitle: booking.booking_offers?.title },
      });
    };

    if (
      booking?.status === "confirmed" &&
      booking.whop_payment_id &&
      paymentId &&
      booking.whop_payment_id !== paymentId
    ) {
      await refundDuplicatePayment();
    }

    if (booking && ["pending_payment", "expired"].includes(booking.status)) {
      const now = new Date();
      const deadline = booking.payment_due_at
        ? new Date(booking.payment_due_at)
        : null;
      if (
        booking.status === "expired" ||
        !deadline ||
        deadline.getTime() <= now.getTime()
      ) {
        acceptPaymentEntitlement = false;
        let refundStatus = "failed";
        if (paymentId) {
          try {
            await whop.payments.refund(paymentId);
            refundStatus = "processing";
          } catch (error) {
            console.error("Late booking payment could not be refunded", error);
          }
        }
        await supabase
          .from("booking_requests")
          .update({
            status: "expired",
            expired_at: booking.expired_at ?? now.toISOString(),
            whop_payment_id: paymentId ?? null,
            refund_status: refundStatus,
            updated_at: now.toISOString(),
          })
          .eq("id", bookingId)
          .in("status", ["pending_payment", "expired"]);
        await supabase.from("booking_messages").insert({
          booking_request_id: bookingId,
          sender: "system",
          body:
            refundStatus === "processing"
              ? "Payment arrived after the deadline and was automatically refunded."
              : "Payment arrived after the deadline and requires manual refund review.",
        });
        await notifyBookingCustomer({
          bookingId,
          companyId: booking.whop_company_id,
          experienceId: booking.whop_experience_id,
          userId: booking.whop_user_id,
          eventKey: `late_payment:${paymentId}:${refundStatus}`,
          kind:
            refundStatus === "processing"
              ? "late_payment_refunded"
              : "late_payment_review",
          context: { offerTitle: booking.booking_offers?.title },
        });
      } else {
        const { data: confirmed } = await supabase
          .from("booking_requests")
          .update({
            status: "confirmed",
            confirmed_start_at: booking.requested_start_at,
            confirmed_end_at: booking.requested_end_at,
            whop_payment_id: paymentId ?? null,
            payment_due_at: null,
            payment_checkout_url: null,
            checkout_creation_token: null,
            checkout_creation_started_at: null,
            updated_at: now.toISOString(),
          })
          .eq("id", bookingId)
          .eq("status", "pending_payment")
          .select("id")
          .maybeSingle();
        if (confirmed) {
          if (booking.whop_checkout_configuration_id) {
            await whop.checkoutConfigurations
              .delete(booking.whop_checkout_configuration_id)
              .catch((error) =>
                console.error(
                  "Completed booking checkout could not be disabled",
                  error,
                ),
              );
          }
          await supabase.from("booking_messages").insert({
            booking_request_id: bookingId,
            sender: "system",
            body: "Whop payment succeeded. The booking is confirmed.",
          });
          await notifyBookingCustomer({
            bookingId,
            companyId: booking.whop_company_id,
            experienceId: booking.whop_experience_id,
            userId: booking.whop_user_id,
            eventKey: "payment_confirmed",
            kind: "payment_confirmed",
            context: {
              offerTitle: booking.booking_offers?.title,
              startsAt: booking.requested_start_at,
              timezone: booking.timezone,
            },
          });
        } else if (paymentId) {
          const { data: latest } = await supabase
            .from("booking_requests")
            .select("status,whop_payment_id")
            .eq("id", bookingId)
            .maybeSingle();
          if (
            latest?.status === "confirmed" &&
            latest.whop_payment_id &&
            latest.whop_payment_id !== paymentId
          ) {
            await refundDuplicatePayment();
          }
        }
      }
    }
  }

  if (event.type === "payment.failed" && bookingId) {
    await supabase.from("booking_messages").insert({
      booking_request_id: bookingId,
      sender: "system",
      body: "A Whop payment attempt failed. The payment window remains open until its deadline.",
    });
    const { data: failedBooking } = await supabase
      .from("booking_requests")
      .select("*, booking_offers(title)")
      .eq("id", bookingId)
      .maybeSingle();
    if (failedBooking) {
      await notifyBookingCustomer({
        bookingId,
        companyId: failedBooking.whop_company_id,
        experienceId: failedBooking.whop_experience_id,
        userId: failedBooking.whop_user_id,
        eventKey: `payment_failed:${eventId}`,
        kind: "payment_failed",
        context: {
          offerTitle: failedBooking.booking_offers?.title,
          paymentDueAt: failedBooking.payment_due_at,
          timezone: failedBooking.timezone,
        },
      });
    }
  }

  if (event.type.startsWith("refund.") && bookingId) {
    const { data: refundBooking } = await supabase
      .from("booking_requests")
      .select("*, booking_offers(title)")
      .eq("id", bookingId)
      .maybeSingle();
    const refundStatus = /succeed|complete|refunded/.test(
      event.data.status ?? "",
    )
      ? "refunded"
      : /fail|declin/.test(event.data.status ?? "")
        ? "failed"
        : "processing";
    await supabase
      .from("booking_requests")
      .update({
        status:
          refundBooking?.status === "expired" ||
          refundBooking?.status === "rejected"
            ? refundBooking.status
            : "cancelled",
        refund_status: refundStatus,
        whop_refund_id: event.data.id ?? null,
        refunded_at:
          refundStatus === "refunded" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);
    if (refundBooking) {
      await notifyBookingCustomer({
        bookingId,
        companyId: refundBooking.whop_company_id,
        experienceId: refundBooking.whop_experience_id,
        userId: refundBooking.whop_user_id,
        eventKey: `refund:${event.data.id ?? eventId}:${refundStatus}`,
        kind:
          refundStatus === "refunded"
            ? "refund_refunded"
            : refundStatus === "failed"
              ? "refund_failed"
              : "refund_processing",
        context: { offerTitle: refundBooking.booking_offers?.title },
      });
    }
  }
  if (event.type === "dispute.created" && bookingId) {
    await supabase
      .from("booking_requests")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", bookingId);
  }

  if (
    ["payment.succeeded", "invoice.paid", "membership.activated"].includes(
      event.type,
    ) &&
    companyId &&
    userId &&
    (acceptPaymentEntitlement || event.type === "membership.activated")
  ) {
    await supabase.from("booking_entitlements").upsert(
      {
        whop_company_id: companyId,
        whop_user_id: userId,
        offer_id: offerId || null,
        status: "active",
        source: event.type.startsWith("membership")
          ? "membership"
          : "payment",
        whop_payment_id: paymentId ?? null,
        whop_membership_id: event.type.startsWith("membership")
          ? event.data.id
          : null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "whop_company_id,whop_user_id,offer_id,source",
      },
    );
  }
  if (
    [
      "refund.created",
      "refund.updated",
      "dispute.created",
      "membership.deactivated",
    ].includes(event.type) &&
    companyId &&
    userId
  ) {
    await supabase
      .from("booking_entitlements")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("whop_company_id", companyId)
      .eq("whop_user_id", userId)
      .eq("offer_id", offerId || null);
  }

  const done = await supabase
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", eventId);
  if (done.error) throw done.error;
}

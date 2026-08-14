import type { BookingSettings } from "@/lib/types";

export type BookingNotificationKind =
  | "request_rejected"
  | "reschedule_rejected"
  | "legacy_request_rejected"
  | "request_approved_payment"
  | "request_confirmed"
  | "booking_cancelled"
  | "booking_no_show"
  | "booking_completed"
  | "payment_expired"
  | "payment_failed"
  | "payment_confirmed"
  | "duplicate_payment_refunded"
  | "duplicate_payment_review"
  | "late_payment_refunded"
  | "late_payment_review"
  | "refund_processing"
  | "refund_refunded"
  | "refund_failed"
  | "refund_declined"
  | "meeting_details_updated"
  | "reschedule_proposed";

type NotificationTerms = Pick<
  BookingSettings,
  | "display_name"
  | "service_label_singular"
  | "service_label_plural"
  | "member_bookings_label"
>;

export type NotificationContext = {
  offerTitle?: string | null;
  startsAt?: string | null;
  timezone?: string | null;
  paymentDueAt?: string | null;
};

export type NotificationCopy = {
  title: string;
  subtitle?: string;
  content: string;
};

function formatDate(value: string | null | undefined, timezone?: string | null) {
  if (!value) return "the scheduled time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(value));
}

export function buildBookingNotificationCopy(
  kind: BookingNotificationKind,
  terms: NotificationTerms,
  context: NotificationContext = {},
): NotificationCopy {
  const service = terms.service_label_singular || "Session";
  const serviceLower = service.toLowerCase();
  const app = terms.display_name || "Bookings";
  const subtitle = context.offerTitle || undefined;
  const scheduled = formatDate(context.startsAt, context.timezone);
  const paymentDue = formatDate(context.paymentDueAt, context.timezone);

  const copies: Record<BookingNotificationKind, NotificationCopy> = {
    request_rejected: {
      title: `${service} request update`,
      subtitle,
      content: `Your provider couldn’t approve this request. No payment was taken. Open ${app} for details.`,
    },
    reschedule_rejected: {
      title: "Time change not approved",
      subtitle,
      content: `Your original confirmed ${serviceLower} is unchanged. Open ${app} for details.`,
    },
    legacy_request_rejected: {
      title: `${service} request update`,
      subtitle,
      content: `This request was paid under the previous flow. It wasn’t approved, and the payment is being returned through Whop.`,
    },
    request_approved_payment: {
      title: `Your ${serviceLower} request was approved`,
      subtitle,
      content: `Complete payment by ${paymentDue} to confirm your time. Open ${app} to continue.`,
    },
    request_confirmed: {
      title: `Your ${serviceLower} is confirmed`,
      subtitle,
      content: `Open ${app} to view your confirmed time and private meeting details.`,
    },
    booking_cancelled: {
      title: `Your ${serviceLower} was cancelled`,
      subtitle,
      content: "The reserved time has been released. No new payment was taken.",
    },
    booking_no_show: {
      title: `Your ${serviceLower} was marked as a no-show`,
      subtitle,
      content: `Open ${app} to review your updated history.`,
    },
    booking_completed: {
      title: `Your ${serviceLower} is complete`,
      subtitle,
      content: `Open ${app} to review your updated history.`,
    },
    payment_expired: {
      title: "Payment window expired",
      subtitle,
      content: `The reserved time was released. Submit a new ${serviceLower} request if you’d still like to book.`,
    },
    payment_failed: {
      title: "Payment didn’t go through",
      subtitle,
      content: `Your time is still held until the payment deadline. Open ${app} to try again.`,
    },
    payment_confirmed: {
      title: `Your ${serviceLower} is confirmed`,
      subtitle,
      content: `Payment was received. Open ${app} for your time and private meeting details.`,
    },
    duplicate_payment_refunded: {
      title: "Duplicate payment detected",
      subtitle,
      content: `The extra charge is being returned automatically. Your ${serviceLower} remains confirmed.`,
    },
    duplicate_payment_review: {
      title: "Duplicate payment detected",
      subtitle,
      content: `Your ${serviceLower} remains confirmed. The team has been alerted to return the extra charge.`,
    },
    late_payment_refunded: {
      title: "Payment arrived after the deadline",
      subtitle,
      content: "The time had already expired, so your payment is being returned automatically.",
    },
    late_payment_review: {
      title: "Payment arrived after the deadline",
      subtitle,
      content: "The time had already expired. The team has been alerted to return your payment.",
    },
    refund_processing: {
      title: "Your refund is processing",
      subtitle,
      content: "Whop has started processing your refund. We’ll notify you when its status changes.",
    },
    refund_refunded: {
      title: "Your refund was completed",
      subtitle,
      content: "Whop marked the refund as completed. The return may take additional time to appear with your payment provider.",
    },
    refund_failed: {
      title: "Your refund needs attention",
      subtitle,
      content: `Whop could not complete the refund automatically. The team has been alerted. Open ${app} for the latest status.`,
    },
    refund_declined: {
      title: "Your refund request was reviewed",
      subtitle,
      content: `The refund request was not approved. Open ${app} for the latest booking status or use Help to contact the team.`,
    },
    meeting_details_updated: {
      title: `${service} details updated`,
      subtitle,
      content: `Private location or joining details changed. Open ${app} to review them before ${scheduled}.`,
    },
    reschedule_proposed: {
      title: `A new ${serviceLower} time was proposed`,
      subtitle,
      content: `A new time was proposed for ${scheduled}. Open ${app} to review the request.`,
    },
  };

  return copies[kind];
}

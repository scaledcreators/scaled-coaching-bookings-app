import { describe, expect, it } from "vitest";
import {
  buildBookingNotificationCopy,
  type BookingNotificationKind,
} from "@/lib/notification-copy";

const terms = {
  display_name: "Family Care",
  service_label_singular: "Visit",
  service_label_plural: "Visits",
  member_bookings_label: "My visits",
};

const kinds: BookingNotificationKind[] = [
  "request_rejected",
  "reschedule_rejected",
  "legacy_request_rejected",
  "request_approved_payment",
  "request_confirmed",
  "booking_cancelled",
  "booking_no_show",
  "booking_completed",
  "payment_expired",
  "payment_failed",
  "payment_confirmed",
  "duplicate_payment_refunded",
  "duplicate_payment_review",
  "late_payment_refunded",
  "late_payment_review",
  "refund_processing",
  "refund_refunded",
  "refund_failed",
  "refund_declined",
  "meeting_details_updated",
  "reschedule_proposed",
];

describe("tenant-aware booking notification copy", () => {
  it("uses the company app and service terminology", () => {
    const confirmed = buildBookingNotificationCopy(
      "payment_confirmed",
      terms,
      { offerTitle: "Home consultation" },
    );
    expect(confirmed.title).toBe("Your visit is confirmed");
    expect(confirmed.content).toContain("Family Care");
  });

  it("contains no hardcoded coaching language", () => {
    for (const kind of kinds) {
      const copy = buildBookingNotificationCopy(kind, terms, {
        offerTitle: "Home consultation",
        startsAt: "2026-08-15T18:00:00.000Z",
        paymentDueAt: "2026-08-14T18:00:00.000Z",
        timezone: "America/Chicago",
      });
      expect(JSON.stringify(copy).toLowerCase()).not.toContain("coaching");
    }
  });
});

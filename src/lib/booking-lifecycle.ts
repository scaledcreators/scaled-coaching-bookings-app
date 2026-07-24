import { zonedParts } from "@/lib/availability-time";

export const CAPACITY_RESERVING_STATUSES = [
  "pending_approval",
  "pending_payment",
  "confirmed",
  "reschedule_requested",
] as const;

type CapacityBooking = {
  status: string;
  payment_due_at?: string | null;
  requested_start_at?: string | null;
  confirmed_start_at?: string | null;
};

export function bookingReservesCapacity(
  booking: CapacityBooking,
  now = new Date(),
) {
  if (booking.status === "pending_payment") {
    if (!booking.payment_due_at) return false;
    return new Date(booking.payment_due_at).getTime() > now.getTime();
  }

  return (CAPACITY_RESERVING_STATUSES as readonly string[]).includes(
    booking.status,
  );
}

export function dateKeyInTimezone(value: Date, timezone: string) {
  const parts = zonedParts(value, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function bookingDateInTimezone(
  booking: Pick<
    CapacityBooking,
    "requested_start_at" | "confirmed_start_at"
  >,
  timezone: string,
) {
  const start = booking.confirmed_start_at ?? booking.requested_start_at;
  return start ? dateKeyInTimezone(new Date(start), timezone) : null;
}

export function bookingDatesInTimezone(
  booking: CapacityBooking,
  timezone: string,
) {
  const starts =
    booking.status === "reschedule_requested"
      ? [booking.confirmed_start_at, booking.requested_start_at]
      : [booking.confirmed_start_at ?? booking.requested_start_at];
  return [
    ...new Set(
      starts
        .filter((value): value is string => Boolean(value))
        .map((value) => dateKeyInTimezone(new Date(value), timezone)),
    ),
  ];
}

export function bookingIntervals(
  booking: CapacityBooking & {
    requested_end_at?: string | null;
    confirmed_end_at?: string | null;
  },
) {
  const intervals =
    booking.status === "reschedule_requested"
      ? [
          [booking.confirmed_start_at, booking.confirmed_end_at],
          [booking.requested_start_at, booking.requested_end_at],
        ]
      : [
          [
            booking.confirmed_start_at ?? booking.requested_start_at,
            booking.confirmed_end_at ?? booking.requested_end_at,
          ],
        ];
  return intervals.filter(
    (interval): interval is [string, string] =>
      Boolean(interval[0]) && Boolean(interval[1]),
  );
}

export function isClosedBookingStatus(status: string) {
  return [
    "completed",
    "rejected",
    "expired",
    "cancelled",
    "no_show",
  ].includes(status);
}

export function dailyCapacityConflict(
  sameDayBookings: Array<CapacityBooking & { whop_user_id: string }>,
  capacity: number,
  userId: string,
  now = new Date(),
) {
  const reserving = sameDayBookings.filter((booking) =>
    bookingReservesCapacity(booking, now),
  );
  if (reserving.some((booking) => booking.whop_user_id === userId)) {
    return "MEMBER_DAILY_LIMIT" as const;
  }
  if (reserving.length >= capacity) return "DAY_AT_CAPACITY" as const;
  return null;
}

export function adminTransitionError(
  booking: {
    status: string;
    whop_payment_id?: string | null;
  },
  action: "complete" | "no_show" | "cancel",
) {
  if (["complete", "no_show"].includes(action) && booking.status !== "confirmed") {
    return "Only confirmed bookings can be closed this way.";
  }
  if (
    action === "cancel" &&
    ![
      "pending_approval",
      "pending_payment",
      "confirmed",
      "reschedule_requested",
    ].includes(booking.status)
  ) {
    return "This booking is already closed.";
  }
  if (
    action === "cancel" &&
    booking.status === "confirmed" &&
    booking.whop_payment_id
  ) {
    return "Paid confirmed bookings must be refunded before cancellation.";
  }
  return null;
}

export function archiveBookingError(booking: {
  status: string;
  refund_status?: string | null;
}) {
  if (!isClosedBookingStatus(booking.status)) {
    return "Close this booking before moving it to Trash.";
  }
  if (["requested", "processing"].includes(booking.refund_status ?? "")) {
    return "Finish the refund workflow before archiving this booking.";
  }
  return null;
}

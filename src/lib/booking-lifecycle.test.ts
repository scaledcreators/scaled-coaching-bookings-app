import { describe, expect, it } from "vitest";
import {
  adminTransitionError,
  archiveBookingError,
  bookingDatesInTimezone,
  bookingReservesCapacity,
  dailyCapacityConflict,
} from "@/lib/booking-lifecycle";

const now = new Date("2026-07-23T12:00:00.000Z");

describe("daily booking capacity lifecycle", () => {
  it.each(["pending_approval", "confirmed", "reschedule_requested"])(
    "counts %s as reserving capacity",
    (status) => {
      expect(bookingReservesCapacity({ status }, now)).toBe(true);
    },
  );

  it("counts pending payment only before its deadline", () => {
    expect(
      bookingReservesCapacity(
        { status: "pending_payment", payment_due_at: "2026-07-23T13:00:00Z" },
        now,
      ),
    ).toBe(true);
    expect(
      bookingReservesCapacity(
        { status: "pending_payment", payment_due_at: "2026-07-23T11:00:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      bookingReservesCapacity(
        { status: "pending_payment", payment_due_at: null },
        now,
      ),
    ).toBe(false);
  });

  it.each(["rejected", "expired", "cancelled", "completed", "no_show"])(
    "releases capacity for %s",
    (status) => {
      expect(bookingReservesCapacity({ status }, now)).toBe(false);
    },
  );

  it("closes a date when its override is zero", () => {
    expect(dailyCapacityConflict([], 0, "user_new", now)).toBe(
      "DAY_AT_CAPACITY",
    );
  });

  it("allows exactly the configured number of requests", () => {
    const first = {
      status: "pending_approval",
      whop_user_id: "user_one",
    };
    expect(dailyCapacityConflict([], 1, "user_two", now)).toBeNull();
    expect(dailyCapacityConflict([first], 1, "user_two", now)).toBe(
      "DAY_AT_CAPACITY",
    );
    expect(dailyCapacityConflict([first], 2, "user_two", now)).toBeNull();
    expect(
      dailyCapacityConflict(
        [first, { status: "confirmed", whop_user_id: "user_two" }],
        2,
        "user_three",
        now,
      ),
    ).toBe("DAY_AT_CAPACITY");
  });

  it("does not let one member reserve a second session that day", () => {
    expect(
      dailyCapacityConflict(
        [{ status: "pending_approval", whop_user_id: "user_same" }],
        4,
        "user_same",
        now,
      ),
    ).toBe("MEMBER_DAILY_LIMIT");
  });

  it("counts both held dates during a reschedule", () => {
    expect(
      bookingDatesInTimezone(
        {
          status: "reschedule_requested",
          confirmed_start_at: "2026-07-23T15:00:00Z",
          requested_start_at: "2026-07-24T15:00:00Z",
        },
        "UTC",
      ),
    ).toEqual(["2026-07-23", "2026-07-24"]);
  });
});

describe("admin booking lifecycle safeguards", () => {
  it("never permits pending payment to become confirmed manually", () => {
    expect(
      adminTransitionError(
        { status: "pending_payment" },
        "complete",
      ),
    ).toBe("Only confirmed bookings can be closed this way.");
  });

  it("requires Whop refund handling before cancelling a paid confirmation", () => {
    expect(
      adminTransitionError(
        { status: "confirmed", whop_payment_id: "pay_123" },
        "cancel",
      ),
    ).toContain("refunded");
  });

  it("archives closed records but not active or refund-processing records", () => {
    expect(archiveBookingError({ status: "completed" })).toBeNull();
    expect(archiveBookingError({ status: "confirmed" })).toContain("Close");
    expect(
      archiveBookingError({
        status: "cancelled",
        refund_status: "processing",
      }),
    ).toContain("refund workflow");
  });
});

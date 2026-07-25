import { describe, expect, it } from "vitest";
import { formatPaymentTimeRemaining } from "@/lib/payment-countdown";

describe("payment countdown", () => {
  const now = new Date("2026-07-25T12:00:00.000Z").getTime();

  it("formats hours and minutes remaining", () => {
    expect(
      formatPaymentTimeRemaining("2026-07-26T10:45:00.000Z", now),
    ).toBe("22h 45m left");
  });

  it("formats a deadline less than an hour away", () => {
    expect(
      formatPaymentTimeRemaining("2026-07-25T12:20:00.000Z", now),
    ).toBe("20m left");
  });

  it("handles elapsed and invalid deadlines", () => {
    expect(
      formatPaymentTimeRemaining("2026-07-25T11:59:00.000Z", now),
    ).toBe("Due now");
    expect(formatPaymentTimeRemaining("not-a-date", now)).toBeNull();
  });
});

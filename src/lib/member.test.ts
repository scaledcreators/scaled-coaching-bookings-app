import { describe, expect, it } from "vitest";
import {
  bookingMemberLabel,
  bookingMemberUsername,
} from "@/lib/member";
import type { Booking } from "@/lib/types";

function booking(
  profile: Booking["member_profile"],
  userId = "user_raw",
) {
  return {
    whop_user_id: userId,
    member_profile: profile,
  } as Booking;
}

describe("customer identity presentation", () => {
  it("uses display name first and exposes username separately", () => {
    const member = booking({ name: "Graham Lee", username: "glee224" });
    expect(bookingMemberLabel(member)).toBe("Graham Lee");
    expect(bookingMemberUsername(member)).toBe("@glee224");
  });

  it("falls back from username to the raw Whop ID", () => {
    expect(
      bookingMemberLabel(booking({ name: null, username: "glee224" })),
    ).toBe("@glee224");
    expect(bookingMemberLabel(booking(null))).toBe("user_raw");
  });
});

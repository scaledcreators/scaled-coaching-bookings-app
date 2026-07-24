import type { Booking } from "@/lib/types";

export function bookingMemberLabel(booking: Booking) {
  if (booking.member_profile?.name) return booking.member_profile.name;
  if (booking.member_profile?.username) return `@${booking.member_profile.username}`;
  return booking.whop_user_id;
}

export function bookingMemberUsername(booking: Booking) {
  return booking.member_profile?.username
    ? `@${booking.member_profile.username}`
    : null;
}

export function bookingMemberInitial(booking: Booking) {
  return bookingMemberLabel(booking).replace(/^@/, "").slice(0, 1).toUpperCase();
}

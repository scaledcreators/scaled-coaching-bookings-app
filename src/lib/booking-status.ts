import type { Booking } from "@/lib/types";

const labels: Record<Booking["status"], string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  pending_payment: "Pending Payment",
  confirmed: "Confirmed",
  rejected: "Rejected",
  expired: "Expired",
  reschedule_requested: "Reschedule Requested",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No Show",
};

export function bookingStatusLabel(status: Booking["status"]) {
  return labels[status];
}

export function bookingStatusTone(status: Booking["status"]) {
  if (status === "confirmed" || status === "completed") return "success";
  if (status === "pending_approval" || status === "pending_payment") {
    return "warning";
  }
  return "neutral";
}

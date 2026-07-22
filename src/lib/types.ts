export type Offer = {
  id: string;
  whop_company_id: string;
  title: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  currency: string;
  access_mode: "free" | "paid" | "members_only" | "manual_approval";
  status: "draft" | "published" | "hidden" | "archived";
  checkout_url: string | null;
  requires_manual_confirmation: boolean;
  min_notice_hours: number;
  max_advance_days: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  capacity_per_slot: number;
  coach_ids?: string[];
};

export type Booking = {
  id: string;
  whop_company_id: string;
  whop_user_id: string;
  offer_id: string;
  coach_id: string | null;
  status: "draft" | "pending_payment" | "requested" | "confirmed" | "declined" | "reschedule_requested" | "cancelled" | "completed" | "no_show";
  requested_start_at: string | null;
  requested_end_at: string | null;
  confirmed_start_at: string | null;
  confirmed_end_at: string | null;
  timezone: string | null;
  intake_answers: Record<string, unknown>;
  member_note: string | null;
  admin_note: string | null;
  meeting_location: string | null;
  meeting_url: string | null;
  manual_join_instructions: string | null;
  whop_payment_id?: string | null;
  refund_status?: "not_requested" | "requested" | "processing" | "refunded" | "declined" | "failed";
  refund_reason?: string | null;
  refund_requested_at?: string | null;
  refunded_at?: string | null;
  whop_refund_id?: string | null;
  created_at: string;
  booking_offers?: Pick<Offer, "title" | "duration_minutes"> | null;
};

export type UnavailableWindow = {
  id: string;
  whop_company_id: string;
  coach_id: string | null;
  offer_id: string | null;
  title: string;
  reason: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  recurrence_rule: string | null;
  status: "active" | "cancelled";
};

export type Coach = {
  id: string;
  whop_company_id: string;
  name: string;
  bio: string | null;
  timezone: string;
  status: "active" | "hidden" | "archived";
};

export type DashboardData = {
  companyId: string;
  offers: Offer[];
  bookings: Booking[];
  unavailable: UnavailableWindow[];
  coaches: Coach[];
  emergencyPaused: boolean;
  demo: boolean;
};

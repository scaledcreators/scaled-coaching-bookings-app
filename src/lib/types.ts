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
  whop_product_id?: string | null;
  whop_plan_id?: string | null;
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
  status:
    | "draft"
    | "pending_approval"
    | "pending_payment"
    | "confirmed"
    | "rejected"
    | "expired"
    | "reschedule_requested"
    | "cancelled"
    | "completed"
    | "no_show";
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
  whop_experience_id?: string | null;
  whop_checkout_configuration_id?: string | null;
  payment_checkout_url?: string | null;
  payment_due_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  expired_at?: string | null;
  refund_status?:
    | "not_requested"
    | "requested"
    | "processing"
    | "refunded"
    | "declined"
    | "failed";
  refund_reason?: string | null;
  refund_requested_at?: string | null;
  refunded_at?: string | null;
  whop_refund_id?: string | null;
  created_at: string;
  booking_offers?: Pick<
    Offer,
    "title" | "duration_minutes" | "price_cents" | "access_mode"
  > | null;
  member_profile?: { name: string | null; username: string | null } | null;
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

export type AvailabilityRule = {
  id: string;
  whop_company_id: string;
  coach_id: string | null;
  offer_id: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  timezone: string;
  status: "active" | "disabled";
};

export type ThemeName =
  | "Orange"
  | "Red"
  | "Blue"
  | "Pink"
  | "Violet"
  | "Teal"
  | "Emerald"
  | "Indigo"
  | "Monochrome"
  | "Copper"
  | "custom";

export type BookingAppearance = {
  display_name: string;
  logo_url: string | null;
  theme_name: ThemeName;
  theme_primary: string;
  theme_accent: string;
  theme_highlight: string;
};

export type BookingSettings = BookingAppearance & {
  emergency_paused: boolean;
  default_timezone: string;
  support_contact: string | null;
};

export type DashboardData = {
  companyId: string;
  offers: Offer[];
  bookings: Booking[];
  unavailable: UnavailableWindow[];
  coaches: Coach[];
  availability: AvailabilityRule[];
  settings: BookingSettings;
  emergencyPaused: boolean;
  demo: boolean;
};

import {
  buildBookingNotificationCopy,
  type BookingNotificationKind,
  type NotificationContext,
  type NotificationCopy,
} from "@/lib/notification-copy";
import { coachNotificationTarget } from "@/lib/notification-target";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { BookingSettings } from "@/lib/types";
import { whop, whopConfigured } from "@/lib/whop";

type DeliverySettings = Pick<
  BookingSettings,
  | "display_name"
  | "service_label_singular"
  | "service_label_plural"
  | "member_bookings_label"
>;

const DEFAULT_SETTINGS: DeliverySettings = {
  display_name: "Coaching Bookings",
  service_label_singular: "Session",
  service_label_plural: "Sessions",
  member_bookings_label: "My bookings",
};

async function readDeliverySettings(companyId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("booking_settings")
    .select(
      "display_name,service_label_singular,service_label_plural,member_bookings_label",
    )
    .eq("whop_company_id", companyId)
    .maybeSingle();
  if (error) {
    console.error("Booking notification settings could not be loaded", error);
    return DEFAULT_SETTINGS;
  }
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) } as DeliverySettings;
}

async function claimDelivery({
  bookingId,
  companyId,
  eventKey,
  copy,
}: {
  bookingId: string;
  companyId: string;
  eventKey: string;
  copy: NotificationCopy;
}) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "claim_booking_notification_delivery",
    {
      p_booking_id: bookingId,
      p_company_id: companyId,
      p_event_key: eventKey,
      p_channel: "whop",
      p_title: copy.title,
      p_content: copy.content,
    },
  );
  if (error) throw error;
  return typeof data === "string" ? data : null;
}

async function finishDelivery(
  deliveryId: string,
  status: "sent" | "failed" | "skipped",
  error?: unknown,
) {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : null;
  await getSupabaseAdmin()
    .from("booking_notification_deliveries")
    .update({
      status,
      last_error: detail?.slice(0, 500) ?? null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deliveryId);
}

async function deliverTracked(
  input: Parameters<typeof claimDelivery>[0],
  send: () => Promise<boolean>,
) {
  let deliveryId: string | null = null;
  try {
    deliveryId = await claimDelivery(input);
    if (!deliveryId) return false;
    const sent = await send();
    if (!sent) throw new Error("Whop did not queue the notification.");
    await finishDelivery(deliveryId, sent ? "sent" : "skipped");
    return sent;
  } catch (error) {
    if (deliveryId) await finishDelivery(deliveryId, "failed", error);
    console.error("Booking Whop notification failed", error);
    return false;
  }
}

export async function notifyCoachOfRequest({
  bookingId,
  companyId,
  experienceId,
  offerTitle,
  requestedStart,
}: {
  bookingId: string;
  companyId: string;
  experienceId: string;
  offerTitle: string;
  requestedStart: string;
}) {
  const settings = await readDeliverySettings(companyId);
  const copy = {
    title: `New ${settings.service_label_singular.toLowerCase()} request`,
    subtitle: offerTitle,
    content: `A customer requested ${new Date(requestedStart).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}. Review it in your ${settings.display_name} dashboard.`,
  };
  return deliverTracked(
    { bookingId, companyId, eventKey: "new_request:coach", copy },
    async () => {
      if (!whopConfigured) {
        throw new Error("Whop notifications are not configured.");
      }
      const company = await whop.companies.retrieve(companyId);
      const result = await whop.notifications.create({
        ...coachNotificationTarget(experienceId, company.owner_user.id),
        ...copy,
      });
      return result.success;
    },
  );
}

export async function notifyBookingCustomer({
  bookingId,
  companyId,
  experienceId,
  userId,
  eventKey,
  kind,
  context,
}: {
  bookingId: string;
  companyId: string;
  experienceId: string | null | undefined;
  userId: string;
  eventKey: string;
  kind: BookingNotificationKind;
  context?: NotificationContext;
}) {
  const settings = await readDeliverySettings(companyId);
  const copy = buildBookingNotificationCopy(kind, settings, context);
  return deliverTracked({ bookingId, companyId, eventKey, copy }, async () => {
    if (!experienceId) {
      throw new Error("The booking does not have a Whop experience ID.");
    }
    if (!whopConfigured) {
      throw new Error("Whop notifications are not configured.");
    }
    const result = await whop.notifications.create({
      experience_id: experienceId,
      user_ids: [userId],
      ...copy,
    });
    return result.success;
  });
}

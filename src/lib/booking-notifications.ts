import { whop, whopConfigured } from "@/lib/whop";

type CustomerNotification = {
  experienceId: string | null | undefined;
  userId: string;
  title: string;
  content: string;
  subtitle?: string;
};

async function safelySend(
  notification:
    | Parameters<typeof whop.notifications.create>[0]
    | null,
) {
  if (!notification || !whopConfigured) return false;

  try {
    const result = await whop.notifications.create(notification);
    return result.success;
  } catch (error) {
    console.error("Whop booking notification could not be delivered", error);
    return false;
  }
}

export async function notifyCoachOfRequest({
  companyId,
  offerTitle,
  requestedStart,
}: {
  companyId: string;
  offerTitle: string;
  requestedStart: string;
}) {
  return safelySend({
    company_id: companyId,
    title: "New coaching request",
    subtitle: offerTitle,
    content: `A member requested ${new Date(requestedStart).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}. Review it in your Coaching Bookings dashboard.`,
  });
}

export async function notifyCustomer({
  experienceId,
  userId,
  title,
  content,
  subtitle,
}: CustomerNotification) {
  if (!experienceId) return false;

  return safelySend({
    experience_id: experienceId,
    user_ids: [userId],
    title,
    subtitle,
    content,
  });
}

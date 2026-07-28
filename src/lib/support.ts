import { whop } from "@/lib/whop";

export function formatSupportMessage({
  subject,
  message,
  experienceId,
}: {
  subject: string;
  message: string;
  experienceId: string;
}) {
  return [
    `**${subject.trim()}**`,
    `Experience ID: ${experienceId}`,
    "",
    message.trim(),
  ].join("\n");
}

export async function createNativeSupportRequest({
  companyId,
  userId,
  experienceId,
  subject,
  message,
}: {
  companyId: string;
  userId: string;
  experienceId: string;
  subject: string;
  message: string;
}) {
  const channel = await whop.supportChannels.create({
    company_id: companyId,
    user_id: userId,
    custom_name: subject.trim(),
  });
  await whop.messages.create({
    channel_id: channel.id,
    content: formatSupportMessage({ subject, message, experienceId }),
  });
  return channel;
}

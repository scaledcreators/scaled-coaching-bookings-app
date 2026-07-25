export function formatPaymentTimeRemaining(
  paymentDueAt: string,
  nowMs = Date.now(),
) {
  const deadlineMs = new Date(paymentDueAt).getTime();
  if (!Number.isFinite(deadlineMs)) return null;

  const totalMinutes = Math.max(
    0,
    Math.ceil((deadlineMs - nowMs) / 60_000),
  );
  if (totalMinutes === 0) return "Due now";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0
    ? `${hours}h ${minutes}m left`
    : `${minutes}m left`;
}

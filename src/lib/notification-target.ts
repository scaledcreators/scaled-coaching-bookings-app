export function coachNotificationTarget(
  experienceId: string,
  ownerUserId: string,
) {
  return {
    experience_id: experienceId,
    user_ids: [ownerUserId],
  };
}

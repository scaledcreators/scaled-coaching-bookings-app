import { MemberExperience } from "@/components/member-experience";
import { requireExperienceAccess } from "@/lib/auth";
import { companyIdForExperience, getCompanyData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ExperiencePage({ params, searchParams }: PageProps<"/experiences/[experienceId]">) {
  const { experienceId } = await params;
  const query = await searchParams;
  const viewer = await requireExperienceAccess(experienceId);
  const companyId = await companyIdForExperience(experienceId);
  const data = await getCompanyData(companyId);
  const memberData = {
    ...data,
    bookings: data.bookings
      .filter(
        (booking) =>
          booking.whop_user_id === viewer.userId &&
          booking.whop_experience_id === experienceId,
      )
      .map((booking) => {
        const releaseMeetingDetails = [
          "confirmed",
          "completed",
          "no_show",
        ].includes(booking.status);
        return {
          ...booking,
          admin_note: null,
          meeting_location: releaseMeetingDetails
            ? booking.meeting_location
            : null,
          meeting_url: releaseMeetingDetails ? booking.meeting_url : null,
          manual_join_instructions: releaseMeetingDetails
            ? booking.manual_join_instructions
            : null,
        };
      }),
  };
  return <MemberExperience experienceId={experienceId} userId={viewer.userId} data={memberData} checkoutComplete={query.checkout === "complete"} />;
}

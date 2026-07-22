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
      .filter((booking) => booking.whop_user_id === viewer.userId)
      .map((booking) => ({ ...booking, admin_note: null })),
  };
  return <MemberExperience experienceId={experienceId} userId={viewer.userId} data={memberData} checkoutComplete={query.checkout === "complete"} />;
}

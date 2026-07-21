import { AdminDashboard } from "@/components/admin-dashboard";
import { requireAdmin } from "@/lib/auth";
import { getCompanyData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: PageProps<"/dashboard/[companyId]">) {
  const { companyId } = await params;
  await requireAdmin(companyId);
  const data = await getCompanyData(companyId);
  return <AdminDashboard initialData={data} />;
}

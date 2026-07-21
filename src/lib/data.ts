import { demoData } from "@/lib/demo-data";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import type { DashboardData } from "@/lib/types";

export async function getCompanyData(companyId: string): Promise<DashboardData> {
  if (!isSupabaseConfigured()) return { ...demoData, companyId };
  const supabase = getSupabaseAdmin();

  const [offers, bookings, unavailable, coaches, settings] = await Promise.all([
    supabase.from("booking_offers").select("*").eq("whop_company_id", companyId).neq("status", "archived").order("created_at"),
    supabase.from("booking_requests").select("*, booking_offers(title,duration_minutes)").eq("whop_company_id", companyId).order("created_at", { ascending: false }).limit(100),
    supabase.from("unavailable_windows").select("*").eq("whop_company_id", companyId).eq("status", "active").order("starts_at"),
    supabase.from("coaches").select("*").eq("whop_company_id", companyId).neq("status", "archived").order("name"),
    supabase.from("booking_settings").select("emergency_paused").eq("whop_company_id", companyId).maybeSingle(),
  ]);

  for (const result of [offers, bookings, unavailable, coaches, settings]) {
    if (result.error) throw result.error;
  }

  return {
    companyId,
    offers: offers.data ?? [],
    bookings: bookings.data ?? [],
    unavailable: unavailable.data ?? [],
    coaches: coaches.data ?? [],
    emergencyPaused: settings.data?.emergency_paused ?? false,
    demo: false,
  } as DashboardData;
}

export async function companyIdForExperience(experienceId: string) {
  if (!isSupabaseConfigured()) return demoData.companyId;
  const { data, error } = await getSupabaseAdmin()
    .from("experience_installations")
    .select("whop_company_id")
    .eq("experience_id", experienceId)
    .single();
  if (error) throw new Error("This experience has not been connected to a company yet.");
  return data.whop_company_id as string;
}

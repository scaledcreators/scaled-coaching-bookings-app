import { demoData } from "@/lib/demo-data";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import type { DashboardData } from "@/lib/types";
import { whop } from "@/lib/whop";

export async function getCompanyData(companyId: string): Promise<DashboardData> {
  if (!isSupabaseConfigured()) return { ...demoData, companyId };
  const supabase = getSupabaseAdmin();

  const [offers, bookings, unavailable, coaches, availability, settings] = await Promise.all([
    supabase.from("booking_offers").select("*").eq("whop_company_id", companyId).neq("status", "archived").order("created_at"),
    supabase.from("booking_requests").select("*, booking_offers(title,duration_minutes)").eq("whop_company_id", companyId).order("created_at", { ascending: false }).limit(100),
    supabase.from("unavailable_windows").select("*").eq("whop_company_id", companyId).eq("status", "active").order("starts_at"),
    supabase.from("coaches").select("*").eq("whop_company_id", companyId).neq("status", "archived").order("name"),
    supabase.from("availability_rules").select("*").eq("whop_company_id", companyId).eq("status", "active").order("weekday"),
    supabase.from("booking_settings").select("emergency_paused,default_timezone,support_contact").eq("whop_company_id", companyId).maybeSingle(),
  ]);

  for (const result of [offers, bookings, unavailable, coaches, availability, settings]) {
    if (result.error) throw result.error;
  }

  const offerIds = (offers.data ?? []).map((offer) => offer.id);
  const offerCoaches = offerIds.length
    ? await supabase.from("offer_coaches").select("offer_id,coach_id").in("offer_id", offerIds)
    : { data: [], error: null };
  if (offerCoaches.error) throw offerCoaches.error;
  const coachIdsByOffer = new Map<string, string[]>();
  for (const link of offerCoaches.data ?? []) {
    coachIdsByOffer.set(link.offer_id, [...(coachIdsByOffer.get(link.offer_id) ?? []), link.coach_id]);
  }

  return {
    companyId,
    offers: (offers.data ?? []).map((offer) => ({ ...offer, coach_ids: coachIdsByOffer.get(offer.id) ?? [] })),
    bookings: bookings.data ?? [],
    unavailable: unavailable.data ?? [],
    coaches: coaches.data ?? [],
    availability: availability.data ?? [],
    settings: settings.data ?? { emergency_paused: false, default_timezone: "America/Chicago", support_contact: null },
    emergencyPaused: settings.data?.emergency_paused ?? false,
    demo: false,
  } as DashboardData;
}

export async function companyIdForExperience(experienceId: string) {
  if (!isSupabaseConfigured()) return demoData.companyId;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("experience_installations")
    .select("whop_company_id")
    .eq("experience_id", experienceId)
    .maybeSingle();

  if (error) throw error;
  if (data?.whop_company_id) return data.whop_company_id as string;

  // Whop owns the relationship between an experience and its company. Resolve
  // it on first access, validate that this app owns the experience, then cache
  // it for company-scoped Supabase queries. No manual exp_/biz_ seed is needed.
  const experience = await whop.experiences.retrieve(experienceId);
  const appId = process.env.NEXT_PUBLIC_WHOP_APP_ID;
  if (!appId || experience.app.id !== appId) {
    throw new Error("This experience does not belong to Coaching Bookings.");
  }

  const companyId = experience.company.id;
  const { error: installationError } = await supabase
    .from("experience_installations")
    .upsert(
      {
        experience_id: experienceId,
        whop_company_id: companyId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "experience_id" },
    );
  if (installationError) throw installationError;

  await supabase.from("booking_settings").upsert(
    { whop_company_id: companyId, updated_at: new Date().toISOString() },
    { onConflict: "whop_company_id", ignoreDuplicates: true },
  );

  return companyId;
}

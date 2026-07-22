import { demoData } from "@/lib/demo-data";
import { readCompanyAppearance } from "@/lib/branding-storage";
import { DEFAULT_SUPPORT_CONTACT } from "@/lib/constants";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import type { DashboardData } from "@/lib/types";
import { whop, whopConfigured } from "@/lib/whop";

type MemberProfile = { name: string | null; username: string | null };
const memberProfileCache = new Map<
  string,
  { expiresAt: number; profile: MemberProfile | null }
>();

async function getMemberProfile(userId: string, companyId: string) {
  const key = `${companyId}:${userId}`;
  const cached = memberProfileCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;
  try {
    const user = await whop.users.retrieve(userId, { account_id: companyId });
    const profile = { name: user.name, username: user.username };
    memberProfileCache.set(key, {
      expiresAt: Date.now() + 10 * 60_000,
      profile,
    });
    return profile;
  } catch {
    memberProfileCache.set(key, {
      expiresAt: Date.now() + 60_000,
      profile: null,
    });
    return null;
  }
}

async function getMemberProfiles(userIds: string[], companyId: string) {
  const profiles = new Map<string, MemberProfile | null>();
  if (!whopConfigured) return profiles;
  const queue = [...new Set(userIds)];
  await Promise.all(
    Array.from({ length: Math.min(8, queue.length) }, async () => {
      while (queue.length) {
        const userId = queue.shift();
        if (!userId) break;
        profiles.set(userId, await getMemberProfile(userId, companyId));
      }
    }),
  );
  return profiles;
}

export async function getCompanyData(
  companyId: string,
): Promise<DashboardData> {
  if (!isSupabaseConfigured()) return { ...demoData, companyId };
  const supabase = getSupabaseAdmin();
  await supabase.rpc("expire_overdue_booking_requests");

  const [
    offers,
    bookings,
    unavailable,
    coaches,
    availability,
    settings,
    appearance,
  ] = await Promise.all([
    supabase
      .from("booking_offers")
      .select("*")
      .eq("whop_company_id", companyId)
      .neq("status", "archived")
      .order("created_at"),
    supabase
      .from("booking_requests")
      .select(
        "*, booking_offers(title,duration_minutes,price_cents,access_mode)",
      )
      .eq("whop_company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("unavailable_windows")
      .select("*")
      .eq("whop_company_id", companyId)
      .eq("status", "active")
      .order("starts_at"),
    supabase
      .from("coaches")
      .select("*")
      .eq("whop_company_id", companyId)
      .neq("status", "archived")
      .order("name"),
    supabase
      .from("availability_rules")
      .select("*")
      .eq("whop_company_id", companyId)
      .eq("status", "active")
      .order("weekday"),
    supabase
      .from("booking_settings")
      .select("emergency_paused,default_timezone,support_contact")
      .eq("whop_company_id", companyId)
      .maybeSingle(),
    readCompanyAppearance(companyId),
  ]);

  for (const result of [
    offers,
    bookings,
    unavailable,
    coaches,
    availability,
    settings,
  ]) {
    if (result.error) throw result.error;
  }

  const memberProfiles = await getMemberProfiles(
    (bookings.data ?? []).map((booking) => booking.whop_user_id),
    companyId,
  );

  const offerIds = (offers.data ?? []).map((offer) => offer.id);
  const offerCoaches = offerIds.length
    ? await supabase
        .from("offer_coaches")
        .select("offer_id,coach_id")
        .in("offer_id", offerIds)
    : { data: [], error: null };
  if (offerCoaches.error) throw offerCoaches.error;
  const coachIdsByOffer = new Map<string, string[]>();
  for (const link of offerCoaches.data ?? []) {
    coachIdsByOffer.set(link.offer_id, [
      ...(coachIdsByOffer.get(link.offer_id) ?? []),
      link.coach_id,
    ]);
  }

  return {
    companyId,
    offers: (offers.data ?? []).map((offer) => ({
      ...offer,
      coach_ids: coachIdsByOffer.get(offer.id) ?? [],
    })),
    bookings: (bookings.data ?? []).map((booking) => ({
      ...booking,
      member_profile: memberProfiles.get(booking.whop_user_id) ?? null,
    })),
    unavailable: unavailable.data ?? [],
    coaches: coaches.data ?? [],
    availability: availability.data ?? [],
    settings: settings.data
      ? {
          ...appearance,
          ...settings.data,
          support_contact:
            settings.data.support_contact || DEFAULT_SUPPORT_CONTACT,
        }
      : {
          ...appearance,
          emergency_paused: false,
          default_timezone: "America/Chicago",
          support_contact: DEFAULT_SUPPORT_CONTACT,
        },
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

  await supabase
    .from("booking_settings")
    .upsert(
      { whop_company_id: companyId, updated_at: new Date().toISOString() },
      { onConflict: "whop_company_id", ignoreDuplicates: true },
    );

  return companyId;
}

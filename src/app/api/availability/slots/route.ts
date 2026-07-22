import { requireRequestViewer } from "@/lib/auth";
import { getApplicableAvailabilityRules } from "@/lib/availability-server";
import { buildAvailabilityCandidates } from "@/lib/availability-time";
import { companyIdForExperience } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const experienceId = url.searchParams.get("experienceId"); const offerId = url.searchParams.get("offerId"); const coachId = url.searchParams.get("coachId");
    if (!experienceId || !offerId) return Response.json({ error: "experienceId and offerId are required." }, { status: 400 });
    await requireRequestViewer(request, experienceId);
    const companyId = await companyIdForExperience(experienceId); const supabase = getSupabaseAdmin();
    const [{ data: offer, error }, { data: settings }] = await Promise.all([
      supabase.from("booking_offers").select("*").eq("id", offerId).eq("whop_company_id", companyId).eq("status", "published").single(),
      supabase.from("booking_settings").select("default_timezone").eq("whop_company_id", companyId).maybeSingle(),
    ]);
    if (error || !offer) throw new Error("Offer not found.");
    const rules = await getApplicableAvailabilityRules(supabase, companyId, offerId, coachId);
    const now = new Date();
    const earliest = new Date(now.getTime() + offer.min_notice_hours * 3_600_000);
    const latest = new Date(now.getTime() + offer.max_advance_days * 86_400_000);
    const candidates = buildAvailabilityCandidates({ rules, now, earliest, latest, durationMinutes: offer.duration_minutes, maxAdvanceDays: Math.min(offer.max_advance_days, 30) });
    const slots: string[] = [];
    for (const cursor of candidates) {
      const slotEnd = new Date(cursor.getTime() + offer.duration_minutes * 60_000);
      const blockedStart = new Date(cursor.getTime() - offer.buffer_before_minutes * 60_000);
      const blockedEnd = new Date(slotEnd.getTime() + offer.buffer_after_minutes * 60_000);
      const { data: blocked, error: blockedError } = await supabase.rpc("is_booking_slot_blocked", { p_company_id: companyId, p_offer_id: offerId, p_coach_id: coachId, p_starts_at: blockedStart.toISOString(), p_ends_at: blockedEnd.toISOString(), p_ignore_booking_id: null });
      if (blockedError) throw blockedError;
      if (!blocked) slots.push(cursor.toISOString());
      if (slots.length >= 40) break;
    }
    return Response.json({ slots, timezone: settings?.default_timezone || process.env.DEFAULT_TIMEZONE || "America/Chicago" });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not calculate availability." }, { status: 400 }); }
}

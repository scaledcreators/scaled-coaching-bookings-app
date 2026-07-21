import { requireRequestViewer } from "@/lib/auth";
import { companyIdForExperience } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const experienceId = url.searchParams.get("experienceId"); const offerId = url.searchParams.get("offerId"); const coachId = url.searchParams.get("coachId");
    if (!experienceId || !offerId) return Response.json({ error: "experienceId and offerId are required." }, { status: 400 });
    await requireRequestViewer(request, experienceId);
    const companyId = await companyIdForExperience(experienceId); const supabase = getSupabaseAdmin();
    const { data: offer, error } = await supabase.from("booking_offers").select("*").eq("id", offerId).eq("whop_company_id", companyId).eq("status", "published").single();
    if (error || !offer) throw new Error("Offer not found.");
    const start = new Date(Date.now() + offer.min_notice_hours * 3_600_000); const slots: string[] = [];
    for (let day = 0; day <= Math.min(offer.max_advance_days, 30); day++) {
      const date = new Date(start.getTime() + day * 86_400_000); const weekday = date.getUTCDay();
      const { data: rules } = await supabase.from("availability_rules").select("start_time,end_time").eq("whop_company_id", companyId).eq("weekday", weekday).eq("status", "active").or(`offer_id.is.null,offer_id.eq.${offerId}`).or(coachId ? `coach_id.is.null,coach_id.eq.${coachId}` : "coach_id.is.null");
      for (const rule of rules ?? []) { const [h,m] = rule.start_time.split(":").map(Number); const [eh,em] = rule.end_time.split(":").map(Number); const cursor = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m)); const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), eh, em)); while (cursor.getTime() + offer.duration_minutes * 60_000 <= end.getTime()) { const slotEnd = new Date(cursor.getTime() + offer.duration_minutes * 60_000); const { data: blocked } = await supabase.rpc("is_booking_slot_blocked", { p_company_id: companyId, p_offer_id: offerId, p_coach_id: coachId, p_starts_at: cursor.toISOString(), p_ends_at: slotEnd.toISOString(), p_ignore_booking_id: null }); if (!blocked && cursor > start) slots.push(cursor.toISOString()); cursor.setUTCMinutes(cursor.getUTCMinutes() + 30); if (slots.length >= 40) break; } if (slots.length >= 40) break; }
      if (slots.length >= 40) break;
    }
    return Response.json({ slots, timezone: offer.timezone || process.env.DEFAULT_TIMEZONE || "America/Chicago" });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not calculate availability." }, { status: 400 }); }
}

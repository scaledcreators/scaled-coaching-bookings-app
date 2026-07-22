import type { SupabaseClient } from "@supabase/supabase-js";
import { chooseApplicableRules } from "@/lib/availability-time";

export async function getApplicableAvailabilityRules(
  supabase: SupabaseClient,
  companyId: string,
  offerId: string,
  coachId: string | null,
) {
  const { data, error } = await supabase
    .from("availability_rules")
    .select("weekday,start_time,end_time,timezone,coach_id,offer_id")
    .eq("whop_company_id", companyId)
    .eq("status", "active")
    .or(`offer_id.is.null,offer_id.eq.${offerId}`)
    .or(coachId ? `coach_id.is.null,coach_id.eq.${coachId}` : "coach_id.is.null");
  if (error) throw error;
  return chooseApplicableRules(data ?? [], coachId, offerId);
}

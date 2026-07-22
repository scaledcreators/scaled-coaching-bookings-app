import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function getSingleActiveCoach(
  supabase: SupabaseClient,
  companyId: string,
) {
  const { data, error } = await supabase
    .from("coaches")
    .select("*")
    .eq("whop_company_id", companyId)
    .eq("status", "active")
    .order("created_at")
    .limit(2);

  if (error) throw error;
  if (!data?.length) {
    throw new Error("The coach profile has not been configured yet.");
  }
  if (data.length > 1) {
    throw new Error(
      "More than one active coach profile exists. Archive the extra profile before accepting bookings.",
    );
  }
  return data[0];
}

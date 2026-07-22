import { offerInput } from "../route";
import { requireRequestViewer } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const input = offerInput.parse(await request.json());
    await requireRequestViewer(request, input.companyId, true); const supabase = getSupabaseAdmin();
    const { data: offer, error } = await supabase.from("booking_offers").update({ title: input.title, description: input.description || null, duration_minutes: input.durationMinutes, price_cents: input.pricing === "paid" ? input.priceCents : 0, access_mode: input.pricing, status: input.status, min_notice_hours: input.minNoticeHours, buffer_after_minutes: input.bufferAfterMinutes, updated_at: new Date().toISOString() }).eq("id", id).eq("whop_company_id", input.companyId).select("*").single();
    if (error) throw error;
    const removed = await supabase.from("offer_coaches").delete().eq("offer_id", id); if (removed.error) throw removed.error;
    if (input.coachIds.length) { const linked = await supabase.from("offer_coaches").insert(input.coachIds.map((coachId) => ({ offer_id: id, coach_id: coachId }))); if (linked.error) throw linked.error; }
    return Response.json({ offer: { ...offer, coach_ids: input.coachIds } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not update offer." }, { status: 400 }); }
}

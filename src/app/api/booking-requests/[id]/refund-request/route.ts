import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { companyIdForExperience } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.object({ experienceId: z.string().startsWith("exp_"), reason: z.string().trim().min(3).max(1000) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const input = schema.parse(await request.json());
    const viewer = await requireRequestViewer(request, input.experienceId); const companyId = await companyIdForExperience(input.experienceId);
    const supabase = getSupabaseAdmin();
    const { data: booking, error } = await supabase.from("booking_requests").select("*").eq("id", id).eq("whop_company_id", companyId).eq("whop_user_id", viewer.userId).eq("whop_experience_id", input.experienceId).single();
    if (error || !booking) throw new Error("Booking not found.");
    if (!booking.whop_payment_id) return Response.json({ error: "This booking does not have a refundable Whop payment." }, { status: 409 });
    if (["requested", "processing", "refunded"].includes(booking.refund_status)) return Response.json({ error: "A refund is already being handled for this booking." }, { status: 409 });
    if (["completed", "no_show"].includes(booking.status)) return Response.json({ error: "This booking is no longer eligible for a refund request." }, { status: 409 });
    const now = new Date().toISOString();
    const { data, error: updateError } = await supabase.from("booking_requests").update({ status: "cancelled", refund_status: "requested", refund_reason: input.reason, refund_requested_at: now, updated_at: now }).eq("id", id).select("*, booking_offers(title,duration_minutes,price_cents,access_mode)").single();
    if (updateError) throw updateError;
    await supabase.from("booking_messages").insert({ booking_request_id: id, sender: "member", body: `Refund requested: ${input.reason}` });
    return Response.json({ booking: data });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not request refund." }, { status: 400 }); }
}

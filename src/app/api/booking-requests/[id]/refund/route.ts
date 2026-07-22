import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { whop } from "@/lib/whop";

const schema = z.object({ companyId: z.string().startsWith("biz_") });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const input = schema.parse(await request.json());
    await requireRequestViewer(request, input.companyId, true); const supabase = getSupabaseAdmin();
    // Selecting refund_status before the irreversible Whop call also verifies
    // that the refund migration is installed in this Supabase project.
    const { data: booking, error } = await supabase.from("booking_requests").select("id,whop_payment_id,refund_status").eq("id", id).eq("whop_company_id", input.companyId).single();
    if (error || !booking) throw new Error("Booking not found.");
    if (!booking.whop_payment_id) return Response.json({ error: "This booking has no Whop payment to refund." }, { status: 409 });
    if (["processing", "refunded"].includes(booking.refund_status)) return Response.json({ error: "This payment is already being refunded." }, { status: 409 });
    await whop.payments.refund(booking.whop_payment_id);
    const now = new Date().toISOString();
    const { data, error: updateError } = await supabase.from("booking_requests").update({ status: "cancelled", refund_status: "processing", updated_at: now }).eq("id", id).select("*, booking_offers(title,duration_minutes)").single();
    if (updateError) throw updateError;
    await supabase.from("booking_messages").insert({ booking_request_id: id, sender: "admin", body: "A full refund was issued through Whop." });
    return Response.json({ booking: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not issue refund.";
    const permissionError = /permission|forbidden|unauthorized|403/i.test(message);
    return Response.json({ error: permissionError ? "Whop blocked the refund. Add payment:manage and the required member/payment read permissions to this app, then try again." : message }, { status: permissionError ? 403 : 400 });
  }
}

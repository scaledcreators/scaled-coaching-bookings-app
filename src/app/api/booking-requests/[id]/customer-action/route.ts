import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getApplicableAvailabilityRules } from "@/lib/availability-server";
import { slotFitsAvailability } from "@/lib/availability-time";
import { companyIdForExperience } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.discriminatedUnion("action", [
  z.object({ experienceId: z.string().startsWith("exp_"), action: z.literal("cancel") }),
  z.object({ experienceId: z.string().startsWith("exp_"), action: z.literal("reschedule"), startsAt: z.iso.datetime() }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const input = schema.parse(await request.json()); const viewer = await requireRequestViewer(request, input.experienceId); const companyId = await companyIdForExperience(input.experienceId); const supabase = getSupabaseAdmin();
    const { data: booking, error } = await supabase.from("booking_requests").select("*, booking_offers(title,duration_minutes,min_notice_hours,max_advance_days,buffer_before_minutes,buffer_after_minutes)").eq("id", id).eq("whop_company_id", companyId).eq("whop_user_id", viewer.userId).single();
    if (error || !booking) throw new Error("Booking not found.");
    if (["completed", "no_show", "declined", "cancelled"].includes(booking.status)) return Response.json({ error: "This booking can no longer be changed." }, { status: 409 });
    if (input.action === "cancel") {
      if (booking.whop_payment_id) return Response.json({ error: "Paid bookings must be cancelled through Request a refund." }, { status: 409 });
      const { data, error: updateError } = await supabase.from("booking_requests").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).select("*, booking_offers(title,duration_minutes)").single(); if (updateError) throw updateError;
      await supabase.from("booking_messages").insert({ booking_request_id: id, sender: "member", body: "Member cancelled the booking." }); return Response.json({ booking: data });
    }
    if (booking.status === "pending_payment") return Response.json({ error: "Complete or restart payment before changing this request." }, { status: 409 });
    const start = new Date(input.startsAt); const offer = booking.booking_offers; const earliest = Date.now() + offer.min_notice_hours * 3_600_000; const latest = Date.now() + offer.max_advance_days * 86_400_000;
    if (start.getTime() < earliest || start.getTime() > latest) return Response.json({ error: "That time is outside the booking window." }, { status: 409 });
    const end = new Date(start.getTime() + offer.duration_minutes * 60_000); const rules = await getApplicableAvailabilityRules(supabase, companyId, booking.offer_id, booking.coach_id); if (!slotFitsAvailability(start, end, rules)) return Response.json({ error: "That time is outside the coach’s available hours." }, { status: 409 }); const blocked = await supabase.rpc("is_booking_slot_blocked", { p_company_id: companyId, p_offer_id: booking.offer_id, p_coach_id: booking.coach_id, p_starts_at: new Date(start.getTime() - offer.buffer_before_minutes * 60_000).toISOString(), p_ends_at: new Date(end.getTime() + offer.buffer_after_minutes * 60_000).toISOString(), p_ignore_booking_id: id }); if (blocked.error) throw blocked.error; if (blocked.data) return Response.json({ error: "That time is unavailable." }, { status: 409 });
    const { data, error: updateError } = await supabase.from("booking_requests").update({ status: "reschedule_requested", requested_start_at: start.toISOString(), requested_end_at: end.toISOString(), confirmed_start_at: null, confirmed_end_at: null, updated_at: new Date().toISOString() }).eq("id", id).select("*, booking_offers(title,duration_minutes)").single(); if (updateError) throw updateError;
    await supabase.from("booking_messages").insert({ booking_request_id: id, sender: "member", body: `Member requested a new time: ${start.toISOString()}.` }); return Response.json({ booking: data });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not change booking." }, { status: 400 }); }
}

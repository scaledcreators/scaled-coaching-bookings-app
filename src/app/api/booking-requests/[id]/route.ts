import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const statuses = ["requested", "confirmed", "declined", "reschedule_requested", "cancelled", "completed", "no_show"] as const;
const schema = z.object({ companyId: z.string().startsWith("biz_"), status: z.enum(statuses).optional(), coachId: z.string().uuid().nullable().optional(), requestedStartAt: z.iso.datetime().optional(), meetingLocation: z.string().max(500).optional(), meetingUrl: z.url().or(z.literal("")).optional(), joinInstructions: z.string().max(2000).optional(), adminNote: z.string().max(2000).optional(), refundStatus: z.literal("declined").optional() }).refine((value) => Object.keys(value).some((key) => key !== "companyId"), "No changes were supplied.");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    await requireRequestViewer(request, input.companyId, true);
    const supabase = getSupabaseAdmin();
    const existing = await supabase.from("booking_requests").select("*").eq("id", id).eq("whop_company_id", input.companyId).single();
    if (existing.error) throw new Error("Booking not found.");

    if (input.coachId) {
      const { data: coach } = await supabase.from("coaches").select("id").eq("id", input.coachId).eq("whop_company_id", input.companyId).eq("status", "active").maybeSingle();
      if (!coach) return Response.json({ error: "That coach is not available." }, { status: 409 });
    }

    if (input.status === "confirmed") {
      if (existing.data.status === "pending_payment") {
        return Response.json({ error: "This booking cannot be confirmed until Whop payment succeeds." }, { status: 409 });
      }
      if (!(input.coachId ?? existing.data.coach_id)) return Response.json({ error: "Assign a coach before confirming this booking." }, { status: 409 });
      const start = existing.data.requested_start_at;
      const end = existing.data.requested_end_at;
      const { data: blocked, error } = await supabase.rpc("is_booking_slot_blocked", { p_company_id: input.companyId, p_offer_id: existing.data.offer_id, p_coach_id: input.coachId ?? existing.data.coach_id, p_starts_at: start, p_ends_at: end, p_ignore_booking_id: id });
      if (error) throw error;
      if (blocked) return Response.json({ error: "That time is no longer available. Propose a new time instead." }, { status: 409 });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.status !== undefined) update.status = input.status;
    if (input.coachId !== undefined) update.coach_id = input.coachId;
    if (input.status === "confirmed") { update.confirmed_start_at = existing.data.requested_start_at; update.confirmed_end_at = existing.data.requested_end_at; }
    if (input.meetingLocation !== undefined) update.meeting_location = input.meetingLocation;
    if (input.meetingUrl !== undefined) update.meeting_url = input.meetingUrl;
    if (input.joinInstructions !== undefined) update.manual_join_instructions = input.joinInstructions;
    if (input.adminNote !== undefined) update.admin_note = input.adminNote || null;
    if (input.refundStatus !== undefined) update.refund_status = input.refundStatus;
    if (input.requestedStartAt !== undefined) {
      const { data: offer, error: offerError } = await supabase.from("booking_offers").select("duration_minutes,min_notice_hours,max_advance_days").eq("id", existing.data.offer_id).eq("whop_company_id", input.companyId).single();
      if (offerError || !offer) throw new Error("Offer not found.");
      const start = new Date(input.requestedStartAt); const end = new Date(start.getTime() + offer.duration_minutes * 60_000);
      const { data: blocked, error: blockedError } = await supabase.rpc("is_booking_slot_blocked", { p_company_id: input.companyId, p_offer_id: existing.data.offer_id, p_coach_id: input.coachId ?? existing.data.coach_id, p_starts_at: start.toISOString(), p_ends_at: end.toISOString(), p_ignore_booking_id: id });
      if (blockedError) throw blockedError; if (blocked) return Response.json({ error: "That proposed time is unavailable." }, { status: 409 });
      update.requested_start_at = start.toISOString(); update.requested_end_at = end.toISOString(); update.confirmed_start_at = null; update.confirmed_end_at = null; update.status = input.status ?? "reschedule_requested";
    }
    const { data, error } = await supabase.from("booking_requests").update(update).eq("id", id).eq("whop_company_id", input.companyId).select("*, booking_offers(title,duration_minutes)").single();
    if (error) throw error;
    const changes = [input.status ? `status changed to ${input.status}` : null, input.coachId !== undefined ? "coach assignment updated" : null, input.requestedStartAt ? "a new time was proposed" : null, input.meetingLocation !== undefined || input.meetingUrl !== undefined ? "meeting details updated" : null, input.refundStatus ? "refund request declined" : null].filter(Boolean).join("; ");
    await supabase.from("booking_messages").insert({ booking_request_id: id, sender: "system", body: `Booking ${changes}.` });
    return Response.json({ booking: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update booking." }, { status: 400 });
  }
}

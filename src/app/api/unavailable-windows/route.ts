import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.object({
  companyId: z.string().startsWith("biz_"),
  title: z.string().min(1).max(120),
  reason: z.string().max(1000).optional().default(""),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  allDay: z.boolean().default(false),
  coachId: z.string().uuid().nullable().optional(),
  offerId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    await requireRequestViewer(request, input.companyId, true);
    if (new Date(input.endsAt) <= new Date(input.startsAt)) return Response.json({ error: "The end must be after the start." }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data: window, error } = await supabase.from("unavailable_windows").insert({
      whop_company_id: input.companyId, title: input.title, reason: input.reason || null,
      starts_at: input.startsAt, ends_at: input.endsAt, all_day: input.allDay,
      coach_id: input.coachId ?? null, offer_id: input.offerId ?? null,
    }).select("*").single();
    if (error) throw error;

    const { data: conflicts, error: conflictError } = await supabase.from("booking_requests")
      .select("id,status,requested_start_at,confirmed_start_at")
      .eq("whop_company_id", input.companyId)
      .in("status", [
        "pending_approval",
        "pending_payment",
        "confirmed",
        "reschedule_requested",
      ])
      .lt("requested_start_at", input.endsAt)
      .gt("requested_end_at", input.startsAt);
    if (conflictError) throw conflictError;
    return Response.json({ window, conflicts: conflicts ?? [] }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create unavailable window.";
    return Response.json({ error: message }, { status: message.includes("access") || message.includes("Admin") ? 403 : 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url); const companyId = url.searchParams.get("companyId"); const id = url.searchParams.get("id");
    if (!companyId || !id) return Response.json({ error: "companyId and id are required." }, { status: 400 });
    await requireRequestViewer(request, companyId, true);
    const { error } = await getSupabaseAdmin().from("unavailable_windows").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("whop_company_id", companyId);
    if (error) throw error; return new Response(null, { status: 204 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not remove unavailable window." }, { status: 400 }); }
}

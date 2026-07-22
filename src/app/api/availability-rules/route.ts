import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.object({ companyId: z.string().startsWith("biz_"), coachId: z.string().uuid().nullable(), timezone: z.string().min(1).max(100), days: z.array(z.object({ weekday: z.number().int().min(0).max(6), enabled: z.boolean(), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/) })).length(7) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json()); await requireRequestViewer(request, input.companyId, true); const supabase = getSupabaseAdmin();
    if (input.coachId) { const { data: coach } = await supabase.from("coaches").select("id").eq("id", input.coachId).eq("whop_company_id", input.companyId).neq("status", "archived").maybeSingle(); if (!coach) throw new Error("Coach not found."); }
    for (const day of input.days) if (day.enabled && day.endTime <= day.startTime) throw new Error("Each end time must be after its start time.");
    let removal = supabase.from("availability_rules").delete().eq("whop_company_id", input.companyId).is("offer_id", null); removal = input.coachId ? removal.eq("coach_id", input.coachId) : removal.is("coach_id", null); const removed = await removal; if (removed.error) throw removed.error;
    const rows = input.days.filter((day) => day.enabled).map((day) => ({ whop_company_id: input.companyId, coach_id: input.coachId, offer_id: null, weekday: day.weekday, start_time: day.startTime, end_time: day.endTime, timezone: input.timezone, status: "active" }));
    const inserted = rows.length ? await supabase.from("availability_rules").insert(rows).select("*") : { data: [], error: null }; if (inserted.error) throw inserted.error;
    return Response.json({ rules: inserted.data ?? [] });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save availability." }, { status: 400 }); }
}

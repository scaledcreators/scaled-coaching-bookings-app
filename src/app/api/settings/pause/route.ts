import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.object({ companyId: z.string().startsWith("biz_"), paused: z.boolean().optional(), defaultTimezone: z.string().min(1).max(100).optional(), supportContact: z.string().max(250).optional() });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    await requireRequestViewer(request, input.companyId, true);
    const update: Record<string, unknown> = { whop_company_id: input.companyId, updated_at: new Date().toISOString() };
    if (input.paused !== undefined) update.emergency_paused = input.paused;
    if (input.defaultTimezone !== undefined) update.default_timezone = input.defaultTimezone;
    if (input.supportContact !== undefined) update.support_contact = input.supportContact || null;
    const { data, error } = await getSupabaseAdmin().from("booking_settings").upsert(update).select("emergency_paused,default_timezone,support_contact").single();
    if (error) throw error;
    return Response.json({ settings: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update pause mode." }, { status: 400 });
  }
}

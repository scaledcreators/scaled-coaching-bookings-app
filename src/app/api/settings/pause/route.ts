import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.object({ companyId: z.string().startsWith("biz_"), paused: z.boolean() });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    await requireRequestViewer(request, input.companyId, true);
    const { error } = await getSupabaseAdmin().from("booking_settings").upsert({ whop_company_id: input.companyId, emergency_paused: input.paused, updated_at: new Date().toISOString() });
    if (error) throw error;
    return Response.json({ paused: input.paused });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update pause mode." }, { status: 400 });
  }
}

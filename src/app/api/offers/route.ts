import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getSingleActiveCoach } from "@/lib/single-coach";
import { getSupabaseAdmin } from "@/lib/supabase";

export const offerInput = z.object({
  companyId: z.string().startsWith("biz_"), title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().default(""), durationMinutes: z.number().int().min(5).max(1440),
  pricing: z.enum(["free", "paid"]), priceCents: z.number().int().min(0), status: z.enum(["draft", "published"]).default("published"),
  minNoticeHours: z.number().int().min(0).default(24),
  maxAdvanceDays: z.number().int().min(1).default(60), bufferBeforeMinutes: z.number().int().min(0).default(0), bufferAfterMinutes: z.number().int().min(0).default(15),
}).superRefine((value, ctx) => { if (value.pricing === "paid" && value.priceCents < 50) ctx.addIssue({ code: "custom", path: ["priceCents"], message: "Paid offers need an amount of at least $0.50." }); });

export async function POST(request: Request) {
  try {
    const input = offerInput.parse(await request.json());
    await requireRequestViewer(request, input.companyId, true);
    const supabase = getSupabaseAdmin();
    const coach = await getSingleActiveCoach(supabase, input.companyId);
    const slug = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 6)}`;
    const { data: offer, error } = await supabase.from("booking_offers").insert({
      whop_company_id: input.companyId, title: input.title, slug, description: input.description || null,
      duration_minutes: input.durationMinutes, price_cents: input.pricing === "paid" ? input.priceCents : 0,
      currency: "usd", access_mode: input.pricing, status: input.status, requires_manual_confirmation: true,
      min_notice_hours: input.minNoticeHours, max_advance_days: input.maxAdvanceDays, buffer_before_minutes: input.bufferBeforeMinutes, buffer_after_minutes: input.bufferAfterMinutes,
    }).select("*").single();
    if (error) throw error;
    const linked = await supabase.from("offer_coaches").insert({
      offer_id: offer.id,
      coach_id: coach.id,
    });
    if (linked.error) throw linked.error;
    return Response.json({ offer: { ...offer, coach_ids: [coach.id] } }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not create offer." }, { status: 400 }); }
}

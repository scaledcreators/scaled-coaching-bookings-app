import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const coachInput = z.object({
  companyId: z.string().startsWith("biz_"),
  name: z.string().trim().min(2).max(120),
  bio: z.string().trim().max(2000).optional().default(""),
  timezone: z.string().min(1).max(100),
});

// Kept only for first-install bootstrap. Once a company has an active coach,
// the database and this route both reject attempts to create a roster.
export async function POST(request: Request) {
  try {
    const input = coachInput.parse(await request.json());
    await requireRequestViewer(request, input.companyId, true);
    const supabase = getSupabaseAdmin();
    const { count, error: countError } = await supabase
      .from("coaches")
      .select("id", { count: "exact", head: true })
      .eq("whop_company_id", input.companyId)
      .eq("status", "active");
    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      return Response.json(
        { error: "This app supports one active coach profile." },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("coaches")
      .insert({
        whop_company_id: input.companyId,
        name: input.name,
        bio: input.bio || null,
        timezone: input.timezone,
        status: "active",
      })
      .select("*")
      .single();
    if (error) throw error;
    const rules = [1, 2, 3, 4, 5].map((weekday) => ({
      whop_company_id: input.companyId,
      coach_id: data.id,
      weekday,
      start_time: "09:00",
      end_time: "17:00",
      timezone: input.timezone,
      status: "active",
    }));
    const availability = await supabase.from("availability_rules").insert(rules);
    if (availability.error) throw availability.error;
    return Response.json({ coach: data }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not create coach.",
      },
      { status: 400 },
    );
  }
}

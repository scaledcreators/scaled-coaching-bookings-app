import { coachInput } from "../route";
import { requireRequestViewer } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = coachInput.parse(await request.json());
    await requireRequestViewer(request, input.companyId, true);
    const { data, error } = await getSupabaseAdmin()
      .from("coaches")
      .update({
        name: input.name,
        bio: input.bio || null,
        timezone: input.timezone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("whop_company_id", input.companyId)
      .eq("status", "active")
      .select("*")
      .single();
    if (error) throw error;
    return Response.json({ coach: data });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update coach.",
      },
      { status: 400 },
    );
  }
}

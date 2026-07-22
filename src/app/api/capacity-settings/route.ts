import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const defaultSchema = z.object({
  companyId: z.string().startsWith("biz_"),
  defaultDailyCapacity: z.number().int().min(1).max(100),
});

const overrideSchema = z.object({
  companyId: z.string().startsWith("biz_"),
  date: z.iso.date(),
  maxBookings: z.number().int().min(0).max(100),
});

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdmin();

    if ("defaultDailyCapacity" in body) {
      const input = defaultSchema.parse(body);
      await requireRequestViewer(request, input.companyId, true);
      const { data, error } = await supabase
        .from("booking_settings")
        .upsert(
          {
            whop_company_id: input.companyId,
            default_daily_capacity: input.defaultDailyCapacity,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "whop_company_id" },
        )
        .select("default_daily_capacity")
        .single();
      if (error) throw error;
      return Response.json({ defaultDailyCapacity: data.default_daily_capacity });
    }

    const input = overrideSchema.parse(body);
    await requireRequestViewer(request, input.companyId, true);
    const { data, error } = await supabase
      .from("booking_capacity_overrides")
      .upsert(
        {
          whop_company_id: input.companyId,
          capacity_date: input.date,
          max_bookings: input.maxBookings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "whop_company_id,capacity_date" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return Response.json({ override: data });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save capacity.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const input = z
      .object({
        companyId: z.string().startsWith("biz_"),
        date: z.iso.date(),
      })
      .parse({
        companyId: url.searchParams.get("companyId"),
        date: url.searchParams.get("date"),
      });
    await requireRequestViewer(request, input.companyId, true);
    const { error } = await getSupabaseAdmin()
      .from("booking_capacity_overrides")
      .delete()
      .eq("whop_company_id", input.companyId)
      .eq("capacity_date", input.date);
    if (error) throw error;
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not remove override.",
      },
      { status: 400 },
    );
  }
}

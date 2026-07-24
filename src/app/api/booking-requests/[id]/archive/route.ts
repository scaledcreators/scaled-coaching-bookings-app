import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { archiveBookingError } from "@/lib/booking-lifecycle";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.object({
  companyId: z.string().startsWith("biz_"),
  action: z.enum(["archive", "restore"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    const viewer = await requireRequestViewer(request, input.companyId, true);
    const supabase = getSupabaseAdmin();
    const { data: booking, error: bookingError } = await supabase
      .from("booking_requests")
      .select("*")
      .eq("id", id)
      .eq("whop_company_id", input.companyId)
      .single();
    if (bookingError || !booking) throw new Error("Booking not found.");

    if (input.action === "archive") {
      const archiveError = archiveBookingError(booking);
      if (archiveError) {
        return Response.json({ error: archiveError }, { status: 409 });
      }
    }

    const { data, error } = await supabase
      .from("booking_requests")
      .update({
        admin_archived_at:
          input.action === "archive" ? new Date().toISOString() : null,
        admin_archived_by:
          input.action === "archive" ? viewer.userId : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("whop_company_id", input.companyId)
      .select(
        "*, booking_offers(title,duration_minutes,price_cents,access_mode)",
      )
      .single();
    if (error) throw error;

    return Response.json({ booking: data });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update Trash.",
      },
      { status: 400 },
    );
  }
}

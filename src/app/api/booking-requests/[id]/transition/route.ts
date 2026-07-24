import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { adminTransitionError } from "@/lib/booking-lifecycle";
import { notifyCustomer } from "@/lib/booking-notifications";
import { getSupabaseAdmin } from "@/lib/supabase";
import { whop } from "@/lib/whop";

const schema = z.object({
  companyId: z.string().startsWith("biz_"),
  action: z.enum(["complete", "no_show", "cancel"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    await requireRequestViewer(request, input.companyId, true);
    const supabase = getSupabaseAdmin();
    const { data: booking, error: bookingError } = await supabase
      .from("booking_requests")
      .select("*, booking_offers(title,access_mode,price_cents)")
      .eq("id", id)
      .eq("whop_company_id", input.companyId)
      .single();
    if (bookingError || !booking) throw new Error("Booking not found.");

    const transitionError = adminTransitionError(booking, input.action);
    if (transitionError) {
      return Response.json({ error: transitionError }, { status: 409 });
    }

    if (
      input.action === "cancel" &&
      booking.whop_checkout_configuration_id
    ) {
      await whop.checkoutConfigurations
        .delete(booking.whop_checkout_configuration_id)
        .catch((error) =>
          console.error("Cancelled checkout could not be disabled", error),
        );
    }

    const nextStatus =
      input.action === "complete"
        ? "completed"
        : input.action === "no_show"
          ? "no_show"
          : "cancelled";
    const { data, error } = await supabase
      .from("booking_requests")
      .update({
        status: nextStatus,
        ...(input.action === "cancel"
          ? {
              payment_due_at: null,
              payment_checkout_url: null,
              checkout_creation_token: null,
              checkout_creation_started_at: null,
            }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("whop_company_id", input.companyId)
      .select(
        "*, booking_offers(title,duration_minutes,price_cents,access_mode)",
      )
      .single();
    if (error) throw error;

    await supabase.from("booking_messages").insert({
      booking_request_id: id,
      sender: "system",
      body: `The coach marked this booking ${nextStatus.replace("_", " ")}.`,
    });
    await notifyCustomer({
      experienceId: booking.whop_experience_id,
      userId: booking.whop_user_id,
      title:
        input.action === "cancel"
          ? "Your coaching booking was cancelled"
          : input.action === "no_show"
            ? "Your coaching booking was marked as a no-show"
            : "Your coaching session is complete",
      subtitle: booking.booking_offers?.title,
      content:
        input.action === "cancel"
          ? "The reserved time has been released. No new payment was taken."
          : "Open Coaching Bookings to review your updated session history.",
    });

    return Response.json({ booking: data });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not move booking.",
      },
      { status: 400 },
    );
  }
}

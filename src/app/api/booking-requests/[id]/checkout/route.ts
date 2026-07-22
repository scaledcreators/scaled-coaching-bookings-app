import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import {
  checkoutErrorMessage,
  createBookingCheckout,
} from "@/lib/booking-checkout";
import { notifyCustomer } from "@/lib/booking-notifications";
import { companyIdForExperience } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";
import { whop } from "@/lib/whop";

const schema = z.object({
  experienceId: z.string().startsWith("exp_"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    const viewer = await requireRequestViewer(request, input.experienceId);
    const companyId = await companyIdForExperience(input.experienceId);
    const supabase = getSupabaseAdmin();

    const { data: booking, error } = await supabase
      .from("booking_requests")
      .select("*, booking_offers(*)")
      .eq("id", id)
      .eq("whop_company_id", companyId)
      .eq("whop_user_id", viewer.userId)
      .eq("whop_experience_id", input.experienceId)
      .single();
    if (error || !booking || !booking.booking_offers) {
      throw new Error("Booking not found.");
    }
    if (booking.status === "expired") {
      if (booking.whop_checkout_configuration_id) {
        await whop.checkoutConfigurations
          .delete(booking.whop_checkout_configuration_id)
          .catch(() => undefined);
      }
      return Response.json(
        {
          error:
            "The payment window expired and this time has been released. Submit a new request to try again.",
        },
        { status: 410 },
      );
    }
    if (booking.status !== "pending_payment") {
      return Response.json(
        { error: "This booking is not awaiting payment." },
        { status: 409 },
      );
    }

    const paymentDueAt = booking.payment_due_at
      ? new Date(booking.payment_due_at)
      : null;
    if (!paymentDueAt || paymentDueAt.getTime() <= Date.now()) {
      const now = new Date().toISOString();
      await supabase
        .from("booking_requests")
        .update({
          status: "expired",
          expired_at: now,
          payment_checkout_url: null,
          checkout_creation_token: null,
          checkout_creation_started_at: null,
          updated_at: now,
        })
        .eq("id", booking.id)
        .eq("status", "pending_payment");
      if (booking.whop_checkout_configuration_id) {
        await whop.checkoutConfigurations
          .delete(booking.whop_checkout_configuration_id)
          .catch(() => undefined);
      }
      await notifyCustomer({
        experienceId: booking.whop_experience_id,
        userId: booking.whop_user_id,
        title: "Payment window expired",
        subtitle: booking.booking_offers.title,
        content:
          "The reserved time was released. Submit a new request if you’d still like to book.",
      });
      return Response.json(
        {
          error:
            "The payment window expired and this time has been released. Submit a new request to try again.",
        },
        { status: 410 },
      );
    }

    if (booking.payment_checkout_url) {
      return Response.json({ checkoutUrl: booking.payment_checkout_url });
    }

    const claimToken = crypto.randomUUID();
    const { data: claimed, error: claimError } = await supabase.rpc(
      "claim_booking_checkout",
      {
        p_booking_id: booking.id,
        p_user_id: viewer.userId,
        p_token: claimToken,
      },
    );
    if (claimError) throw claimError;
    if (!claimed) {
      const { data: latest } = await supabase
        .from("booking_requests")
        .select("payment_checkout_url")
        .eq("id", booking.id)
        .maybeSingle();
      if (latest?.payment_checkout_url) {
        return Response.json({ checkoutUrl: latest.payment_checkout_url });
      }
      return Response.json(
        {
          error:
            "Your checkout is already being prepared. Wait a moment and try again.",
        },
        { status: 409 },
      );
    }

    let checkout;
    try {
      checkout = await createBookingCheckout({
        request,
        booking,
        offer: booking.booking_offers,
      });
      if (!checkout.purchase_url) {
        await whop.checkoutConfigurations
          .delete(checkout.id)
          .catch(() => undefined);
        throw new Error("Whop did not return a checkout URL.");
      }
    } catch (checkoutError) {
      await supabase
        .from("booking_requests")
        .update({
          checkout_creation_token: null,
          checkout_creation_started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id)
        .eq("checkout_creation_token", claimToken);
      throw checkoutError;
    }

    const { data: updated, error: updateError } = await supabase
      .from("booking_requests")
      .update({
        whop_checkout_configuration_id: checkout.id,
        payment_checkout_url: checkout.purchase_url,
        checkout_creation_token: null,
        checkout_creation_started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id)
      .eq("checkout_creation_token", claimToken)
      .eq("status", "pending_payment")
      .gt("payment_due_at", new Date().toISOString())
      .select("id")
      .single();
    if (updateError || !updated) {
      await whop.checkoutConfigurations.delete(checkout.id).catch(() => undefined);
      await supabase
        .from("booking_requests")
        .update({
          checkout_creation_token: null,
          checkout_creation_started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id)
        .eq("checkout_creation_token", claimToken);
      return Response.json(
        { error: "The payment window closed. Refresh your bookings." },
        { status: 409 },
      );
    }

    return Response.json({ checkoutUrl: checkout.purchase_url });
  } catch (error) {
    return Response.json(
      { error: checkoutErrorMessage(error) },
      { status: 400 },
    );
  }
}

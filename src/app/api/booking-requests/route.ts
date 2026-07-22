import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getApplicableAvailabilityRules } from "@/lib/availability-server";
import { slotFitsAvailability } from "@/lib/availability-time";
import { companyIdForExperience } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";
import { whop } from "@/lib/whop";

const schema = z.object({
  experienceId: z.string().startsWith("exp_"), companyId: z.string().startsWith("biz_"),
  offerId: z.string().uuid(), coachId: z.string().uuid().nullable().optional(), startsAt: z.iso.datetime(),
  timezone: z.string().min(1).max(100), intakeAnswers: z.record(z.string(), z.unknown()).default({}), memberNote: z.string().max(2000).optional().default(""),
});

function asSecureOrigin(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(candidate);
    return url.protocol === "https:" && url.hostname ? url.origin : null;
  } catch {
    return null;
  }
}

function checkoutReturnOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    requestOrigin,
  ];

  for (const candidate of candidates) {
    const origin = asSecureOrigin(candidate);
    if (origin) return origin;
  }

  throw new Error("A secure HTTPS app URL is required to start checkout.");
}

function checkoutErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Whop checkout could not be started.";

  try {
    const payload = JSON.parse(error.message) as {
      error?: { message?: string };
    };
    return payload.error?.message || error.message;
  } catch {
    return error.message;
  }
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const viewer = await requireRequestViewer(request, input.experienceId);
    const mappedCompanyId = await companyIdForExperience(input.experienceId);
    if (mappedCompanyId !== input.companyId) return Response.json({ error: "Experience does not belong to this company." }, { status: 403 });
    const supabase = getSupabaseAdmin();
    const [{ data: settings, error: settingsError }, { data: offer, error: offerError }] = await Promise.all([
      supabase.from("booking_settings").select("emergency_paused").eq("whop_company_id", input.companyId).maybeSingle(),
      supabase.from("booking_offers").select("*").eq("id", input.offerId).eq("whop_company_id", input.companyId).eq("status", "published").single(),
    ]);
    if (settingsError || offerError || !offer) throw new Error("This offer is not available.");
    if (settings?.emergency_paused) return Response.json({ error: "New bookings are temporarily paused." }, { status: 409 });
    if (input.coachId) {
      const { data: coach } = await supabase.from("coaches").select("id").eq("id", input.coachId).eq("whop_company_id", input.companyId).eq("status", "active").maybeSingle();
      if (!coach) return Response.json({ error: "That coach is not available." }, { status: 409 });
      const { data: links } = await supabase.from("offer_coaches").select("coach_id").eq("offer_id", input.offerId);
      if ((links?.length ?? 0) > 0 && !links?.some((link) => link.coach_id === input.coachId)) {
        return Response.json({ error: "That coach is not assigned to this offer." }, { status: 409 });
      }
    }
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + offer.duration_minutes * 60_000);
    const earliest = Date.now() + offer.min_notice_hours * 3_600_000;
    const latest = Date.now() + offer.max_advance_days * 86_400_000;
    if (startsAt.getTime() < earliest || startsAt.getTime() > latest) return Response.json({ error: "That time is outside this offer’s booking window." }, { status: 409 });
    const rules = await getApplicableAvailabilityRules(supabase, input.companyId, input.offerId, input.coachId ?? null);
    if (!slotFitsAvailability(startsAt, endsAt, rules)) return Response.json({ error: "That time is outside the coach’s available hours." }, { status: 409 });
    const blockedStartsAt = new Date(startsAt.getTime() - offer.buffer_before_minutes * 60_000);
    const blockedEndsAt = new Date(endsAt.getTime() + offer.buffer_after_minutes * 60_000);
    const { data: blocked, error: blockedError } = await supabase.rpc("is_booking_slot_blocked", { p_company_id: input.companyId, p_offer_id: input.offerId, p_coach_id: input.coachId ?? null, p_starts_at: blockedStartsAt.toISOString(), p_ends_at: blockedEndsAt.toISOString(), p_ignore_booking_id: null });
    if (blockedError) throw blockedError;
    if (blocked) return Response.json({ error: "That time was just taken or is unavailable. Choose another time." }, { status: 409 });

    const paid = offer.access_mode === "paid" && offer.price_cents > 0;
    const status = paid ? "pending_payment" : "requested";
    const { data: bookingId, error: bookingCreateError } = await supabase.rpc("create_booking_request_atomic", {
      p_company_id: input.companyId, p_user_id: viewer.userId, p_offer_id: input.offerId, p_coach_id: input.coachId ?? null,
      p_status: status, p_starts_at: startsAt.toISOString(), p_ends_at: endsAt.toISOString(), p_timezone: input.timezone,
      p_intake_answers: input.intakeAnswers, p_member_note: input.memberNote,
    });
    if (bookingCreateError) {
      if (bookingCreateError.message.includes("SLOT_UNAVAILABLE")) return Response.json({ error: "That time was just taken or is unavailable. Choose another time." }, { status: 409 });
      throw bookingCreateError;
    }
    const { data: booking, error: bookingError } = await supabase.from("booking_requests").select("*").eq("id", bookingId).single();
    if (bookingError || !booking) throw bookingError ?? new Error("Booking could not be loaded.");
    await supabase.from("booking_messages").insert({ booking_request_id: booking.id, sender: "system", body: paid ? "Booking request created; awaiting Whop payment." : "Booking request submitted." });

    if (!paid) return Response.json({ booking }, { status: 201 });

    let checkout;
    try {
      if (!process.env.WHOP_API_KEY) {
        throw new Error("Whop checkout is not configured.");
      }

      const redirectBase = checkoutReturnOrigin(request);
      const redirectUrl = new URL(
        `/experiences/${encodeURIComponent(input.experienceId)}?checkout=complete`,
        redirectBase,
      ).toString();

      checkout = await whop.checkoutConfigurations.create({
        company_id: input.companyId,
        plan: offer.whop_plan_id ? undefined : { company_id: input.companyId, initial_price: offer.price_cents / 100, currency: offer.currency, plan_type: "one_time", title: offer.title, description: offer.description, product_id: offer.whop_product_id || undefined },
        plan_id: offer.whop_plan_id || undefined,
        redirect_url: redirectUrl,
        metadata: { offer_id: offer.id, booking_request_id: booking.id, whop_company_id: input.companyId, whop_user_id: viewer.userId },
      });
    } catch (checkoutError) {
      const message = checkoutErrorMessage(checkoutError);
      const now = new Date().toISOString();
      await Promise.all([
        supabase
          .from("booking_requests")
          .update({
            status: "cancelled",
            admin_note: `Checkout was not created: ${message}`,
            updated_at: now,
          })
          .eq("id", booking.id)
          .eq("status", "pending_payment"),
        supabase.from("booking_messages").insert({
          booking_request_id: booking.id,
          sender: "system",
          body: "Checkout could not be started. No payment was collected.",
        }),
      ]);
      throw new Error(message);
    }

    const { error: checkoutLinkError } = await supabase
      .from("booking_requests")
      .update({ whop_checkout_configuration_id: checkout.id })
      .eq("id", booking.id);
    if (checkoutLinkError) throw checkoutLinkError;
    return Response.json({ booking, checkoutUrl: checkout.purchase_url }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create booking request." }, { status: 400 });
  }
}

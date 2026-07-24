import type { Booking, Offer } from "@/lib/types";
import { whop } from "@/lib/whop";

const PRODUCTION_ORIGIN = "https://scaled-coaching-bookings-app.vercel.app";

export function normalizeSecureOrigin(value: string | undefined) {
  const raw = value?.trim().replace(/^['"]|['"]$/g, "");
  if (!raw) return null;

  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(candidate);
    return url.protocol === "https:" && url.hostname ? url.origin : null;
  } catch {
    return null;
  }
}

export function checkoutReturnOrigin(request: Request) {
  const explicitlyConfigured = process.env.NEXT_PUBLIC_APP_URL;
  if (explicitlyConfigured) {
    const origin = normalizeSecureOrigin(explicitlyConfigured);
    if (!origin) {
      throw new Error("The configured app URL must use HTTPS.");
    }
    return origin;
  }

  const candidates = [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    process.env.NODE_ENV === "production"
      ? PRODUCTION_ORIGIN
      : new URL(request.url).origin,
  ];

  for (const candidate of candidates) {
    const origin = normalizeSecureOrigin(candidate);
    if (origin) return origin;
  }

  throw new Error("A secure HTTPS app URL is required to start checkout.");
}

export function buildCheckoutRedirectUrl(
  origin: string,
  experienceId: string,
) {
  const redirectUrl = new URL(
    `/experiences/${encodeURIComponent(experienceId)}?checkout=complete`,
    origin,
  ).toString();
  if (!redirectUrl.startsWith("https://")) {
    throw new Error("Whop checkout requires a secure HTTPS return URL.");
  }
  return redirectUrl;
}

export function checkoutErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Whop checkout could not be started.";

  try {
    const json = error.message.replace(/^\s*\d{3}\s*/, "");
    const payload = JSON.parse(json) as {
      error?: { message?: string };
    };
    if (payload.error?.message) {
      return "Secure checkout could not be opened. Please try again in a moment.";
    }
    return error.message;
  } catch {
    return error.message;
  }
}

function checkoutDiagnosticMessage(error: unknown) {
  if (!(error instanceof Error)) return "Unknown checkout error";
  try {
    const json = error.message.replace(/^\s*\d{3}\s*/, "");
    const payload = JSON.parse(json) as { error?: { message?: string } };
    return payload.error?.message || error.message;
  } catch {
    return error.message;
  }
}

export async function createBookingCheckout({
  request,
  booking,
  offer,
}: {
  request: Request;
  booking: Booking;
  offer: Offer;
}) {
  if (!process.env.WHOP_API_KEY) {
    throw new Error("Whop checkout is not configured.");
  }
  if (!booking.whop_experience_id) {
    throw new Error("This booking is not connected to a Whop experience.");
  }

  const origin = checkoutReturnOrigin(request);
  const redirectUrl = buildCheckoutRedirectUrl(
    origin,
    booking.whop_experience_id,
  );

  try {
    return await whop.checkoutConfigurations.create({
      company_id: booking.whop_company_id,
      mode: "payment",
      plan: offer.whop_plan_id
        ? undefined
        : {
            company_id: booking.whop_company_id,
            initial_price: offer.price_cents / 100,
            currency: offer.currency,
            plan_type: "one_time",
            title: offer.title,
            description: offer.description,
            product_id: offer.whop_product_id || undefined,
          },
      plan_id: offer.whop_plan_id || undefined,
      redirect_url: redirectUrl,
      metadata: {
        offer_id: offer.id,
        booking_request_id: booking.id,
        whop_company_id: booking.whop_company_id,
        whop_user_id: booking.whop_user_id,
      },
    });
  } catch (error) {
    console.error("Whop booking checkout creation failed", {
      bookingId: booking.id,
      origin,
      message: checkoutDiagnosticMessage(error),
    });
    throw error;
  }
}

import type { Booking, Offer } from "@/lib/types";
import { whop } from "@/lib/whop";

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
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    new URL(request.url).origin,
  ];

  for (const candidate of candidates) {
    const origin = asSecureOrigin(candidate);
    if (origin) return origin;
  }

  throw new Error("A secure HTTPS app URL is required to start checkout.");
}

export function checkoutErrorMessage(error: unknown) {
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

  const redirectUrl = new URL(
    `/experiences/${encodeURIComponent(booking.whop_experience_id)}?checkout=complete`,
    checkoutReturnOrigin(request),
  ).toString();

  return whop.checkoutConfigurations.create({
    company_id: booking.whop_company_id,
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
}

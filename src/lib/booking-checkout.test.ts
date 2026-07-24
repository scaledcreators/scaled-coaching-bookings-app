import { afterEach, describe, expect, it, vi } from "vitest";
import type { Booking, Offer } from "@/lib/types";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/whop", () => ({
  whop: { checkoutConfigurations: { create: mocks.create } },
}));
import {
  buildCheckoutRedirectUrl,
  checkoutErrorMessage,
  normalizeSecureOrigin,
  createBookingCheckout,
} from "@/lib/booking-checkout";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalApiKey = process.env.WHOP_API_KEY;

afterEach(() => {
  mocks.create.mockReset();
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  if (originalApiKey === undefined) delete process.env.WHOP_API_KEY;
  else process.env.WHOP_API_KEY = originalApiKey;
});

describe("Whop checkout return URLs", () => {
  it("normalizes the canonical Vercel hostname", () => {
    expect(
      normalizeSecureOrigin(" scaled-coaching-bookings-app.vercel.app/ "),
    ).toBe("https://scaled-coaching-bookings-app.vercel.app");
  });

  it("rejects non-HTTPS origins", () => {
    expect(normalizeSecureOrigin("http://localhost:3000")).toBeNull();
  });

  it("builds an exact HTTPS experience return URL", () => {
    expect(
      buildCheckoutRedirectUrl(
        "https://scaled-coaching-bookings-app.vercel.app",
        "exp_example",
      ),
    ).toBe(
      "https://scaled-coaching-bookings-app.vercel.app/experiences/exp_example?checkout=complete",
    );
  });

  it("extracts a customer-safe Whop error message", () => {
    expect(
      checkoutErrorMessage(
        new Error(
          '400 {"error":{"type":"bad_request","message":"Invalid redirect"}}',
        ),
      ),
    ).toBe(
      "Secure checkout could not be opened. Please try again in a moment.",
    );
  });

  it("sends Whop the exact HTTPS redirect and booking metadata", async () => {
    process.env.NEXT_PUBLIC_APP_URL =
      ' "https://scaled-coaching-bookings-app.vercel.app/" ';
    process.env.WHOP_API_KEY = "test_key";
    mocks.create.mockResolvedValue({
      id: "checkout_1",
      purchase_url: "https://whop.com/checkout/example",
    });
    const booking = {
      id: "11111111-1111-4111-8111-111111111111",
      whop_company_id: "biz_example",
      whop_user_id: "user_example",
      whop_experience_id: "exp_example",
    } as Booking;
    const offer = {
      id: "22222222-2222-4222-8222-222222222222",
      whop_company_id: "biz_example",
      title: "Practice",
      description: "Private practice session",
      price_cents: 20_000,
      currency: "usd",
      whop_plan_id: null,
      whop_product_id: null,
    } as Offer;

    await createBookingCheckout({
      request: new Request("http://localhost:3000/api/checkout"),
      booking,
      offer,
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        redirect_url:
          "https://scaled-coaching-bookings-app.vercel.app/experiences/exp_example?checkout=complete",
        metadata: {
          offer_id: offer.id,
          booking_request_id: booking.id,
          whop_company_id: "biz_example",
          whop_user_id: "user_example",
        },
      }),
    );
  });
});

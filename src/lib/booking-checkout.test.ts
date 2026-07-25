import { afterEach, describe, expect, it, vi } from "vitest";
import type { Booking, Offer } from "@/lib/types";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/whop", () => ({
  whop: { checkoutConfigurations: { create: mocks.create } },
}));
import {
  buildCheckoutRedirectUrl,
  checkoutErrorMessage,
  checkoutReturnOrigin,
  normalizeSecureOrigin,
  createBookingCheckout,
} from "@/lib/booking-checkout";

const originalApiKey = process.env.WHOP_API_KEY;
const originalProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const originalVercelUrl = process.env.VERCEL_URL;

afterEach(() => {
  mocks.create.mockReset();
  if (originalApiKey === undefined) delete process.env.WHOP_API_KEY;
  else process.env.WHOP_API_KEY = originalApiKey;
  if (originalProductionUrl === undefined)
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  else process.env.VERCEL_PROJECT_PRODUCTION_URL = originalProductionUrl;
  if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
  else process.env.VERCEL_URL = originalVercelUrl;
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

  it("does not require a separate app URL environment variable", () => {
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    expect(
      checkoutReturnOrigin(
        new Request("http://localhost:3000/api/booking-requests/example/checkout"),
      ),
    ).toBe("https://scaled-coaching-bookings-app.vercel.app");
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

  it("creates an embeddable payment session with booking metadata", async () => {
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
      booking,
      offer,
    });

    const payload = mocks.create.mock.calls[0]?.[0];
    expect(payload).toEqual(
      expect.objectContaining({
        mode: "payment",
        metadata: {
          offer_id: offer.id,
          booking_request_id: booking.id,
          whop_company_id: "biz_example",
          whop_user_id: "user_example",
        },
      }),
    );
    expect(payload).not.toHaveProperty("redirect_url");
  });
});

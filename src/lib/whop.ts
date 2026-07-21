import { Whop } from "@whop/sdk";

export const whopConfigured = Boolean(
  process.env.WHOP_API_KEY && process.env.NEXT_PUBLIC_WHOP_APP_ID,
);

export const whop = new Whop({
  // The SDK validates construction eagerly. A non-secret placeholder keeps
  // credential-free preview builds working; every live call is gated above.
  apiKey: process.env.WHOP_API_KEY || "missing_whop_api_key",
  appID: process.env.NEXT_PUBLIC_WHOP_APP_ID,
  webhookKey: process.env.WHOP_WEBHOOK_SECRET,
  version: process.env.WHOP_API_VERSION_DATE || undefined,
  baseURL: process.env.WHOP_API_BASE_URL || undefined,
});

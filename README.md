# Scaled Coaching Bookings

A Whop-native, manual-first coaching bookings app. Creators manage offers, availability, first-class blackout windows, coaching requests, and private meeting details. Members browse offers and request times inside their Whop experience. Payments stay entirely in Whop; Supabase stores booking operations; Vercel runs the Next.js app.

## What is implemented

- Whop dashboard view at `/dashboard/[companyId]`, with server-verified admin access
- Whop experience view at `/experiences/[experienceId]`, with server-verified member access
- Premium admin operations UI, member storefront, three-step request flow, and My Bookings
- Emergency pause and full-day/multi-day unavailable windows
- Server-side blackout, booking, hold, notice-window, and advance-window validation
- Transaction-scoped slot lock to prevent two concurrent requests from claiming the same slot
- Whop Checkout Configuration creation with booking metadata for paid offers
- Signed, idempotent Whop webhook handling for payments, invoices, memberships, refunds, disputes, and failures
- Supabase schema, indexes, RLS, booking RPCs, and starter seed
- Responsive, keyboard-accessible interaction and light/dark Whop appearance support

## Connect Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/202607210001_initial_schema.sql` in the SQL editor (or use the Supabase CLI migration flow).
   If the initial schema was installed before the service-role grant fix, also run `supabase/migrations/202607210002_service_role_privileges.sql`.
3. Copy `.env.example` to `.env.local` and add the project URL, anon key, and service-role key.
4. No Whop experience or company IDs need to be seeded. On first authenticated experience access, the server retrieves the experience from Whop, verifies that it belongs to this app, and caches its company relationship in `experience_installations`.

`supabase/seed.sql` is optional sample content for local development. It is not part of production installation.

The browser never receives the service-role key. All app data is accessed through server routes after Whop access checks; RLS is enabled with no direct client policies.

## Connect Whop

1. Create/select the Whop app and add its App API key, app ID, and webhook secret to `.env.local` and Vercel.
2. Set the base URL to the Vercel deployment.
3. Configure the experience path as `/experiences/[experienceId]` and dashboard path as `/dashboard/[companyId]`.
4. Add a `v1` webhook pointing to `https://YOUR_DOMAIN/webhooks/whop`.
5. Subscribe to `payment.succeeded`, `payment.failed`, `invoice.paid`, `refund.created`, `refund.updated`, `dispute.created`, `membership.activated`, and `membership.deactivated`.
6. Grant the app the corresponding checkout, payment, membership, company/app-context, and webhook permissions in the Whop dashboard.

Paid booking requests create a fresh Whop checkout configuration with `offer_id`, `booking_request_id`, `whop_company_id`, and `whop_user_id` metadata. The resulting payment inherits that metadata, allowing the webhook to activate the correct local request.

## Local development

```bash
npm install
npm run dev
```

Without credentials, local development displays carefully labeled preview data. Production does not permit this fallback.

## Deploy

Import `scaledcreators/scaled-coaching-bookings-app` into Vercel, select Next.js, add every value from `.env.example`, and deploy. Set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS URL, then use that URL in Whop’s app and webhook settings.

## Security notes

- Never commit `.env.local`, `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET`, or `SUPABASE_SERVICE_ROLE_KEY`.
- Admin and member authorization is checked server-side using the Whop SDK.
- Every Supabase query is scoped by the trusted Whop company/experience mapping.
- Webhooks are verified against the raw body and deduplicated by `webhook-id`.
- Meeting details are returned only with member-owned booking records and should be added only after confirmation.

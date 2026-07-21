import { waitUntil } from "@vercel/functions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { whop } from "@/lib/whop";

type WhopEvent = { id?: string; type: string; company_id?: string; data: { id?: string; metadata?: Record<string, string>; membership_id?: string } };

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    const event = whop.webhooks.unwrap(raw, { headers: Object.fromEntries(request.headers) }) as unknown as WhopEvent;
    const eventId = request.headers.get("webhook-id") || event.id;
    if (!eventId) return new Response("Missing webhook id", { status: 400 });
    waitUntil(processEvent(eventId, event));
    return new Response("OK");
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }
}

async function processEvent(eventId: string, event: WhopEvent) {
  const supabase = getSupabaseAdmin();
  const existing = await supabase.from("webhook_events").select("processed_at").eq("event_id", eventId).maybeSingle();
  if (existing.data?.processed_at) return;
  const stored = await supabase.from("webhook_events").upsert({ event_id: eventId, whop_company_id: event.company_id ?? null, event_type: event.type, payload: event }, { onConflict: "event_id" });
  if (stored.error) throw stored.error;
  const metadata = event.data.metadata ?? {}; const bookingId = metadata.booking_request_id; const offerId = metadata.offer_id; const userId = metadata.whop_user_id; const companyId = metadata.whop_company_id || event.company_id;
  const activating = ["payment.succeeded", "invoice.paid", "membership.activated"].includes(event.type);
  const revoking = ["payment.failed", "refund.created", "refund.updated", "dispute.created", "membership.deactivated"].includes(event.type);
  if (activating && bookingId) await supabase.from("booking_requests").update({ status: "requested", whop_payment_id: event.type.startsWith("payment") ? event.data.id : null, whop_membership_id: event.type.startsWith("membership") ? event.data.id : null, updated_at: new Date().toISOString() }).eq("id", bookingId);
  if (activating && companyId && userId) await supabase.from("booking_entitlements").upsert({ whop_company_id: companyId, whop_user_id: userId, offer_id: offerId || null, status: "active", source: event.type.startsWith("membership") ? "membership" : "payment", whop_payment_id: event.type.startsWith("payment") ? event.data.id : null, whop_membership_id: event.type.startsWith("membership") ? event.data.id : null, updated_at: new Date().toISOString() }, { onConflict: "whop_company_id,whop_user_id,offer_id,source" });
  if (revoking && bookingId) await supabase.from("booking_requests").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", bookingId).in("status", ["pending_payment", "requested"]);
  if (revoking && companyId && userId) await supabase.from("booking_entitlements").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("whop_company_id", companyId).eq("whop_user_id", userId).eq("offer_id", offerId || null);
  const done = await supabase.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("event_id", eventId); if (done.error) throw done.error;
}

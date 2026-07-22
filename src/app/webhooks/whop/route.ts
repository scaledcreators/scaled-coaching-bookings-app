import { waitUntil } from "@vercel/functions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { whop } from "@/lib/whop";

type EventObject = { id?: string; status?: string; metadata?: Record<string, string>; payment?: EventObject };
type WhopEvent = { id?: string; type: string; company_id?: string; data: EventObject };

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    const event = whop.webhooks.unwrap(raw, { headers: Object.fromEntries(request.headers) }) as unknown as WhopEvent;
    const eventId = request.headers.get("webhook-id") || event.id;
    if (!eventId) return new Response("Missing webhook id", { status: 400 });
    waitUntil(processEvent(eventId, event)); return new Response("OK");
  } catch { return new Response("Invalid webhook signature", { status: 400 }); }
}

async function processEvent(eventId: string, event: WhopEvent) {
  const supabase = getSupabaseAdmin();
  const existing = await supabase.from("webhook_events").select("processed_at").eq("event_id", eventId).maybeSingle();
  if (existing.data?.processed_at) return;
  const stored = await supabase.from("webhook_events").upsert({ event_id: eventId, whop_company_id: event.company_id ?? null, event_type: event.type, payload: event }, { onConflict: "event_id" });
  if (stored.error) throw stored.error;

  const payment = event.data.payment ?? event.data;
  const metadata = payment.metadata ?? event.data.metadata ?? {};
  let bookingId = metadata.booking_request_id;
  const paymentId = event.type.startsWith("refund.") ? payment.id : event.type.startsWith("payment.") ? event.data.id : undefined;
  if (!bookingId && paymentId) {
    const lookup = await supabase.from("booking_requests").select("id").eq("whop_payment_id", paymentId).maybeSingle(); bookingId = lookup.data?.id;
  }
  const offerId = metadata.offer_id; const userId = metadata.whop_user_id; const companyId = metadata.whop_company_id || event.company_id;

  if (["payment.succeeded", "invoice.paid"].includes(event.type) && bookingId) {
    await supabase.from("booking_requests").update({ status: "requested", whop_payment_id: paymentId ?? null, updated_at: new Date().toISOString() }).eq("id", bookingId).eq("status", "pending_payment");
  }
  if (event.type === "payment.failed" && bookingId) await supabase.from("booking_requests").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", bookingId).eq("status", "pending_payment");

  if (event.type.startsWith("refund.") && bookingId) {
    const refundStatus = /succeed|complete|refunded/.test(event.data.status ?? "") ? "refunded" : /fail|declin/.test(event.data.status ?? "") ? "failed" : "processing";
    await supabase.from("booking_requests").update({ status: "cancelled", refund_status: refundStatus, whop_refund_id: event.data.id ?? null, refunded_at: refundStatus === "refunded" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", bookingId);
  }
  if (event.type === "dispute.created" && bookingId) await supabase.from("booking_requests").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", bookingId);

  if (["payment.succeeded", "invoice.paid", "membership.activated"].includes(event.type) && companyId && userId) await supabase.from("booking_entitlements").upsert({ whop_company_id: companyId, whop_user_id: userId, offer_id: offerId || null, status: "active", source: event.type.startsWith("membership") ? "membership" : "payment", whop_payment_id: paymentId ?? null, whop_membership_id: event.type.startsWith("membership") ? event.data.id : null, updated_at: new Date().toISOString() }, { onConflict: "whop_company_id,whop_user_id,offer_id,source" });
  if (["refund.created", "refund.updated", "dispute.created", "membership.deactivated"].includes(event.type) && companyId && userId) await supabase.from("booking_entitlements").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("whop_company_id", companyId).eq("whop_user_id", userId).eq("offer_id", offerId || null);
  const done = await supabase.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("event_id", eventId); if (done.error) throw done.error;
}

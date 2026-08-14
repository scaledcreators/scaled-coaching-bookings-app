"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  ExternalLink,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";
import type { Booking, DashboardData, Offer } from "@/lib/types";
import {
  BookingCalendar,
  type BookingCalendarDay,
} from "@/components/booking-calendar";
import { AppBrand } from "@/components/app-brand";
import { OverlayPortal } from "@/components/overlay-portal";
import {
  TenantThemeProvider,
  useTenantTheme,
} from "@/components/tenant-theme-provider";
import {
  RefreshButton,
  useLiveRefresh,
} from "@/components/live-refresh";
import {
  bookingStatusLabel,
  bookingStatusTone,
} from "@/lib/booking-status";
import { formatPaymentTimeRemaining } from "@/lib/payment-countdown";
import { getIframeSdk } from "@/lib/iframe-sdk";
import { CustomSelect } from "@/components/custom-select";
import { CustomCheckbox } from "@/components/custom-checkbox";
import {
  normalizeIntakeSchema,
} from "@/lib/intake-forms";
import { deliveryModeLabel } from "@/lib/delivery-mode";

const money = (cents: number) =>
  cents === 0
    ? "Free"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(cents / 100);
const previewSlots = [2, 3, 4, 7, 8].map((days, index) => {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setHours([10, 13, 15, 11, 14][index], 0, 0, 0);
  return date;
});

function dateKeyInTimezone(value: Date, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function monthKeyInTimezone(value: Date, timezone: string) {
  return dateKeyInTimezone(value, timezone).slice(0, 7);
}

function groupPreviewDays(timezone: string): BookingCalendarDay[] {
  const grouped = new Map<string, string[]>();
  for (const slot of previewSlots) {
    const key = dateKeyInTimezone(slot, timezone);
    grouped.set(key, [...(grouped.get(key) ?? []), slot.toISOString()]);
  }
  return [...grouped.entries()].map(([date, slots]) => ({
    date,
    slots,
    capacity: 4,
    bookedCount: 0,
  }));
}

export function MemberExperience({
  experienceId,
  userId,
  data,
  checkoutComplete,
}: {
  experienceId: string;
  userId: string;
  data: DashboardData;
  checkoutComplete: boolean;
}) {
  return (
    <TenantThemeProvider initialSettings={data.settings}>
      <MemberExperienceContent
        experienceId={experienceId}
        userId={userId}
        data={data}
        checkoutComplete={checkoutComplete}
      />
    </TenantThemeProvider>
  );
}

function MemberExperienceContent({
  experienceId,
  userId,
  data,
  checkoutComplete,
}: {
  experienceId: string;
  userId: string;
  data: DashboardData;
  checkoutComplete: boolean;
}) {
  const [view, setView] = useState<"offers" | "bookings">(
    checkoutComplete ? "bookings" : "offers",
  );
  const [selected, setSelected] = useState<Offer | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [supportSent, setSupportSent] = useState(false);
  const [liveData, setLiveData] = useState(data);
  const [bookings, setBookings] = useState(
    data.bookings.filter((booking) => booking.whop_user_id === userId),
  );
  const { settings, replaceSettings } = useTenantTheme();
  const applyLiveData = useCallback(
    (next: DashboardData) => {
      setLiveData(next);
      setBookings(
        next.bookings.filter((booking) => booking.whop_user_id === userId),
      );
      replaceSettings(next.settings);
    },
    [replaceSettings, userId],
  );
  const urgent = bookings.some(
    (booking) =>
      booking.status === "pending_payment" ||
      ["requested", "processing"].includes(booking.refund_status ?? ""),
  );
  const { refresh, refreshing, lastUpdated, refreshError } =
    useLiveRefresh<DashboardData>({
      url: `/api/experience-data?experienceId=${encodeURIComponent(experienceId)}`,
      onData: applyLiveData,
      urgent,
    });
  return (
    <main className="theme-root member-shell">
      <nav className="member-nav">
        <AppBrand variant="member" />
        <div className="member-tabs">
          <button
            className={view === "offers" ? "active" : ""}
            onClick={() => setView("offers")}
          >
            {settings.service_label_plural}
          </button>
          <button
            className={view === "bookings" ? "active" : ""}
            onClick={() => setView("bookings")}
          >
            {settings.member_bookings_label}
          </button>
        </div>
        <div className="member-nav-actions">
          <RefreshButton
            refreshing={refreshing}
            lastUpdated={lastUpdated}
            onRefresh={() => void refresh(true)}
          />
          <button className="support-button" onClick={() => setHelpOpen(true)}>
            <MessageCircle size={17} /> Help
          </button>
        </div>
      </nav>
      {refreshError && <p className="live-refresh-error">{refreshError}</p>}
      {supportSent && (
        <p className="support-success-toast" role="status">
          <Check size={16} /> Message sent through Whop
        </p>
      )}
      {checkoutComplete && (
        <div className="checkout-banner">
          <Check size={18} />
          <div>
            <strong>Payment received.</strong>
            <p>
              Whop is confirming the charge. Your session will show as
              Confirmed as soon as the payment event finishes processing.
            </p>
          </div>
        </div>
      )}
      {view === "offers" ? (
        <Offers data={liveData} onSelect={setSelected} />
      ) : (
        <MyBookings
          experienceId={experienceId}
          demo={data.demo}
          bookings={bookings}
          timezone={liveData.settings.default_timezone}
          onRefresh={() => void refresh()}
          onChange={(updated) =>
            setBookings((items) =>
              items.map((item) => (item.id === updated.id ? updated : item)),
            )
          }
          heading={settings.member_bookings_label}
          serviceLabelSingular={settings.service_label_singular}
          serviceLabelPlural={settings.service_label_plural}
        />
      )}
      <footer className="member-footer">
        <span>Times shown in {liveData.settings.default_timezone}</span>
        <span>Payments securely handled by Whop</span>
      </footer>
      {selected && (
        <BookingFlow
          experienceId={experienceId}
          offer={selected}
          data={liveData}
          onClose={() => setSelected(null)}
          onSubmitted={(booking) => {
            setBookings((items) => [booking, ...items]);
            setView("bookings");
            void refresh();
          }}
        />
      )}{" "}
      {helpOpen && (
        <HelpDialog
          experienceId={experienceId}
          onClose={() => setHelpOpen(false)}
          onSent={() => {
            setHelpOpen(false);
            setSupportSent(true);
            window.setTimeout(() => setSupportSent(false), 3_500);
          }}
        />
      )}
    </main>
  );
}

function Offers({
  data,
  onSelect,
}: {
  data: DashboardData;
  onSelect: (offer: Offer) => void;
}) {
  const offers = data.offers.filter((offer) => offer.status === "published");
  return (
    <>
      <section className="member-hero">
        <div>
          <p className="eyebrow">
            Private {data.settings.service_label_plural.toLowerCase()}
          </p>
          <h1>
            Make your next move
            <br />
            <span className="gradient-text">the right one.</span>
          </h1>
          <p>
            Choose a {data.settings.service_label_singular.toLowerCase()} and
            share what you’d like to work through. Your
            provider reviews every request personally.
          </p>
        </div>
      </section>
      <div className="confirmation-strip">
        <ShieldCheck size={19} />
        <p>
          <strong>Personally confirmed.</strong> Private meeting details appear
          after your requested time is approved and any required payment is
          complete.
        </p>
      </div>
      {data.emergencyPaused ? (
        <div className="member-pause">
          <Clock3 />
          <div>
            <strong>New bookings are temporarily paused.</strong>
            <p>
              Your existing {data.settings.service_label_plural.toLowerCase()} remain
              under {data.settings.member_bookings_label}.
            </p>
          </div>
        </div>
      ) : offers.length === 0 ? (
        <div className="notice-empty member-offers-empty sc-card">
          <CalendarDays />
          <strong>{data.settings.service_label_plural} are coming soon</strong>
          <p>
            There aren’t any {data.settings.service_label_plural.toLowerCase()} available
            to request yet. Check back shortly or use Help to contact the team.
          </p>
        </div>
      ) : (
        <section className="offer-grid">
          {offers.map((offer) => (
            <article className="member-offer" key={offer.id}>
              <div className="offer-top">
                <span className="offer-icon">{offer.duration_minutes}</span>
                <span className="status-badge draft">
                  {offer.price_cents
                    ? `Paid ${data.settings.service_label_singular.toLowerCase()}`
                    : `Free ${data.settings.service_label_singular.toLowerCase()}`}
                </span>
              </div>
              <div>
                <h2>{offer.title}</h2>
                <p>{offer.description}</p>
              </div>
              <div className="offer-details">
                <span>
                  <Clock3 size={16} />
                  {offer.duration_minutes} minutes
                </span>
                <span>
                  <CalendarDays size={16} />
                  Personally confirmed
                </span>
                <span>
                  {offer.delivery_mode === "in_person" ? (
                    <MapPin size={16} />
                  ) : offer.delivery_mode === "video" ? (
                    <Video size={16} />
                  ) : offer.delivery_mode === "phone" ? (
                    <Phone size={16} />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  {deliveryModeLabel(offer.delivery_mode)}
                </span>
              </div>
              <div className="offer-footer">
                <strong>{money(offer.price_cents)}</strong>
                <button
                  className="sc-btn-primary"
                  onClick={() => onSelect(offer)}
                >
                  Request a time
                  <ArrowRight size={16} />
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

function HelpDialog({
  experienceId,
  onClose,
  onSent,
}: {
  experienceId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ experienceId, subject, message }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not send your message.");
      }
      onSent();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not send your message.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal help-modal sc-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Customer support</p>
            <h2 id="help-title">How can we help?</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close help"
          >
            <X size={18} />
          </button>
        </div>
        <form className="help-form" onSubmit={submit}>
          <div className="help-contact-intro">
            <MessageCircle size={21} />
            <p>
              Send a message directly to the coaching team through Whop. Add
              any session or booking details that will help us respond.
            </p>
          </div>
          <label className="field">
            <span>Subject</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={160}
              placeholder="What do you need help with?"
              required
            />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={5_000}
              placeholder="Tell the coaching team what’s going on."
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions help-actions">
            <button
              type="button"
              className="sc-btn-secondary"
              onClick={onClose}
              disabled={sending}
            >
              Cancel
            </button>
            <button
              className="sc-btn-primary"
              disabled={sending || !subject.trim() || !message.trim()}
            >
              {sending ? "Sending…" : "Send message"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function MyBookings({
  experienceId,
  demo,
  bookings,
  timezone,
  onChange,
  onRefresh,
  heading,
  serviceLabelSingular,
  serviceLabelPlural,
}: {
  experienceId: string;
  demo: boolean;
  bookings: Booking[];
  timezone: string;
  onChange: (booking: Booking) => void;
  onRefresh: () => void;
  heading: string;
  serviceLabelSingular: string;
  serviceLabelPlural: string;
}) {
  const [dialog, setDialog] = useState<{
    type: "refund" | "reschedule" | "cancel";
    booking: Booking;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [newTime, setNewTime] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [fallbackCheckout, setFallbackCheckout] = useState<{
    bookingId: string;
    url: string;
  } | null>(null);
  const [paymentNotice, setPaymentNotice] = useState("");
  const [countdownNow, setCountdownNow] = useState<number | null>(null);
  const hasPaymentCountdown = bookings.some(
    (booking) =>
      booking.status === "pending_payment" && Boolean(booking.payment_due_at),
  );

  useEffect(() => {
    if (!hasPaymentCountdown) return;
    const updateCountdown = () => setCountdownNow(Date.now());
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 30_000);
    return () => window.clearInterval(interval);
  }, [hasPaymentCountdown]);

  async function beginPayment(booking: Booking) {
    setPayingId(booking.id);
    setError("");
    setFallbackCheckout(null);
    try {
      const response = await fetch(
        `/api/booking-requests/${booking.id}/checkout`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ experienceId }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        checkoutSessionId?: string;
        checkoutUrl?: string;
        planId?: string;
      };
      if (!response.ok) {
        if (response.status === 410) {
          onChange({
            ...booking,
            status: "expired",
            expired_at: new Date().toISOString(),
          });
        }
        throw new Error(payload.error || "Could not start payment.");
      }
      if (!payload.checkoutSessionId || !payload.planId) {
        throw new Error("Whop did not return a secure checkout session.");
      }
      if (payload.checkoutUrl) {
        setFallbackCheckout({
          bookingId: booking.id,
          url: payload.checkoutUrl,
        });
      }
      const result = await getIframeSdk().inAppPurchase({
        planId: payload.planId,
        id: payload.checkoutSessionId,
      });
      if (result.status !== "ok") {
        throw new Error(result.error || "Checkout was not completed.");
      }
      setFallbackCheckout(null);
      setPaymentNotice(
        "Whop is confirming your payment. This booking will update automatically.",
      );
      onRefresh();
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Could not start payment.",
      );
    } finally {
      setPayingId(null);
    }
  }

  async function act() {
    if (!dialog) return;
    setSaving(true);
    setError("");
    try {
      let updated: Booking;
      if (demo)
        updated = {
          ...dialog.booking,
          status:
            dialog.type === "reschedule" ? "reschedule_requested" : "cancelled",
          ...(dialog.type === "refund"
            ? { refund_status: "requested" as const, refund_reason: reason }
            : {}),
          ...(dialog.type === "reschedule"
            ? { requested_start_at: new Date(newTime).toISOString() }
            : {}),
        };
      else {
        const refund = dialog.type === "refund";
        const response = await fetch(
          `/api/booking-requests/${dialog.booking.id}/${refund ? "refund-request" : "customer-action"}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              refund
                ? { experienceId, reason }
                : dialog.type === "cancel"
                  ? { experienceId, action: "cancel" }
                  : {
                      experienceId,
                      action: "reschedule",
                      startsAt: new Date(newTime).toISOString(),
                    },
            ),
          },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        updated = payload.booking;
      }
      onChange(updated);
      onRefresh();
      setDialog(null);
      setReason("");
      setNewTime("");
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Could not update booking.",
      );
    } finally {
      setSaving(false);
    }
  }
  const closedStatuses = [
    "completed",
    "no_show",
    "rejected",
    "expired",
    "cancelled",
  ];
  const bookingGroups = [
    {
      title: "Needs action",
      description: `Complete these steps to secure your ${serviceLabelSingular.toLowerCase()}.`,
      items: bookings.filter((booking) => booking.status === "pending_payment"),
    },
    {
      title: "Upcoming",
      description: `Requests under review and confirmed ${serviceLabelPlural.toLowerCase()}.`,
      items: bookings.filter(
        (booking) =>
          booking.status !== "pending_payment" &&
          !closedStatuses.includes(booking.status),
      ),
    },
    {
      title: "Past",
      description: "Your completed and closed booking history.",
      items: bookings.filter((booking) =>
        closedStatuses.includes(booking.status),
      ),
    },
  ].filter((group) => group.items.length > 0);
  return (
    <section className="member-bookings">
      <p className="eyebrow">Your {serviceLabelPlural.toLowerCase()}</p>
      <h1>{heading}</h1>
      {paymentNotice && (
        <div className="checkout-banner" role="status">
          <Check size={18} />
          <div>
            <strong>Payment submitted.</strong>
            <p>
              Whop is confirming the charge. This booking will update
              automatically as soon as the payment event is received.
            </p>
          </div>
        </div>
      )}
      {error && !dialog && <p className="form-error action-error">{error}</p>}
      <div className="member-booking-list">
        {bookings.length === 0 && (
          <div className="notice-empty sc-card">
            <CalendarDays />
            <strong>No {serviceLabelPlural.toLowerCase()} yet</strong>
            <p>
              Choose a {serviceLabelSingular.toLowerCase()} when you’re ready.
            </p>
          </div>
        )}
        {bookingGroups.map((group) => (
          <section className="member-booking-group" key={group.title}>
            <header>
              <div>
                <h2>{group.title}</h2>
                <p>{group.description}</p>
              </div>
              <span>{group.items.length}</span>
            </header>
            <div className="member-booking-group-list">
        {group.items.map((booking) => {
          const active = ![
            "completed",
            "no_show",
            "rejected",
            "expired",
            "cancelled",
          ].includes(booking.status);
          const refundOpen = ["requested", "processing", "refunded"].includes(
            booking.refund_status ?? "",
          );
          const hasMeetingDetails =
            booking.status === "confirmed" &&
            Boolean(
              booking.meeting_location ||
                booking.meeting_url ||
                booking.manual_join_instructions,
            );
          const paymentTimeRemaining =
            booking.status === "pending_payment" &&
            booking.payment_due_at &&
            countdownNow !== null
              ? formatPaymentTimeRemaining(
                  booking.payment_due_at,
                  countdownNow,
                )
              : null;
          return (
            <article
              className={`member-booking-card sc-card ${hasMeetingDetails ? "has-meeting-details" : "single-column"}`}
              key={booking.id}
            >
              <div>
                <div className="booking-card-status-row">
                  <span
                    className={`health-badge ${bookingStatusTone(booking.status)}`}
                  >
                    {booking.refund_status &&
                    booking.refund_status !== "not_requested"
                      ? `refund ${booking.refund_status}`
                      : bookingStatusLabel(booking.status)}
                  </span>
                  {paymentTimeRemaining && (
                    <span className="payment-countdown-chip">
                      <Clock3 size={13} aria-hidden />
                      {paymentTimeRemaining}
                    </span>
                  )}
                </div>
                <h2>{booking.booking_offers?.title}</h2>
                <p>
                  {booking.requested_start_at
                    ? new Intl.DateTimeFormat("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: timezone,
                      }).format(
                        new Date(
                          booking.confirmed_start_at ??
                            booking.requested_start_at,
                        ),
                      )
                    : "Time pending"}
                </p>
                {booking.status === "pending_approval" && (
                  <div className="booking-state-note">
                    <strong>Waiting for coach approval</strong>
                    <span>
                      {booking.whop_payment_id
                        ? "Payment was collected under the previous booking flow. If rejected, it will be returned automatically."
                        : "No payment has been taken."}
                    </span>
                  </div>
                )}
                {booking.status === "pending_payment" && (
                  <>
                    <p className="payment-approval-copy">
                      Your request was approved. Complete payment
                      {booking.payment_due_at
                        ? ` by ${new Intl.DateTimeFormat("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: timezone,
                          }).format(new Date(booking.payment_due_at))}`
                        : " within 24 hours"}
                      {" to confirm this time."}
                    </p>
                    <div className="payment-action-row">
                      <button
                        className="payment-cancel-button"
                        onClick={() =>
                          setDialog({ type: "cancel", booking })
                        }
                      >
                        Cancel booking
                      </button>
                      <button
                        className="sc-btn-primary"
                        disabled={payingId === booking.id}
                        onClick={() => beginPayment(booking)}
                      >
                        {payingId === booking.id
                          ? "Preparing checkout…"
                          : "Complete payment"}
                        <ArrowRight size={15} />
                      </button>
                    </div>
                    {fallbackCheckout?.bookingId === booking.id && (
                      <a
                        className="checkout-fallback-link"
                        href={fallbackCheckout.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open secure checkout in a new tab
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </>
                )}
                {booking.status === "rejected" && (
                  <div className="booking-state-note closed">
                    <strong>Request not approved</strong>
                    <span>No payment was taken.</span>
                  </div>
                )}
                {booking.status === "expired" && (
                  <div className="booking-state-note closed">
                    <strong>Payment window expired</strong>
                    <span>This time has been released. You can request another.</span>
                  </div>
                )}
                {booking.status === "confirmed" && !hasMeetingDetails && (
                  <div className="booking-state-note">
                    <strong>Your session is confirmed</strong>
                    <span>
                      Private meeting details will appear here when your coach
                      adds them.
                    </span>
                  </div>
                )}
                <div className="member-booking-actions">
                  {booking.status === "confirmed" && (
                    <button
                      onClick={() => setDialog({ type: "reschedule", booking })}
                    >
                      <RefreshCw size={14} /> Request new time
                    </button>
                  )}
                  {active && booking.whop_payment_id && !refundOpen && (
                    <button
                      onClick={() => setDialog({ type: "refund", booking })}
                    >
                      Cancel & request refund
                    </button>
                  )}
                  {active &&
                    !booking.whop_payment_id &&
                    booking.status !== "pending_payment" && (
                    <button
                      onClick={() => setDialog({ type: "cancel", booking })}
                    >
                      Cancel booking
                    </button>
                  )}
                </div>
              </div>
              {hasMeetingDetails && (
                <div className="meeting-box">
                  <LockKeyhole size={18} />
                  <div>
                    <strong>
                      {booking.meeting_location || "Private meeting"}
                    </strong>
                    <p>
                      {booking.manual_join_instructions ||
                        "Your coach will add private joining instructions here."}
                    </p>
                    {booking.meeting_url && (
                      <a
                        href={booking.meeting_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open meeting <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
            </div>
          </section>
        ))}
      </div>
      {dialog && (
        <div className="modal-backdrop">
          <div className="modal sc-card">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Manage booking</p>
                <h2>
                  {dialog.type === "refund"
                    ? "Cancel & request refund"
                    : dialog.type === "reschedule"
                      ? "Request another time"
                      : "Cancel booking"}
                </h2>
              </div>
              <button className="icon-button" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </div>
            {dialog.type === "refund" && (
              <div className="field">
                <label>Reason</label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Tell the coach why you need a refund"
                />
              </div>
            )}
            {dialog.type === "reschedule" && (
              <div className="field">
                <label>Preferred new time</label>
                <input
                  type="datetime-local"
                  value={newTime}
                  onChange={(event) => setNewTime(event.target.value)}
                />
              </div>
            )}
            {dialog.type === "cancel" && (
              <div className="notice">
                <span>
                  This releases the requested time immediately. No payment has
                  been taken.
                </span>
              </div>
            )}
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button
                className="sc-btn-secondary"
                onClick={() => setDialog(null)}
              >
                Go back
              </button>
              <button
                className="sc-btn-primary"
                disabled={
                  saving ||
                  (dialog.type === "refund" && reason.trim().length < 3) ||
                  (dialog.type === "reschedule" && !newTime)
                }
                onClick={act}
              >
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function BookingFlow({
  experienceId,
  offer,
  data,
  onClose,
  onSubmitted,
}: {
  experienceId: string;
  offer: Offer;
  data: DashboardData;
  onClose: () => void;
  onSubmitted: (booking: Booking) => void;
}) {
  const timezone = data.settings.default_timezone;
  const previewDays = groupPreviewDays(timezone);
  const initialMonth = data.demo
    ? previewDays[0]?.date.slice(0, 7) ??
      monthKeyInTimezone(new Date(), timezone)
    : monthKeyInTimezone(new Date(), timezone);
  const [step, setStep] = useState(1);
  const [slot, setSlot] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [month, setMonth] = useState(initialMonth);
  const [earliestMonth, setEarliestMonth] = useState(initialMonth);
  const [latestMonth, setLatestMonth] = useState(
    data.demo
      ? previewDays.at(-1)?.date.slice(0, 7) ?? initialMonth
      : initialMonth,
  );
  const intakeSchema = normalizeIntakeSchema(offer.intake_schema);
  const [intakeAnswers, setIntakeAnswers] = useState<
    Record<string, string | string[]>
  >({});
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [days, setDays] = useState<BookingCalendarDay[]>(
    data.demo
      ? previewDays.filter((day) => day.date.startsWith(initialMonth))
      : [],
  );
  const [loading, setLoading] = useState(!data.demo);
  useEffect(() => {
    if (data.demo) return;
    const controller = new AbortController();
    let active = true;
    const query = new URLSearchParams({
      experienceId,
      offerId: offer.id,
      month,
    });
    fetch(`/api/availability/slots?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Could not load times.");
        if (active) {
          setDays(body.days as BookingCalendarDay[]);
          setEarliestMonth(body.earliestMonth as string);
          setLatestMonth(body.latestMonth as string);
        }
      })
      .catch((value) => {
        if (value instanceof DOMException && value.name === "AbortError") return;
        if (active) {
          setError(
            value instanceof Error ? value.message : "Could not load times.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [data.demo, experienceId, month, offer.id]);
  function changeMonth(nextMonth: string) {
    setMonth(nextMonth);
    setSelectedDate("");
    setSlot("");
    setError("");
    if (data.demo) {
      setDays(previewDays.filter((day) => day.date.startsWith(nextMonth)));
    } else {
      setLoading(true);
    }
  }
  async function submit() {
    setSaving(true);
    setError("");
    try {
      if (!data.demo) {
        const response = await fetch("/api/booking-requests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            experienceId,
            companyId: data.companyId,
            offerId: offer.id,
            startsAt: slot,
            timezone,
            intakeAnswers,
            memberNote: "",
          }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        onSubmitted(body.booking);
      }
      setSent(true);
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Could not send request.",
      );
    } finally {
      setSaving(false);
    }
  }
  const intakeComplete = intakeSchema.fields.every((field) => {
    if (!field.required) return true;
    const answer = intakeAnswers[field.id];
    return Array.isArray(answer)
      ? answer.length > 0
      : typeof answer === "string" && answer.trim().length > 0;
  });
  if (sent)
    return (
      <OverlayPortal>
        <div className="modal-backdrop success-backdrop">
          <section
            className="booking-modal sc-card success-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-success-title"
          >
            <span className="success-icon" aria-hidden>
              <Check size={27} strokeWidth={2.4} />
            </span>
            <div className="success-copy" aria-live="polite">
              <p className="eyebrow">Request received</p>
              <h2 id="request-success-title">You’re all set for now.</h2>
              <p>
                {offer.price_cents > 0
                  ? "No payment has been taken. If approved, you’ll have up to 24 hours to pay and confirm your time."
                  : `No payment is needed. Your ${data.settings.service_label_singular.toLowerCase()} will be confirmed as soon as the coach approves your request.`}
              </p>
            </div>
            <div className="success-next-step">
              <span aria-hidden>
                <Clock3 size={18} />
              </span>
              <div>
                <small>Next step</small>
                <strong>Waiting for coach approval</strong>
              </div>
            </div>
            <button className="sc-btn-primary" onClick={onClose}>
              View {data.settings.member_bookings_label.toLowerCase()} <ArrowRight size={16} />
            </button>
          </section>
        </div>
      </OverlayPortal>
    );
  return (
    <OverlayPortal>
      <div className="modal-backdrop">
        <section
          className={`booking-modal sc-card ${step === 1 ? "calendar-booking-modal" : ""}`}
        >
        <header className="booking-modal-head">
          <button
            className="icon-button"
            onClick={step === 1 ? onClose : () => setStep(step - 1)}
          >
            {step === 1 ? <X size={19} /> : <ArrowLeft size={19} />}
          </button>
          <div>
            <small>Step {step} of 3</small>
            <span className="progress-track">
              <i style={{ width: `${step * 33.333}%` }} />
            </span>
          </div>
        </header>
        {step === 1 && (
          <div className="flow-content">
            <p className="eyebrow">Choose a time</p>
            <h2>{offer.title}</h2>
            <BookingCalendar
              month={month}
              earliestMonth={earliestMonth}
              latestMonth={latestMonth}
              days={days}
              timezone={timezone}
              selectedDate={selectedDate}
              selectedSlot={slot}
              loading={loading}
              onMonthChange={changeMonth}
              onDateChange={(date) => {
                setSelectedDate(date);
                setSlot("");
              }}
              onSlotChange={setSlot}
            />
            {!loading && days.length === 0 && !error && (
              <div className="notice calendar-notice">
                No request times are open in this month.
              </div>
            )}
            {error && <p className="form-error">{error}</p>}
            <button
              className="sc-btn-primary full-button"
              disabled={!slot}
              onClick={() => setStep(2)}
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
        )}
        {step === 2 && (
          <div className="flow-content">
            <p className="eyebrow">A little context</p>
            <h2>{intakeSchema.title || "Before your session"}</h2>
            {intakeSchema.description && <p>{intakeSchema.description}</p>}
            {intakeSchema.fields.length === 0 && (
              <div className="notice">
                No intake questions are needed for this request.
              </div>
            )}
            <div className="member-intake-fields">
              {intakeSchema.fields.map((field) => {
                const answer = intakeAnswers[field.id];
                const label = (
                  <>
                    {field.label}
                    {!field.required && (
                      <span className="muted"> Optional</span>
                    )}
                  </>
                );
                if (field.type === "long_text") {
                  return (
                    <div className="field" key={field.id}>
                      <label>{label}</label>
                      <textarea
                        value={typeof answer === "string" ? answer : ""}
                        placeholder={field.placeholder}
                        maxLength={4000}
                        onChange={(event) =>
                          setIntakeAnswers((current) => ({
                            ...current,
                            [field.id]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  );
                }
                if (field.type === "single_choice" || field.type === "yes_no") {
                  const options =
                    field.type === "yes_no"
                      ? ["Yes", "No"].map((value) => ({ value, label: value }))
                      : (field.options ?? []).map((value) => ({
                          value,
                          label: value,
                        }));
                  return (
                    <div className="field" key={field.id}>
                      <label>{label}</label>
                      <CustomSelect
                        value={typeof answer === "string" ? answer : ""}
                        options={options}
                        placeholder="Choose an answer"
                        onChange={(value) =>
                          setIntakeAnswers((current) => ({
                            ...current,
                            [field.id]: value,
                          }))
                        }
                      />
                    </div>
                  );
                }
                if (field.type === "multi_choice") {
                  const selected = Array.isArray(answer) ? answer : [];
                  return (
                    <fieldset className="member-intake-choices" key={field.id}>
                      <legend>{label}</legend>
                      {(field.options ?? []).map((option) => (
                        <CustomCheckbox
                          key={option}
                          checked={selected.includes(option)}
                          label={option}
                          onChange={(checked) =>
                            setIntakeAnswers((current) => ({
                              ...current,
                              [field.id]: checked
                                ? [...selected, option]
                                : selected.filter((item) => item !== option),
                            }))
                          }
                        />
                      ))}
                    </fieldset>
                  );
                }
                return (
                  <div className="field" key={field.id}>
                    <label>{label}</label>
                    <input
                      type={field.type === "date" ? "date" : "text"}
                      value={typeof answer === "string" ? answer : ""}
                      placeholder={field.placeholder}
                      maxLength={field.type === "short_text" ? 500 : undefined}
                      onChange={(event) =>
                        setIntakeAnswers((current) => ({
                          ...current,
                          [field.id]: event.target.value,
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
            <button
              className="sc-btn-primary full-button"
              disabled={!intakeComplete}
              onClick={() => setStep(3)}
            >
              Review request <ArrowRight size={16} />
            </button>
          </div>
        )}
        {step === 3 && (
          <div className="flow-content">
            <p className="eyebrow">Review</p>
            <h2>Ready to send?</h2>
            <div className="request-summary">
              <div>
                <span>{data.settings.service_label_singular}</span>
                <strong>{offer.title}</strong>
              </div>
              <div>
                <span>Preferred time</span>
                <strong>
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: data.settings.default_timezone,
                  }).format(new Date(slot))}
                </strong>
              </div>
              <div>
                <span>Price</span>
                <strong>
                  {money(offer.price_cents)}
                  {offer.price_cents ? " after approval via Whop" : ""}
                </strong>
              </div>
              <div>
                <span>Delivery</span>
                <strong>{deliveryModeLabel(offer.delivery_mode)}</strong>
              </div>
              {intakeSchema.fields.length > 0 && (
                <div>
                  <span>Intake</span>
                  <strong>
                    {intakeSchema.fields.length} answer
                    {intakeSchema.fields.length === 1 ? "" : "s"} included
                  </strong>
                </div>
              )}
            </div>
            <div className="notice">
              <ShieldCheck size={17} />
              <span>
                {offer.price_cents
                  ? "Your coach reviews this request before payment. If approved, you’ll have up to 24 hours to pay and confirm the slot."
                  : "This request still needs coach approval. No payment is required."}
              </span>
            </div>
            {error && <p className="form-error">{error}</p>}
            <button
              className="sc-btn-primary full-button"
              disabled={saving}
              onClick={submit}
            >
              {saving ? "Sending…" : "Send request"}
              <ArrowRight size={16} />
            </button>
          </div>
        )}
        </section>
      </div>
    </OverlayPortal>
  );
}

"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  ExternalLink,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Booking, DashboardData, Offer } from "@/lib/types";
import { CustomSelect } from "@/components/custom-select";
import { DEFAULT_SUPPORT_CONTACT } from "@/lib/constants";
import { AppBrand } from "@/components/app-brand";
import { TenantThemeProvider } from "@/components/tenant-theme-provider";
import {
  bookingStatusLabel,
  bookingStatusTone,
} from "@/lib/booking-status";

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
  const [bookings, setBookings] = useState(
    data.bookings.filter((booking) => booking.whop_user_id === userId),
  );
  const supportContact =
    data.settings.support_contact || DEFAULT_SUPPORT_CONTACT;
  return (
    <main className="theme-root member-shell">
      <nav className="member-nav">
        <AppBrand variant="member" />
        <div className="member-tabs">
          <button
            className={view === "offers" ? "active" : ""}
            onClick={() => setView("offers")}
          >
            Coaching
          </button>
          <button
            className={view === "bookings" ? "active" : ""}
            onClick={() => setView("bookings")}
          >
            My bookings
          </button>
        </div>
        <button className="support-button" onClick={() => setHelpOpen(true)}>
          <MessageCircle size={17} /> Help
        </button>
      </nav>
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
        <Offers data={data} onSelect={setSelected} />
      ) : (
        <MyBookings
          experienceId={experienceId}
          demo={data.demo}
          bookings={bookings}
          timezone={data.settings.default_timezone}
          onChange={(updated) =>
            setBookings((items) =>
              items.map((item) => (item.id === updated.id ? updated : item)),
            )
          }
        />
      )}
      <footer className="member-footer">
        <span>Times shown in {data.settings.default_timezone}</span>
        <span>Payments securely handled by Whop</span>
      </footer>
      {selected && (
        <BookingFlow
          experienceId={experienceId}
          offer={selected}
          data={data}
          onClose={() => setSelected(null)}
          onSubmitted={(booking) => {
            setBookings((items) => [booking, ...items]);
            setView("bookings");
          }}
        />
      )}{" "}
      {helpOpen && (
        <HelpDialog
          supportContact={supportContact}
          onClose={() => setHelpOpen(false)}
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
          <p className="eyebrow">Private coaching</p>
          <h1>
            Make your next move
            <br />
            <span className="gradient-text">the right one.</span>
          </h1>
          <p>
            Choose the support you need. Every request is personally reviewed so
            your session starts with the right coach and context.
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
            <p>Your existing sessions remain under My bookings.</p>
          </div>
        </div>
      ) : offers.length === 0 ? (
        <div className="notice-empty member-offers-empty sc-card">
          <CalendarDays />
          <strong>Coaching offers are coming soon</strong>
          <p>
            There aren’t any sessions available to request yet. Check back
            shortly or use Help to contact the team.
          </p>
        </div>
      ) : (
        <section className="offer-grid">
          {offers.map((offer) => (
            <article className="member-offer" key={offer.id}>
              <div className="offer-top">
                <span className="offer-icon">{offer.duration_minutes}</span>
                <span className="status-badge draft">
                  {offer.price_cents ? "Paid coaching" : "Free coaching"}
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
  supportContact,
  onClose,
}: {
  supportContact: string;
  onClose: () => void;
}) {
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
        <div className="help-contact">
          <MessageCircle size={21} />
          <div>
            <strong>Contact the coaching team</strong>
            <p>
              Questions about an offer, booking, meeting details, or refund?
              Send us an email and include any useful context.
            </p>
            <a className="sc-btn-primary" href={`mailto:${supportContact}`}>
              Email {supportContact}
            </a>
          </div>
        </div>
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
}: {
  experienceId: string;
  demo: boolean;
  bookings: Booking[];
  timezone: string;
  onChange: (booking: Booking) => void;
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

  async function beginPayment(booking: Booking) {
    setPayingId(booking.id);
    setError("");
    try {
      const response = await fetch(
        `/api/booking-requests/${booking.id}/checkout`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ experienceId }),
        },
      );
      const payload = await response.json();
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
      window.location.assign(payload.checkoutUrl);
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Could not start payment.",
      );
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
  return (
    <section className="member-bookings">
      <p className="eyebrow">Your sessions</p>
      <h1>My bookings</h1>
      {error && !dialog && <p className="form-error action-error">{error}</p>}
      <div className="member-booking-list">
        {bookings.length === 0 && (
          <div className="notice-empty sc-card">
            <CalendarDays />
            <strong>No sessions yet</strong>
            <p>Choose a coaching offer when you’re ready.</p>
          </div>
        )}
        {bookings.map((booking) => {
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
          return (
            <article className="member-booking-card sc-card" key={booking.id}>
              <div>
                <span
                  className={`health-badge ${bookingStatusTone(booking.status)}`}
                >
                  {booking.refund_status &&
                  booking.refund_status !== "not_requested"
                    ? `refund ${booking.refund_status}`
                    : bookingStatusLabel(booking.status)}
                </span>
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
                  <div className="booking-state-note payment-ready">
                    <strong>Your request was approved</strong>
                    <span>
                      Complete payment
                      {booking.payment_due_at
                        ? ` by ${new Intl.DateTimeFormat("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: timezone,
                          }).format(new Date(booking.payment_due_at))}`
                        : " within 24 hours"}
                      {" to confirm this time."}
                    </span>
                    <button
                      className="sc-btn-primary"
                      disabled={payingId === booking.id}
                      onClick={() => beginPayment(booking)}
                    >
                      {payingId === booking.id
                        ? "Opening Whop…"
                        : "Complete payment"}
                      <ArrowRight size={15} />
                    </button>
                  </div>
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
                  {active && !booking.whop_payment_id && (
                    <button
                      onClick={() => setDialog({ type: "cancel", booking })}
                    >
                      Cancel booking
                    </button>
                  )}
                </div>
              </div>
              {booking.status === "confirmed" && (
                <div className="meeting-box">
                  <LockKeyhole size={18} />
                  <div>
                    <strong>
                      {booking.meeting_location ||
                        "Meeting details coming soon"}
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
  const eligible = offer.coach_ids?.length
    ? data.coaches.filter((coach) => offer.coach_ids?.includes(coach.id))
    : data.coaches;
  const [coachId, setCoachId] = useState(eligible[0]?.id ?? "");
  const [step, setStep] = useState(1);
  const [slot, setSlot] = useState("");
  const [goal, setGoal] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [slots, setSlots] = useState<Date[]>(data.demo ? previewSlots : []);
  const [slotLimit, setSlotLimit] = useState(16);
  const [loading, setLoading] = useState(!data.demo);
  useEffect(() => {
    if (data.demo) return;
    const query = new URLSearchParams({ experienceId, offerId: offer.id });
    if (coachId) query.set("coachId", coachId);
    fetch(`/api/availability/slots?${query}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Could not load times.");
        setSlots((body.slots as string[]).map((value) => new Date(value)));
        setSlotLimit(16);
      })
      .catch((value) =>
        setError(
          value instanceof Error ? value.message : "Could not load times.",
        ),
      )
      .finally(() => setLoading(false));
  }, [coachId, data.demo, experienceId, offer.id]);
  function chooseCoach(id: string) {
    setCoachId(id);
    setSlot("");
    setSlots([]);
    setSlotLimit(16);
    setError("");
    if (!data.demo) setLoading(true);
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
            coachId: coachId || null,
            startsAt: slot,
            timezone: data.settings.default_timezone,
            intakeAnswers: { goal },
            memberNote: note,
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
  if (sent)
    return (
      <div className="modal-backdrop">
        <div className="booking-modal sc-card success-modal">
          <span className="success-icon">
            <Check size={28} />
          </span>
          <p className="eyebrow">Request received</p>
          <h2>Your request is in.</h2>
          <p>
            No payment was taken. The coach will review your request first, and
            paid sessions will give you up to 24 hours to pay after approval.
          </p>
          <button className="sc-btn-primary" onClick={onClose}>
            View my bookings
          </button>
        </div>
      </div>
    );
  const coachOptions = eligible.map((coach) => ({
    value: coach.id,
    label: coach.name,
  }));
  return (
    <div className="modal-backdrop">
      <section className="booking-modal sc-card">
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
            {eligible.length > 1 && (
              <div className="field coach-choice">
                <label>Preferred coach</label>
                <CustomSelect
                  value={coachId}
                  options={coachOptions}
                  onChange={chooseCoach}
                />
              </div>
            )}
            {loading ? (
              <div className="notice">Loading available times…</div>
            ) : slots.length === 0 ? (
              <div className="notice">No request times are open right now.</div>
            ) : (
              <div className="slot-list">
                {slots.slice(0, slotLimit).map((date) => (
                  <button
                    key={date.toISOString()}
                    className={slot === date.toISOString() ? "active" : ""}
                    onClick={() => setSlot(date.toISOString())}
                  >
                    <span>
                      {new Intl.DateTimeFormat("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        timeZone: data.settings.default_timezone,
                      }).format(date)}
                    </span>
                    <strong>
                      {new Intl.DateTimeFormat("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: data.settings.default_timezone,
                      }).format(date)}
                    </strong>
                  </button>
                ))}
              </div>
            )}
            {slots.length > slotLimit && !loading && (
              <button
                type="button"
                className="show-more-times"
                onClick={() => setSlotLimit((value) => value + 16)}
              >
                Show more times
              </button>
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
            <h2>What would make this session a win?</h2>
            <div className="field">
              <label>Your main goal</label>
              <textarea
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
              />
            </div>
            <div className="field">
              <label>
                Anything else? <span className="muted">Optional</span>
              </label>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <button
              className="sc-btn-primary full-button"
              disabled={!goal.trim()}
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
                <span>Session</span>
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
  );
}

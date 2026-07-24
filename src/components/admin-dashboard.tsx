"use client";

import { useCallback, useState } from "react";
import {
  ArchiveRestore,
  AlertTriangle,
  Ban,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  GripVertical,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Plus,
  Power,
  Settings,
  UserRound,
  Users,
  X,
  Trash2,
} from "lucide-react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Booking, DashboardData, UnavailableWindow } from "@/lib/types";
import { OfferManager } from "@/components/offer-manager";
import { CoachManager } from "@/components/coach-manager";
import { AvailabilityManager } from "@/components/availability-manager";
import { CustomersView } from "@/components/customers-view";
import { SettingsManager } from "@/components/settings-manager";
import { CustomDateRangePicker } from "@/components/custom-date-range-picker";
import { OverlayPortal } from "@/components/overlay-portal";
import {
  bookingMemberInitial,
  bookingMemberLabel,
  bookingMemberUsername,
} from "@/lib/member";
import {
  bookingStatusLabel,
  bookingStatusTone,
} from "@/lib/booking-status";
import { AppBrand } from "@/components/app-brand";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  TenantThemeProvider,
  useTenantTheme,
} from "@/components/tenant-theme-provider";
import {
  RefreshButton,
  useLiveRefresh,
} from "@/components/live-refresh";

type Section =
  | "overview"
  | "bookings"
  | "offers"
  | "availability"
  | "unavailable"
  | "coaches"
  | "customers"
  | "settings";
type BookingChanges = {
  requestedStartAt?: string;
  meetingLocation?: string;
  meetingUrl?: string;
  joinInstructions?: string;
  adminNote?: string;
  refundStatus?: "declined";
};
const nav: { key: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "bookings", label: "Bookings", icon: CalendarDays },
  { key: "offers", label: "Offers", icon: CircleDollarSign },
  { key: "availability", label: "Availability", icon: Clock3 },
  { key: "unavailable", label: "Unavailable", icon: Ban },
  { key: "coaches", label: "Coach", icon: UserRound },
  { key: "customers", label: "Customers", icon: Users },
  { key: "settings", label: "Settings", icon: Settings },
];
const tomorrowDate = new Date(Date.now() + 86_400_000)
  .toISOString()
  .slice(0, 10);
const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(value))
    : "Not set";

export function AdminDashboard({
  initialData,
}: {
  initialData: DashboardData;
}) {
  return (
    <TenantThemeProvider initialSettings={initialData.settings}>
      <AdminDashboardContent initialData={initialData} />
    </TenantThemeProvider>
  );
}

function AdminDashboardContent({
  initialData,
}: {
  initialData: DashboardData;
}) {
  const { settings: tenantSettings, replaceSettings } = useTenantTheme();
  const [section, setSection] = useState<Section>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [paused, setPaused] = useState(initialData.emergencyPaused);
  const [bookings, setBookings] = useState(initialData.bookings);
  const [offers, setOffers] = useState(initialData.offers);
  const [coaches, setCoaches] = useState(initialData.coaches);
  const [availability, setAvailability] = useState(initialData.availability);
  const [capacityOverrides, setCapacityOverrides] = useState(
    initialData.capacityOverrides,
  );
  const [windows, setWindows] = useState(initialData.unavailable);
  const [blackoutOpen, setBlackoutOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const visibleBookings = bookings.filter(
    (booking) => !booking.admin_archived_at,
  );
  const pending = visibleBookings.filter((booking) =>
    ["pending_approval", "reschedule_requested"].includes(booking.status),
  );
  const awaitingPayment = visibleBookings.filter(
    (booking) => booking.status === "pending_payment",
  );
  const confirmed = visibleBookings.filter(
    (booking) => booking.status === "confirmed",
  );
  const applyLiveData = useCallback(
    (next: DashboardData) => {
      setBookings(next.bookings);
      setOffers(next.offers);
      setCoaches(next.coaches);
      setAvailability(next.availability);
      setCapacityOverrides(next.capacityOverrides);
      setWindows(next.unavailable);
      setPaused(next.emergencyPaused);
      if (section !== "settings") replaceSettings(next.settings);
    },
    [replaceSettings, section],
  );
  const urgentRefresh = bookings.some(
    (booking) =>
      booking.status === "pending_payment" ||
      ["requested", "processing"].includes(booking.refund_status ?? ""),
  );
  const { refresh, refreshing, lastUpdated, refreshError } =
    useLiveRefresh<DashboardData>({
      url: `/api/dashboard-data?companyId=${encodeURIComponent(initialData.companyId)}`,
      onData: applyLiveData,
      urgent: urgentRefresh,
    });
  async function updateBooking(id: string, changes: BookingChanges) {
    const previous = bookings;
    setActionError("");
    if (initialData.demo) {
      setBookings((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                meeting_location:
                  changes.meetingLocation ?? item.meeting_location,
                meeting_url: changes.meetingUrl ?? item.meeting_url,
                manual_join_instructions:
                  changes.joinInstructions ?? item.manual_join_instructions,
                admin_note: changes.adminNote ?? item.admin_note,
                refund_status: changes.refundStatus ?? item.refund_status,
                requested_start_at:
                  changes.requestedStartAt ?? item.requested_start_at,
                status: changes.requestedStartAt
                  ? "reschedule_requested"
                  : item.status,
              }
            : item,
        ),
      );
      return;
    }
    const response = await fetch(`/api/booking-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId: initialData.companyId, ...changes }),
    });
    const body = await response.json();
    if (!response.ok) {
      setBookings(previous);
      setActionError(body.error || "Could not update booking.");
    } else
      setBookings((items) =>
        items.map((item) =>
          item.id === id
            ? { ...body.booking, member_profile: item.member_profile }
            : item,
        ),
      );
    if (response.ok) void refresh();
  }
  async function decideBooking(
    id: string,
    action: "approve" | "reject",
  ) {
    const previous = bookings;
    const current = bookings.find((booking) => booking.id === id);
    if (!current) return;
    setActionError("");

    if (initialData.demo) {
      const needsPayment =
        action === "approve" &&
        current.booking_offers?.access_mode === "paid" &&
        (current.booking_offers?.price_cents ?? 0) > 0 &&
        !current.whop_payment_id;
      setBookings((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                status:
                  action === "reject"
                    ? "rejected"
                    : needsPayment
                      ? "pending_payment"
                      : "confirmed",
                payment_due_at: needsPayment
                  ? new Date(Date.now() + 24 * 3_600_000).toISOString()
                  : null,
                confirmed_start_at:
                  action === "approve" && !needsPayment
                    ? item.requested_start_at
                    : item.confirmed_start_at,
                confirmed_end_at:
                  action === "approve" && !needsPayment
                    ? item.requested_end_at
                    : item.confirmed_end_at,
              }
            : item,
        ),
      );
      return;
    }

    const response = await fetch(`/api/booking-requests/${id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        companyId: initialData.companyId,
        action,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setBookings(previous);
      setActionError(body.error || "Could not update this request.");
      return;
    }
    setBookings((items) =>
      items.map((item) =>
        item.id === id
          ? { ...body.booking, member_profile: item.member_profile }
          : item,
      ),
    );
    void refresh();
  }
  async function issueRefund(id: string) {
    const previous = bookings;
    setActionError("");
    setBookings((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, status: "cancelled", refund_status: "processing" }
          : item,
      ),
    );
    if (initialData.demo) return;
    const response = await fetch(`/api/booking-requests/${id}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId: initialData.companyId }),
    });
    const body = await response.json();
    if (!response.ok) {
      setBookings(previous);
      setActionError(body.error || "Could not issue refund.");
    } else
      setBookings((items) =>
        items.map((item) =>
          item.id === id
            ? { ...body.booking, member_profile: item.member_profile }
            : item,
        ),
      );
    if (response.ok) void refresh();
  }
  async function transitionBooking(
    id: string,
    action: "complete" | "no_show" | "cancel",
  ) {
    setActionError("");
    if (initialData.demo) {
      setBookings((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                status:
                  action === "complete"
                    ? "completed"
                    : action === "no_show"
                      ? "no_show"
                      : "cancelled",
              }
            : item,
        ),
      );
      return;
    }
    const response = await fetch(`/api/booking-requests/${id}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId: initialData.companyId, action }),
    });
    const body = await response.json();
    if (!response.ok) {
      setActionError(body.error || "Could not move booking.");
      return;
    }
    setBookings((items) =>
      items.map((item) =>
        item.id === id
          ? { ...body.booking, member_profile: item.member_profile }
          : item,
      ),
    );
    void refresh();
  }
  async function archiveBooking(id: string, action: "archive" | "restore") {
    setActionError("");
    if (initialData.demo) {
      setBookings((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                admin_archived_at:
                  action === "archive" ? new Date().toISOString() : null,
              }
            : item,
        ),
      );
      return;
    }
    const response = await fetch(`/api/booking-requests/${id}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId: initialData.companyId, action }),
    });
    const body = await response.json();
    if (!response.ok) {
      setActionError(body.error || "Could not update Trash.");
      return;
    }
    setBookings((items) =>
      items.map((item) =>
        item.id === id
          ? { ...body.booking, member_profile: item.member_profile }
          : item,
      ),
    );
    void refresh();
  }
  async function togglePause() {
    const next = !paused;
    setPaused(next);
    if (!initialData.demo) {
      const response = await fetch("/api/settings/pause", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyId: initialData.companyId,
          paused: next,
        }),
      });
      if (!response.ok) setPaused(!next);
      else void refresh();
    }
  }
  return (
    <main className="admin-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-brand">
          <AppBrand />
          <button
            className="icon-button mobile-only"
            onClick={() => setMobileNav(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="side-nav">
          {nav.map((item) => (
            <button
              key={item.key}
              className={section === item.key ? "active" : ""}
              onClick={() => {
                setSection(item.key);
                setMobileNav(false);
              }}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.key === "bookings" && pending.length > 0 && (
                <em>{pending.length}</em>
              )}
            </button>
          ))}
        </nav>
        <div className={`pause-panel ${paused ? "paused" : ""}`}>
          <div>
            <Power size={17} />
            <strong>{paused ? "Bookings paused" : "Bookings open"}</strong>
          </div>
          <p>
            {paused
              ? "Members cannot submit requests."
              : "Availability rules are active."}
          </p>
          <button onClick={togglePause}>
            {paused ? "Resume bookings" : "Emergency pause"}
          </button>
        </div>
      </aside>
      <section className="admin-main">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>
          <div>
            <p className="eyebrow">Creator dashboard</p>
            <h1>{nav.find((item) => item.key === section)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <RefreshButton
              refreshing={refreshing}
              lastUpdated={lastUpdated}
              onRefresh={() => void refresh()}
            />
            {initialData.demo && (
              <span className="status-badge draft">Preview data</span>
            )}
            <span className={`status-badge ${paused ? "draft" : "published"}`}>
              {paused ? "Paused" : "Accepting bookings"}
            </span>
          </div>
        </header>
        {refreshError && <p className="live-refresh-error">{refreshError}</p>}
        {paused && (
          <div className="pause-banner">
            <AlertTriangle size={18} />
            <span>
              <strong>Emergency pause is active.</strong> Existing sessions are
              untouched.
            </span>
            <button onClick={togglePause}>Resume</button>
          </div>
        )}
        {section === "overview" && (
          <Overview
            pending={pending}
            awaitingPayment={awaitingPayment}
            confirmed={confirmed}
            windows={windows}
            bookings={visibleBookings}
            onSelect={setSection}
          />
        )}
        {section === "bookings" && (
          <BookingsBoard
            bookings={bookings}
            error={actionError}
            onUpdate={updateBooking}
            onDecision={decideBooking}
            onRefund={issueRefund}
            onTransition={transitionBooking}
            onArchive={archiveBooking}
          />
        )}
        {section === "offers" && (
          <OfferManager
            companyId={initialData.companyId}
            demo={initialData.demo}
            initialOffers={offers}
            onOffersChange={(next) => {
              setOffers(next);
              void refresh();
            }}
          />
        )}
        {section === "availability" && (
          <AvailabilityManager
            companyId={initialData.companyId}
            demo={initialData.demo}
            coach={coaches.find((coach) => coach.status === "active") ?? null}
            initialRules={availability}
            timezone={tenantSettings.default_timezone}
            defaultDailyCapacity={tenantSettings.default_daily_capacity}
            initialCapacityOverrides={capacityOverrides}
            bookings={bookings}
            onAddBlackout={() => setBlackoutOpen(true)}
            onRulesChange={(next) => {
              setAvailability(next);
              void refresh();
            }}
            onDataChange={() => void refresh()}
          />
        )}
        {section === "unavailable" && (
          <UnavailableView
            windows={windows}
            companyId={initialData.companyId}
            demo={initialData.demo}
            onAdd={() => setBlackoutOpen(true)}
            onRemove={(id) =>
              {
                setWindows((items) => items.filter((item) => item.id !== id));
                void refresh();
              }
            }
          />
        )}
        {section === "coaches" && (
          <CoachManager
            companyId={initialData.companyId}
            demo={initialData.demo}
            initialCoach={
              coaches.find((coach) => coach.status === "active") ?? null
            }
            onCoachChange={(coach) => {
              setCoaches([coach]);
              void refresh();
            }}
          />
        )}
        {section === "customers" && <CustomersView bookings={bookings} />}
        {section === "settings" && (
          <SettingsManager
            companyId={initialData.companyId}
            demo={initialData.demo}
            initialSettings={tenantSettings}
            onSaved={() => void refresh()}
          />
        )}
      </section>
      {blackoutOpen && (
        <BlackoutModal
          companyId={initialData.companyId}
          demo={initialData.demo}
          onClose={() => setBlackoutOpen(false)}
          onCreate={(window) => {
            setWindows((items) => [window, ...items]);
            setBlackoutOpen(false);
            setSection("unavailable");
            void refresh();
          }}
        />
      )}
    </main>
  );
}

function Metric({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: number;
  detail: string;
  tone?: string;
}) {
  return (
    <article className={`metric-card ${tone ?? ""}`}>
      <p>{title}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}
function Overview({
  pending,
  awaitingPayment,
  confirmed,
  windows,
  bookings,
  onSelect,
}: {
  pending: Booking[];
  awaitingPayment: Booking[];
  confirmed: Booking[];
  windows: UnavailableWindow[];
  bookings: Booking[];
  onSelect: (section: Section) => void;
}) {
  return (
    <div className="content-stack fade-in">
      <section className="metric-grid">
        <Metric
          title="Pending approval"
          value={pending.length}
          detail="Ready for review"
          tone="attention"
        />
        <Metric
          title="Awaiting payment"
          value={awaitingPayment.length}
          detail="Approved, not yet paid"
          tone="attention"
        />
        <Metric
          title="Confirmed"
          value={confirmed.length}
          detail="Upcoming sessions"
        />
        <Metric
          title="Refund requests"
          value={
            bookings.filter((booking) => booking.refund_status === "requested")
              .length
          }
          detail="Awaiting action"
        />
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Attention needed</p>
              <h2>Concierge queue</h2>
            </div>
            <button
              className="text-button"
              onClick={() => onSelect("bookings")}
            >
              View all <ChevronRight size={15} />
            </button>
          </div>
          {pending.length === 0 ? (
            <Empty text="Your queue is clear." />
          ) : (
            pending.slice(0, 6).map((booking) => (
              <div className="queue-item" key={booking.id}>
                <span className="avatar">{bookingMemberInitial(booking)}</span>
                <div>
                  <strong>
                    {booking.booking_offers?.title ?? "Coaching session"}
                  </strong>
                  <p>
                    {bookingMemberLabel(booking)} ·{" "}
                    {formatDate(booking.requested_start_at)}
                  </p>
                </div>
                <span className="health-badge warning">Review</span>
              </div>
            ))
          )}
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Calendar protection</p>
              <h2>Upcoming blackouts</h2>
            </div>
          </div>
          {windows.length === 0 ? (
            <Empty text="No upcoming blackouts." />
          ) : (
            windows.slice(0, 4).map((window) => (
              <div className="window-row" key={window.id}>
                <div className="date-tile">
                  <strong>{new Date(window.starts_at).getDate()}</strong>
                  <span>
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                    }).format(new Date(window.starts_at))}
                  </span>
                </div>
                <div>
                  <strong>{window.title}</strong>
                  <p>{formatDate(window.starts_at)}</p>
                </div>
              </div>
            ))
          )}
        </article>
      </section>
    </div>
  );
}

type BoardColumnId =
  | "pending_approval"
  | "pending_payment"
  | "confirmed"
  | "refunds"
  | "closed";

const bookingColumns: { id: BoardColumnId; title: string }[] = [
  { id: "pending_approval", title: "Pending Approval" },
  { id: "pending_payment", title: "Pending Payment" },
  { id: "confirmed", title: "Confirmed" },
  { id: "refunds", title: "Refunds" },
  { id: "closed", title: "Closed" },
];

function bookingBoardColumn(booking: Booking): BoardColumnId {
  if (["requested", "processing"].includes(booking.refund_status ?? "")) {
    return "refunds";
  }
  if (["pending_approval", "reschedule_requested"].includes(booking.status)) {
    return "pending_approval";
  }
  if (booking.status === "pending_payment") return "pending_payment";
  if (booking.status === "confirmed") return "confirmed";
  return "closed";
}

function DroppableBookingColumn({
  id,
  title,
  count,
  disabled,
  children,
}: {
  id: BoardColumnId;
  title: string;
  count: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <section
      ref={setNodeRef}
      className={`board-column ${isOver ? "drop-target" : ""} ${disabled ? "drop-disabled" : ""}`}
      data-drop-disabled={disabled || undefined}
      title={
        disabled
          ? "This lifecycle move is not available for the selected booking."
          : undefined
      }
    >
      <header>
        <h2>{title}</h2>
        <span>{count}</span>
      </header>
      {children}
    </section>
  );
}

type TicketAction = {
  label: string;
  onSelect: () => void;
  primary?: boolean;
};

function DraggableBookingTicket({
  booking,
  actions,
  onOpen,
}: {
  booking: Booking;
  actions: TicketAction[];
  onOpen: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: booking.id });
  const username = bookingMemberUsername(booking);
  return (
    <article
      ref={setNodeRef}
      className={`booking-ticket ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform) }}
    >
      <div className="ticket-drag-row">
        <button
          type="button"
          className="ticket-drag-handle"
          aria-label={`Drag ${booking.booking_offers?.title ?? "booking"}`}
          {...listeners}
          {...attributes}
        >
          <GripVertical size={16} />
        </button>
        <div className="ticket-menu-wrap">
          <button
            type="button"
            className="ticket-menu-button"
            aria-label="Booking actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="ticket-action-menu">
              <button type="button" onClick={onOpen}>Open details</button>
              {actions.map((action) => (
                <button
                  type="button"
                  key={action.label}
                  onClick={() => {
                    setMenuOpen(false);
                    action.onSelect();
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="ticket-top">
        <span className={`health-badge ${bookingStatusTone(booking.status)}`}>
          {booking.refund_status && booking.refund_status !== "not_requested"
            ? booking.refund_status
            : bookingStatusLabel(booking.status)}
        </span>
        <small>{booking.booking_offers?.duration_minutes} min</small>
      </div>
      <h3>{booking.booking_offers?.title ?? "Coaching session"}</h3>
      <p>
        {formatDate(
          booking.confirmed_start_at ?? booking.requested_start_at,
        )}
      </p>
      {booking.status === "pending_payment" && booking.payment_due_at && (
        <small className="payment-deadline">
          Payment due {formatDate(booking.payment_due_at)}
        </small>
      )}
      <div className="member-line">
        <span className="avatar">{bookingMemberInitial(booking)}</span>
        <span className="member-line-copy">
          <strong>{bookingMemberLabel(booking)}</strong>
          {username && username !== bookingMemberLabel(booking) && (
            <small>{username}</small>
          )}
        </span>
      </div>
      <button className="ticket-details" onClick={onOpen}>Open details</button>
      {actions.length > 0 && (
        <div className="ticket-actions">
          {actions.slice(0, 2).map((action) => (
            <button
              type="button"
              className={action.primary ? "confirm-button" : undefined}
              key={action.label}
              onClick={action.onSelect}
            >
              {action.primary && <Check size={15} />}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function BookingCloseDialog({
  booking,
  onClose,
  onTransition,
  onRefund,
}: {
  booking: Booking;
  onClose: () => void;
  onTransition: (action: "complete" | "no_show" | "cancel") => void;
  onRefund: () => void;
}) {
  return (
    <OverlayPortal>
      <div className="modal-backdrop">
        <section className="modal booking-move-modal sc-card" role="dialog" aria-modal="true">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Close booking</p>
              <h2>Choose the correct outcome</h2>
              <p>{booking.booking_offers?.title}</p>
            </div>
            <button className="icon-button" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="booking-outcome-actions">
            <button onClick={() => onTransition("complete")}>Completed</button>
            <button onClick={() => onTransition("no_show")}>No-show</button>
            <button onClick={booking.whop_payment_id ? onRefund : () => onTransition("cancel")}>
              {booking.whop_payment_id ? "Refund & cancel" : "Cancel booking"}
            </button>
          </div>
        </section>
      </div>
    </OverlayPortal>
  );
}

function BookingsBoard({
  bookings,
  error,
  onUpdate,
  onDecision,
  onRefund,
  onTransition,
  onArchive,
}: {
  bookings: Booking[];
  error: string;
  onUpdate: (id: string, changes: BookingChanges) => void;
  onDecision: (id: string, action: "approve" | "reject") => void;
  onRefund: (id: string) => void;
  onTransition: (
    id: string,
    action: "complete" | "no_show" | "cancel",
  ) => void;
  onArchive: (id: string, action: "archive" | "restore") => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [draggedBookingId, setDraggedBookingId] = useState<string | null>(null);
  const [localMessage, setLocalMessage] = useState("");
  const [closeBooking, setCloseBooking] = useState<Booking | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    booking: Booking;
    kind: "reject" | "cancel" | "refund" | "archive";
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const activeBookings = bookings.filter((booking) => !booking.admin_archived_at);
  const archivedBookings = bookings.filter((booking) => booking.admin_archived_at);
  const draggedBooking = activeBookings.find(
    (booking) => booking.id === draggedBookingId,
  );
  const selected = bookings.find((booking) => booking.id === selectedId);
  const trashDisabled = Boolean(
    draggedBooking && bookingBoardColumn(draggedBooking) !== "closed",
  );
  const { setNodeRef: setTrashRef, isOver: trashOver } = useDroppable({
    id: "trash",
    disabled: trashDisabled,
  });

  function validDropTargets(booking: Booking) {
    const source = bookingBoardColumn(booking);
    const targets = new Set<string>([source]);
    if (source === "pending_approval") {
      const paid =
        booking.booking_offers?.access_mode === "paid" &&
        (booking.booking_offers?.price_cents ?? 0) > 0 &&
        !booking.whop_payment_id;
      targets.add(paid ? "pending_payment" : "confirmed");
      targets.add("closed");
    }
    if (source === "pending_payment") targets.add("closed");
    if (source === "confirmed") {
      targets.add("closed");
      if (booking.whop_payment_id) targets.add("refunds");
    }
    if (source === "closed") targets.add("trash");
    return targets;
  }

  function requestConfirmation(
    booking: Booking,
    kind: "reject" | "cancel" | "refund" | "archive",
  ) {
    setLocalMessage("");
    setConfirmAction({ booking, kind });
  }

  function actionsFor(booking: Booking): TicketAction[] {
    if (["pending_approval", "reschedule_requested"].includes(booking.status)) {
      return [
        {
          label: "Approve",
          primary: true,
          onSelect: () => onDecision(booking.id, "approve"),
        },
        {
          label: "Reject",
          onSelect: () => requestConfirmation(booking, "reject"),
        },
      ];
    }
    if (booking.status === "pending_payment") {
      return [
        {
          label: "Cancel",
          onSelect: () => requestConfirmation(booking, "cancel"),
        },
      ];
    }
    if (booking.refund_status === "requested") {
      return [
        {
          label: "Issue refund",
          primary: true,
          onSelect: () => requestConfirmation(booking, "refund"),
        },
        {
          label: "Decline",
          onSelect: () => onUpdate(booking.id, { refundStatus: "declined" }),
        },
      ];
    }
    if (booking.status === "confirmed") {
      return [
        {
          label: "Close session",
          onSelect: () => setCloseBooking(booking),
        },
      ];
    }
    return [
      {
        label: "Move to Trash",
        onSelect: () => requestConfirmation(booking, "archive"),
      },
    ];
  }

  function onDragEnd(event: DragEndEvent) {
    const booking = activeBookings.find((item) => item.id === event.active.id);
    const target = event.over?.id;
    setDraggedBookingId(null);
    if (!booking || !target) return;
    setLocalMessage("");
    if (target === "trash") {
      if (bookingBoardColumn(booking) !== "closed") {
        setLocalMessage("Close active bookings before moving them to Trash.");
      } else {
        requestConfirmation(booking, "archive");
      }
      return;
    }
    const targetColumn = target as BoardColumnId;
    const sourceColumn = bookingBoardColumn(booking);
    if (sourceColumn === targetColumn) return;
    if (sourceColumn === "pending_approval") {
      if (["pending_payment", "confirmed"].includes(targetColumn)) {
        onDecision(booking.id, "approve");
      } else if (targetColumn === "closed") {
        requestConfirmation(booking, "reject");
      } else {
        setLocalMessage("That request cannot move to this column.");
      }
      return;
    }
    if (sourceColumn === "pending_payment") {
      if (targetColumn === "closed") requestConfirmation(booking, "cancel");
      else
        setLocalMessage(
          "Pending payment can only become Confirmed through Whop’s payment webhook.",
        );
      return;
    }
    if (sourceColumn === "confirmed") {
      if (targetColumn === "closed") setCloseBooking(booking);
      else if (targetColumn === "refunds" && booking.whop_payment_id)
        requestConfirmation(booking, "refund");
      else setLocalMessage("Choose a valid close or refund action for this booking.");
      return;
    }
    setLocalMessage("Closed and refund records cannot be reopened by dragging.");
  }

  function onDragStart(event: DragStartEvent) {
    setDraggedBookingId(String(event.active.id));
    setLocalMessage("");
  }

  function confirmPendingAction() {
    if (!confirmAction) return;
    const { booking, kind } = confirmAction;
    if (kind === "reject") onDecision(booking.id, "reject");
    if (kind === "cancel") onTransition(booking.id, "cancel");
    if (kind === "refund") onRefund(booking.id);
    if (kind === "archive") onArchive(booking.id, "archive");
    setConfirmAction(null);
  }

  const confirmCopy = confirmAction
    ? {
        reject: {
          title: "Reject this request?",
          description: "The requested time will be released and the customer will be notified. No payment will be taken.",
          label: "Reject request",
        },
        cancel: {
          title: "Cancel this booking?",
          description: "The reserved time and any unused checkout link will be released. Paid confirmed bookings must use the refund flow.",
          label: "Cancel booking",
        },
        refund: {
          title: "Issue this refund?",
          description: "Whop will process the refund and the booking will close. This action cannot be undone here.",
          label: "Issue refund",
        },
        archive: {
          title: "Move this record to Trash?",
          description: "It will leave the active board but remain in the audit and payment history. You can restore it later.",
          label: "Move to Trash",
        },
      }[confirmAction.kind]
    : null;

  return (
    <div className="content-stack fade-in">
      <div className="section-intro booking-board-intro">
        <p>
          Drag cards between valid stages, or use each card’s actions menu.
          Payment confirmation and refunds always remain controlled by Whop.
        </p>
        <div className="booking-view-toggle">
          <button className={!showTrash ? "active" : ""} onClick={() => setShowTrash(false)}>
            Active
          </button>
          <button className={showTrash ? "active" : ""} onClick={() => setShowTrash(true)}>
            Trash <span>{archivedBookings.length}</span>
          </button>
        </div>
      </div>
      {(error || localMessage) && (
        <p className="form-error action-error">{error || localMessage}</p>
      )}
      {showTrash ? (
        <section className="panel archived-bookings">
          <div className="panel-heading">
            <div><p className="eyebrow">Booking history</p><h2>Trash</h2></div>
          </div>
          {archivedBookings.length === 0 ? (
            <Empty text="No archived bookings." />
          ) : (
            archivedBookings.map((booking) => (
              <div className="archived-booking-row" key={booking.id}>
                <div>
                  <strong>{booking.booking_offers?.title ?? "Coaching session"}</strong>
                  <p>{bookingMemberLabel(booking)} · {formatDate(booking.requested_start_at)}</p>
                </div>
                <button className="sc-btn-secondary" onClick={() => onArchive(booking.id, "restore")}>
                  <ArchiveRestore size={15} /> Restore
                </button>
              </div>
            ))
          )}
        </section>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragCancel={() => setDraggedBookingId(null)}
          onDragEnd={onDragEnd}
        >
          <div className="booking-board">
            {bookingColumns.map((column) => {
              const items = activeBookings.filter(
                (booking) => bookingBoardColumn(booking) === column.id,
              );
              return (
                <DroppableBookingColumn
                  id={column.id}
                  title={column.title}
                  count={items.length}
                  disabled={Boolean(
                    draggedBooking &&
                      !validDropTargets(draggedBooking).has(column.id),
                  )}
                  key={column.id}
                >
                  {items.map((booking) => (
                    <DraggableBookingTicket
                      booking={booking}
                      actions={actionsFor(booking)}
                      onOpen={() => setSelectedId(booking.id)}
                      key={booking.id}
                    />
                  ))}
                </DroppableBookingColumn>
              );
            })}
          </div>
          {draggedBooking && (
            <div
              ref={setTrashRef}
              className={`booking-trash-drop ${trashOver ? "drop-target" : ""} ${trashDisabled ? "drop-disabled" : ""}`}
              aria-disabled={trashDisabled}
            >
              <Trash2 size={19} />
              <span>
                {trashDisabled
                  ? "Close this booking before moving it to Trash"
                  : "Drop here to move this record to Trash"}
              </span>
            </div>
          )}
        </DndContext>
      )}
      {selected && (
        <BookingDetail
          booking={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={onUpdate}
        />
      )}
      {closeBooking && (
        <BookingCloseDialog
          booking={closeBooking}
          onClose={() => setCloseBooking(null)}
          onTransition={(action) => {
            onTransition(closeBooking.id, action);
            setCloseBooking(null);
          }}
          onRefund={() => {
            onRefund(closeBooking.id);
            setCloseBooking(null);
          }}
        />
      )}
      {confirmAction && confirmCopy && (
        <ConfirmDialog
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.label}
          onConfirm={confirmPendingAction}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

function BookingDetail({
  booking,
  onClose,
  onUpdate,
}: {
  booking: Booking;
  onClose: () => void;
  onUpdate: (id: string, changes: BookingChanges) => void;
}) {
  const [form, setForm] = useState({
    meetingLocation: booking.meeting_location ?? "",
    meetingUrl: booking.meeting_url ?? "",
    joinInstructions: booking.manual_join_instructions ?? "",
    adminNote: booking.admin_note ?? "",
    proposedTime: "",
  });
  return (
    <OverlayPortal>
    <div className="modal-backdrop">
      <form
        className="modal booking-detail-modal sc-card"
        onSubmit={(event) => {
          event.preventDefault();
          onUpdate(booking.id, {
            meetingLocation: form.meetingLocation,
            meetingUrl: form.meetingUrl,
            joinInstructions: form.joinInstructions,
            adminNote: form.adminNote,
            ...(form.proposedTime
              ? {
                  requestedStartAt: new Date(form.proposedTime).toISOString(),
                }
              : {}),
          });
          onClose();
        }}
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Booking details</p>
            <h2>{booking.booking_offers?.title}</h2>
            <div className="booking-detail-member">
              <strong>{bookingMemberLabel(booking)}</strong>
              {bookingMemberUsername(booking) &&
                bookingMemberUsername(booking) !==
                  bookingMemberLabel(booking) && (
                  <span>{bookingMemberUsername(booking)}</span>
                )}
              <code>{booking.whop_user_id}</code>
            </div>
            <p>{formatDate(booking.requested_start_at)}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {booking.status === "confirmed" && <div className="field">
            <label>Propose another time</label>
            <input
              type="datetime-local"
              value={form.proposedTime}
              onChange={(event) =>
                setForm({ ...form, proposedTime: event.target.value })
              }
            />
        </div>}
        <div className="form-grid">
          <div className="field">
            <label>Meeting location</label>
            <input
              value={form.meetingLocation}
              onChange={(event) =>
                setForm({ ...form, meetingLocation: event.target.value })
              }
              placeholder="Zoom, Discord, Google Meet…"
            />
          </div>
          <div className="field">
            <label>Private meeting URL</label>
            <input
              type="url"
              value={form.meetingUrl}
              onChange={(event) =>
                setForm({ ...form, meetingUrl: event.target.value })
              }
              placeholder="https://"
            />
          </div>
        </div>
        <div className="field">
          <label>Customer joining instructions</label>
          <textarea
            value={form.joinInstructions}
            onChange={(event) =>
              setForm({ ...form, joinInstructions: event.target.value })
            }
          />
        </div>
        <div className="field">
          <label>Private admin note</label>
          <textarea
            value={form.adminNote}
            onChange={(event) =>
              setForm({ ...form, adminNote: event.target.value })
            }
          />
        </div>
        <div className="request-summary">
          <div>
            <span>Payment</span>
            <strong>
              {booking.whop_payment_id
                ? "Paid through Whop"
                : booking.status === "pending_payment"
                  ? "Approved — awaiting customer payment"
                  : booking.booking_offers?.access_mode === "paid"
                    ? "No payment collected"
                    : "Free booking"}
            </strong>
          </div>
          <div>
            <span>Customer goal</span>
            <strong>
              {String(booking.intake_answers?.goal ?? "Not supplied")}
            </strong>
          </div>
          <div>
            <span>Customer note</span>
            <strong>{booking.member_note || "None"}</strong>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="sc-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="sc-btn-primary">Save booking</button>
        </div>
      </form>
    </div>
    </OverlayPortal>
  );
}

function UnavailableView({
  windows,
  companyId,
  demo,
  onAdd,
  onRemove,
}: {
  windows: UnavailableWindow[];
  companyId: string;
  demo: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  async function remove(id: string) {
    if (!demo) {
      const response = await fetch(
        `/api/unavailable-windows?companyId=${encodeURIComponent(companyId)}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) return;
    }
    onRemove(id);
  }
  return (
    <div className="content-stack fade-in">
      <section className="unavailable-hero">
        <div>
          <p className="eyebrow">Calendar protection</p>
          <h2>Block time before it becomes a problem.</h2>
          <p>
            Blackouts are removed from every availability calculation on the
            server.
          </p>
        </div>
        <button className="sc-btn-primary" onClick={onAdd}>
          <Plus size={16} /> New unavailable window
        </button>
      </section>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Active windows</h2>
          </div>
        </div>
        {windows.length === 0 && <Empty text="No unavailable dates." />}
        {windows.map((window) => (
          <div className="blackout-row" key={window.id}>
            <span className="blackout-icon">
              <Ban size={19} />
            </span>
            <div>
              <strong>{window.title}</strong>
              <p>
                {formatDate(window.starts_at)} to {formatDate(window.ends_at)}
              </p>
            </div>
            <span className="health-badge neutral">
              {window.all_day ? "All day" : "Partial day"}
            </span>
            <button className="remove-link" onClick={() => remove(window.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <Check size={20} />
      <p>{text}</p>
    </div>
  );
}
function BlackoutModal({
  companyId,
  demo,
  onClose,
  onCreate,
}: {
  companyId: string;
  demo: boolean;
  onClose: () => void;
  onCreate: (window: UnavailableWindow) => void;
}) {
  const [form, setForm] = useState({
    title: "Unavailable",
    startsAt: tomorrowDate,
    endsAt: tomorrowDate,
    reason: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.endsAt < form.startsAt) {
      setError("The last unavailable day must be on or after the first day.");
      return;
    }
    setSaving(true);
    setError("");
    const body = {
      companyId,
      title: form.title,
      reason: form.reason,
      startsAt: new Date(`${form.startsAt}T00:00:00`).toISOString(),
      endsAt: new Date(`${form.endsAt}T23:59:59`).toISOString(),
      allDay: true,
    };
    try {
      let window: UnavailableWindow;
      if (demo)
        window = {
          id: crypto.randomUUID(),
          whop_company_id: companyId,
          coach_id: null,
          offer_id: null,
          title: form.title,
          reason: form.reason,
          starts_at: body.startsAt,
          ends_at: body.endsAt,
          all_day: true,
          recurrence_rule: null,
          status: "active",
        };
      else {
        const response = await fetch("/api/unavailable-windows", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        window = payload.window;
      }
      onCreate(window);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not add blackout.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <OverlayPortal>
    <div className="modal-backdrop">
      <form className="modal sc-card" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Protect your time</p>
            <h2>Add unavailable dates</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div className="field">
          <label>Label</label>
          <input
            value={form.title}
            onChange={(event) =>
              setForm({ ...form, title: event.target.value })
            }
            required
          />
        </div>
        <CustomDateRangePicker
          startDate={form.startsAt}
          endDate={form.endsAt}
          onChange={(startsAt, endsAt) =>
            setForm({ ...form, startsAt, endsAt })
          }
        />
        <div className="field">
          <label>Private note</label>
          <textarea
            value={form.reason}
            onChange={(event) =>
              setForm({ ...form, reason: event.target.value })
            }
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="sc-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="sc-btn-primary" disabled={saving}>
            {saving ? "Blocking…" : "Block dates"}
          </button>
        </div>
      </form>
    </div>
    </OverlayPortal>
  );
}

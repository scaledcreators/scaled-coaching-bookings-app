"use client";

import { useState } from "react";
import { AlertTriangle, Ban, CalendarDays, Check, ChevronRight, CircleDollarSign, Clock3, LayoutDashboard, Menu, Plus, Power, Settings, Users, X } from "lucide-react";
import type { Booking, DashboardData, UnavailableWindow } from "@/lib/types";
import { OfferManager } from "@/components/offer-manager";
import { CoachManager } from "@/components/coach-manager";

type Section = "overview" | "bookings" | "offers" | "availability" | "unavailable" | "coaches" | "customers" | "settings";
const nav: { key: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard }, { key: "bookings", label: "Bookings", icon: CalendarDays },
  { key: "offers", label: "Offers", icon: CircleDollarSign }, { key: "availability", label: "Availability", icon: Clock3 },
  { key: "unavailable", label: "Unavailable", icon: Ban }, { key: "coaches", label: "Coaches", icon: Users },
  { key: "customers", label: "Customers", icon: Users }, { key: "settings", label: "Settings", icon: Settings },
];
const tomorrowDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value)) : "Not set";
const label = (status: string) => status.replaceAll("_", " ");

export function AdminDashboard({ initialData }: { initialData: DashboardData }) {
  const [section, setSection] = useState<Section>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [paused, setPaused] = useState(initialData.emergencyPaused);
  const [bookings, setBookings] = useState(initialData.bookings);
  const [windows, setWindows] = useState(initialData.unavailable);
  const [blackoutOpen, setBlackoutOpen] = useState(false);
  const pending = bookings.filter((b) => b.status === "requested" || b.status === "reschedule_requested");
  const confirmed = bookings.filter((b) => b.status === "confirmed");

  const [actionError, setActionError] = useState("");
  async function updateBooking(id: string, changes: { status?: Booking["status"]; coachId?: string | null }) {
    const previous = bookings;
    setActionError(""); setBookings((items) => items.map((item) => item.id === id ? { ...item, ...(changes.status ? { status: changes.status } : {}), ...(changes.coachId !== undefined ? { coach_id: changes.coachId } : {}) } : item));
    if (initialData.demo) return;
    const response = await fetch(`/api/booking-requests/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId: initialData.companyId, ...changes }) });
    if (!response.ok) { const body = await response.json(); setBookings(previous); setActionError(body.error || "Could not update booking."); }
  }

  async function issueRefund(id: string) {
    const previous = bookings; setActionError(""); setBookings((items) => items.map((item) => item.id === id ? { ...item, status: "cancelled", refund_status: "processing" } : item));
    if (initialData.demo) return;
    const response = await fetch(`/api/booking-requests/${id}/refund`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId: initialData.companyId }) });
    const body = await response.json(); if (!response.ok) { setBookings(previous); setActionError(body.error || "Could not issue refund."); } else setBookings((items) => items.map((item) => item.id === id ? body.booking : item));
  }

  async function togglePause() {
    const next = !paused;
    setPaused(next);
    if (!initialData.demo) await fetch("/api/settings/pause", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId: initialData.companyId, paused: next }) });
  }

  return (
    <main className="admin-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-brand"><span className="brand-mark">S</span><div><strong>Scaled Coaching</strong><small>Operations</small></div><button className="icon-button mobile-only" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18}/></button></div>
        <nav className="side-nav" aria-label="Dashboard">
          {nav.map((item) => <button key={item.key} className={section === item.key ? "active" : ""} onClick={() => { setSection(item.key); setMobileNav(false); }}><item.icon size={18}/><span>{item.label}</span>{item.key === "bookings" && pending.length > 0 && <em>{pending.length}</em>}</button>)}
        </nav>
        <div className={`pause-panel ${paused ? "paused" : ""}`}><div><Power size={17}/><strong>{paused ? "Bookings paused" : "Bookings open"}</strong></div><p>{paused ? "Members cannot submit new requests." : "Availability rules are active."}</p><button onClick={togglePause}>{paused ? "Resume bookings" : "Emergency pause"}</button></div>
      </aside>
      <section className="admin-main">
        <header className="topbar"><button className="icon-button mobile-only" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20}/></button><div><p className="eyebrow">Creator dashboard</p><h1>{nav.find((item) => item.key === section)?.label}</h1></div><div className="topbar-actions">{initialData.demo && <span className="status-badge draft">Preview data</span>}<button className="sc-btn-primary" onClick={() => setBlackoutOpen(true)}><Plus size={16}/> Add blackout</button></div></header>
        {paused && <div className="pause-banner"><AlertTriangle size={18}/><span><strong>Emergency pause is active.</strong> Existing sessions are untouched; new booking requests are blocked.</span><button onClick={togglePause}>Resume</button></div>}
        {section === "overview" && <Overview pending={pending} confirmed={confirmed} windows={windows} bookings={bookings} onSelect={setSection} />}
        {section === "bookings" && <BookingsBoard bookings={bookings} coaches={initialData.coaches} actionError={actionError} onUpdate={updateBooking} onRefund={issueRefund} />}
        {section === "unavailable" && <UnavailableView windows={windows} onAdd={() => setBlackoutOpen(true)} />}
        {section === "offers" && <OfferManager companyId={initialData.companyId} demo={initialData.demo} initialOffers={initialData.offers} coaches={initialData.coaches} />}
        {section === "coaches" && <CoachManager companyId={initialData.companyId} demo={initialData.demo} initialCoaches={initialData.coaches} />}
        {section === "availability" && <AvailabilityView data={initialData} />}
        {section === "coaches" && <SimpleView eyebrow="Your team" title="Coaches" text="Assign offers and unavailable windows to each coach." items={initialData.coaches.map((c) => `${c.name} · ${c.timezone}`)} />}
        {section === "customers" && <SimpleView eyebrow="Member care" title="Customers" text="Booking history and access are scoped to this Whop company." items={["Avery · 1 pending request", "Jordan · 1 confirmed session"]} />}
        {section === "settings" && <SimpleView eyebrow="Workspace" title="Booking settings" text="Whop checkout, webhook health, timezone, buffers, and support defaults." items={["Whop access verification · Ready when credentials are added", "Webhook endpoint · /webhooks/whop", "Default timezone · America/Chicago"]} />}
      </section>
      {blackoutOpen && <BlackoutModal companyId={initialData.companyId} demo={initialData.demo} onClose={() => setBlackoutOpen(false)} onCreate={(window) => { setWindows((items) => [window, ...items]); setBlackoutOpen(false); setSection("unavailable"); }} />}
    </main>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: number | string; detail: string; tone?: string }) { return <article className={`metric-card ${tone ?? ""}`}><p>{label}</p><strong>{value}</strong><span>{detail}</span></article>; }

function Overview({ pending, confirmed, windows, bookings, onSelect }: { pending: Booking[]; confirmed: Booking[]; windows: UnavailableWindow[]; bookings: Booking[]; onSelect: (s: Section) => void }) {
  const needsDetails = confirmed.filter((b) => !b.meeting_location && !b.meeting_url).length;
  return <div className="content-stack fade-in"><section className="metric-grid"><Metric label="Pending requests" value={pending.length} detail="Ready for review" tone="attention"/><Metric label="Confirmed" value={confirmed.length} detail="Upcoming sessions"/><Metric label="Needs meeting details" value={needsDetails} detail="Before members can join"/><Metric label="Unavailable windows" value={windows.length} detail="Active blocks"/></section><section className="dashboard-grid"><article className="panel"><div className="panel-heading"><div><p className="eyebrow">Attention needed</p><h2>Concierge queue</h2></div><button className="text-button" onClick={() => onSelect("bookings")}>View all <ChevronRight size={15}/></button></div><div className="queue-list">{pending.length === 0 ? <Empty text="Your queue is clear."/> : pending.map((b) => <div className="queue-item" key={b.id}><span className="avatar">{b.whop_user_id.slice(-1).toUpperCase()}</span><div><strong>{b.booking_offers?.title ?? "Coaching session"}</strong><p>{formatDate(b.requested_start_at)}</p></div><span className="health-badge warning">Needs review</span></div>)}</div></article><article className="panel"><div className="panel-heading"><div><p className="eyebrow">Next up</p><h2>Upcoming blocks</h2></div><button className="text-button" onClick={() => onSelect("unavailable")}>Manage <ChevronRight size={15}/></button></div>{windows.slice(0,3).map((w) => <div className="window-row" key={w.id}><div className="date-tile"><strong>{new Date(w.starts_at).getDate()}</strong><span>{new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(w.starts_at))}</span></div><div><strong>{w.title}</strong><p>{formatDate(w.starts_at)} → {formatDate(w.ends_at)}</p></div></div>)}</article></section><article className="panel"><div className="panel-heading"><div><p className="eyebrow">Schedule</p><h2>Confirmed sessions</h2></div></div><div className="table-wrap"><table className="table"><thead><tr><th>Session</th><th>Member</th><th>When</th><th>Health</th></tr></thead><tbody>{bookings.filter(b => b.status === "confirmed").map(b => <tr key={b.id}><td><strong>{b.booking_offers?.title}</strong></td><td>{b.whop_user_id.replace("user_", "")}</td><td>{formatDate(b.confirmed_start_at)}</td><td><span className="health-badge success">Confirmed</span></td></tr>)}</tbody></table></div></article></div>;
}

function BookingsBoard({ bookings, coaches, actionError, onUpdate, onRefund }: { bookings: Booking[]; coaches: DashboardData["coaches"]; actionError: string; onUpdate: (id: string, changes: { status?: Booking["status"]; coachId?: string | null }) => void; onRefund: (id: string) => void }) {
  const columns: { filter: (booking: Booking) => boolean; title: string }[] = [{ filter: (b) => b.status === "requested", title: "Pending" }, { filter: (b) => b.status === "confirmed", title: "Confirmed" }, { filter: (b) => b.refund_status === "requested" || b.refund_status === "processing", title: "Refunds" }, { filter: (b) => b.status === "completed", title: "Completed" }];
  return <div className="content-stack fade-in"><div className="section-intro"><p>Assign a coach before confirmation. Paid requests only appear here after Whop confirms payment. Refund requests cancel the session immediately and enter the refund queue.</p></div>{actionError && <p className="form-error action-error">{actionError}</p>}<div className="booking-board">{columns.map((column) => <section className="board-column" key={column.title}><header><h2>{column.title}</h2><span>{bookings.filter(column.filter).length}</span></header>{bookings.filter(column.filter).map((b) => <article className="booking-ticket" key={`${column.title}-${b.id}`}><div className="ticket-top"><span className={`health-badge ${b.status === "confirmed" ? "success" : "warning"}`}>{b.refund_status && b.refund_status !== "not_requested" ? label(b.refund_status) : label(b.status)}</span><small>{b.booking_offers?.duration_minutes} min</small></div><h3>{b.booking_offers?.title ?? "Coaching session"}</h3><p>{formatDate(b.confirmed_start_at ?? b.requested_start_at)}</p><div className="member-line"><span className="avatar">{b.whop_user_id.slice(-1).toUpperCase()}</span><span>{b.whop_user_id.replace("user_", "")}</span></div>{column.title !== "Refunds" && <label className="ticket-select">Coach<select value={b.coach_id ?? ""} onChange={(e) => onUpdate(b.id, { coachId: e.target.value || null })}><option value="">Unassigned</option>{coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</select></label>}{b.status === "requested" && <div className="ticket-actions"><button className="confirm-button" onClick={() => onUpdate(b.id, { status: "confirmed" })}><Check size={15}/> Confirm</button><button onClick={() => onUpdate(b.id, { status: "declined" })}>Decline</button></div>}{b.status === "confirmed" && <div className="ticket-actions"><button onClick={() => onUpdate(b.id, { status: "completed" })}>Mark complete</button>{b.whop_payment_id && <button onClick={() => onRefund(b.id)}>Refund</button>}</div>}{column.title === "Refunds" && <><p className="refund-reason">{b.refund_reason || "Customer requested a refund."}</p>{b.refund_status === "requested" && <div className="ticket-actions"><button className="confirm-button" onClick={() => onRefund(b.id)}>Issue full refund</button></div>}</>}</article>)}</section>)}</div></div>;
}

function UnavailableView({ windows, onAdd }: { windows: UnavailableWindow[]; onAdd: () => void }) { return <div className="content-stack fade-in"><section className="unavailable-hero"><div><p className="eyebrow">Protect the calendar first</p><h2>Block time before it becomes a problem.</h2><p>Full days, date ranges, and coach-specific windows are removed from every availability calculation on the server.</p></div><button className="sc-btn-primary" onClick={onAdd}><Plus size={16}/> New unavailable window</button></section><div className="panel"><div className="panel-heading"><div><h2>Active windows</h2><p>Existing bookings inside a new block are flagged for review, never silently cancelled.</p></div></div>{windows.map((w) => <div className="blackout-row" key={w.id}><span className="blackout-icon"><Ban size={19}/></span><div><strong>{w.title}</strong><p>{formatDate(w.starts_at)} → {formatDate(w.ends_at)}</p></div><span className="health-badge neutral">{w.all_day ? "All day" : "Partial day"}</span></div>)}</div></div>; }

function AvailabilityView({ data }: { data: DashboardData }) { const days = ["Mon", "Tue", "Wed", "Thu", "Fri"]; return <div className="content-stack fade-in"><div className="section-intro"><p>Normal hours are the starting point. Blackouts, bookings, buffers, notice, booking window, and capacity are subtracted before a slot appears.</p></div><article className="panel availability-panel"><div className="panel-heading"><div><p className="eyebrow">America/Chicago</p><h2>Regular weekly hours</h2></div><span className="health-badge success">Active</span></div>{days.map((d,i) => <div className="availability-row" key={d}><strong>{d}</strong><span>{i === 4 ? "9:00 AM – 1:00 PM" : "9:00 AM – 4:30 PM"}</span><small>{data.coaches.length} coaches</small></div>)}</article></div>; }
function SimpleView({ eyebrow, title, text, items }: { eyebrow: string; title: string; text: string; items: string[] }) { if (title === "Coaches") return null; return <div className="content-stack fade-in"><section className="unavailable-hero"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{text}</p></div></section><article className="panel simple-list">{items.map(item => <div key={item}><Check size={17}/><span>{item}</span></div>)}</article></div>; }
function Empty({ text }: { text: string }) { return <div className="empty-state"><Check size={20}/><p>{text}</p></div>; }

function BlackoutModal({ companyId, demo, onClose, onCreate }: { companyId: string; demo: boolean; onClose: () => void; onCreate: (w: UnavailableWindow) => void }) {
  const [form, setForm] = useState({ title: "Unavailable", startsAt: tomorrowDate, endsAt: tomorrowDate, reason: "" });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) { e.preventDefault(); setSaving(true); setError(""); const body = { companyId, title: form.title, reason: form.reason, startsAt: new Date(`${form.startsAt}T00:00:00`).toISOString(), endsAt: new Date(`${form.endsAt}T23:59:59`).toISOString(), allDay: true }; try { let window: UnavailableWindow; if (demo) { window = { id: crypto.randomUUID(), whop_company_id: companyId, coach_id: null, offer_id: null, title: form.title, reason: form.reason, starts_at: body.startsAt, ends_at: body.endsAt, all_day: true, recurrence_rule: null, status: "active" }; } else { const response = await fetch("/api/unavailable-windows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); window = payload.window; } onCreate(window); } catch (err) { setError(err instanceof Error ? err.message : "Could not add this blackout."); } finally { setSaving(false); } }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="modal sc-card" onSubmit={submit}><div className="panel-heading"><div><p className="eyebrow">Protect your time</p><h2>Add unavailable dates</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19}/></button></div><div className="field"><label htmlFor="blackout-title">Label</label><input id="blackout-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></div><div className="form-grid"><div className="field"><label htmlFor="blackout-start">First unavailable day</label><input id="blackout-start" type="date" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} required /></div><div className="field"><label htmlFor="blackout-end">Last unavailable day</label><input id="blackout-end" type="date" min={form.startsAt} value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} required /></div></div><div className="field"><label htmlFor="blackout-reason">Private admin note</label><textarea id="blackout-reason" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Why is this time blocked?" /></div>{error && <p className="form-error">{error}</p>}<div className="notice"><AlertTriangle size={17}/><span>Bookings already inside this range will be returned as conflicts for review.</span></div><div className="modal-actions"><button className="sc-btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="sc-btn-primary" disabled={saving}>{saving ? "Blocking dates…" : "Block these dates"}</button></div></form></div>;
}

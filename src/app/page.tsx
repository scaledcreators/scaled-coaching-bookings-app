import Link from "next/link";
import { ArrowRight, CalendarCheck, ListChecks, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <main className="theme-root landing">
      <nav className="nav landing-nav">
        <Link className="landing-brand" href="/"><strong>Coaching Bookings</strong><small>Created by &ldquo;Scaled Creators&rdquo;</small></Link>
        <span className="status-badge active">Whop native</span>
      </nav>
      <section className="landing-hero">
        <p className="eyebrow">Manual coaching, beautifully organized</p>
        <h1>Your time stays protected.<br /><span className="gradient-text">Your members feel guided.</span></h1>
        <p className="landing-copy">A concierge booking experience for coaching calls, audits, VIP days, and retainers—sold through Whop and confirmed by you.</p>
        <div className="actions">
          <Link className="sc-btn-primary" href="/experiences/exp_demo">Preview member view <ArrowRight size={16} /></Link>
          <Link className="sc-btn-secondary" href="/dashboard/biz_demo">Preview dashboard</Link>
        </div>
      </section>
      <section className="feature-grid" aria-label="Product highlights">
        <article className="sc-card feature-card"><CalendarCheck /><h2>Unavailable-first</h2><p>Black out a day, a month, or a recurring window before anyone can request it.</p></article>
        <article className="sc-card feature-card"><ListChecks /><h2>Concierge queue</h2><p>Approve the time, assign a coach, and add private meeting details in one calm workflow.</p></article>
        <article className="sc-card feature-card"><ShieldCheck /><h2>Whop access</h2><p>Paid offers unlock from verified Whop access and payment events—never a separate checkout.</p></article>
      </section>
    </main>
  );
}

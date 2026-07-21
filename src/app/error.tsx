"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return <main className="theme-root" style={{ display: "grid", placeItems: "center", padding: 24 }}><section className="sc-card" style={{ maxWidth: 520, borderRadius: 18, padding: 28 }}><p className="eyebrow">Couldn’t open this view</p><h1>Check the app connection.</h1><p className="muted">{error.message || "Whop or Supabase could not verify this request."}</p><button className="sc-btn-primary" onClick={reset}>Try again</button></section></main>;
}

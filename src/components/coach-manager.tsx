"use client";

import { useEffect, useState } from "react";
import { Pencil, UserRound, X } from "lucide-react";
import { OverlayPortal } from "@/components/overlay-portal";
import type { Coach } from "@/lib/types";

export function CoachManager({
  companyId,
  demo,
  initialCoach,
  onCoachChange,
}: {
  companyId: string;
  demo: boolean;
  initialCoach: Coach | null;
  onCoachChange?: (coach: Coach) => void;
}) {
  const [coach, setCoach] = useState(initialCoach);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: initialCoach?.name ?? "",
    bio: initialCoach?.bio ?? "",
    timezone: initialCoach?.timezone ?? "America/Chicago",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && open && !saving) setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, saving]);

  function edit() {
    if (!coach) return;
    setForm({
      name: coach.name,
      bio: coach.bio ?? "",
      timezone: coach.timezone,
    });
    setError("");
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!coach) return;
    setSaving(true);
    setError("");
    try {
      let updated: Coach;
      if (demo) {
        updated = { ...coach, ...form, bio: form.bio || null };
      } else {
        const response = await fetch(`/api/coaches/${coach.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyId, ...form }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        updated = payload.coach;
      }
      setCoach(updated);
      onCoachChange?.(updated);
      setOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content-stack fade-in">
      <header className="section-page-heading">
        <div>
          <p className="eyebrow">Session host</p>
          <h2>Coach profile</h2>
          <p>
            This is the single coach customers see and the owner used for all
            availability, capacity, and bookings.
          </p>
        </div>
      </header>

      {!coach ? (
        <section className="panel coach-profile-empty">
          <UserRound size={28} />
          <div>
            <strong>No active coach profile</strong>
            <p>
              The installation needs one coach profile before it can accept
              requests. Multiple coach rosters are not supported.
            </p>
          </div>
        </section>
      ) : (
        <section className="panel single-coach-profile">
          <span
            className={`coach-avatar single ${coach.avatar_url ? "has-photo" : ""}`}
            style={
              coach.avatar_url
                ? { backgroundImage: `url(${JSON.stringify(coach.avatar_url).slice(1, -1)})` }
                : undefined
            }
          >
            {!coach.avatar_url && <UserRound />}
          </span>
          <div className="single-coach-copy">
            <span className="health-badge success">Active</span>
            <h3>{coach.name}</h3>
            <p>{coach.bio || "Add a short bio or specialty."}</p>
            <small>{coach.timezone}</small>
          </div>
          <button type="button" className="sc-btn-secondary" onClick={edit}>
            <Pencil size={15} /> Edit profile
          </button>
        </section>
      )}

      {open && coach && (
        <OverlayPortal>
          <div
            className="modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !saving) setOpen(false);
            }}
          >
            <form
              className="modal sc-card"
              onSubmit={submit}
              role="dialog"
              aria-modal="true"
              aria-labelledby="coach-dialog-title"
            >
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Public profile</p>
                  <h2 id="coach-dialog-title">Edit coach profile</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                  aria-label="Close coach dialog"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="field">
                <label htmlFor="coach-name">Name</label>
                <input
                  id="coach-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="coach-bio">Bio / specialty</label>
                <textarea
                  id="coach-bio"
                  value={form.bio}
                  onChange={(event) =>
                    setForm({ ...form, bio: event.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="coach-timezone">Timezone</label>
                <input
                  id="coach-timezone"
                  value={form.timezone}
                  onChange={(event) =>
                    setForm({ ...form, timezone: event.target.value })
                  }
                  required
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="sc-btn-secondary"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button className="sc-btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save profile"}
                </button>
              </div>
            </form>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}

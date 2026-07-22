"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { OverlayPortal } from "@/components/overlay-portal";
import type { Coach } from "@/lib/types";

const empty = { name: "", bio: "", timezone: "America/Chicago" };

export function CoachManager({
  companyId,
  demo,
  initialCoaches,
  onCoachesChange,
}: {
  companyId: string;
  demo: boolean;
  initialCoaches: Coach[];
  onCoachesChange?: (coaches: Coach[]) => void;
}) {
  const [coaches, setCoaches] = useState(initialCoaches);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<Coach | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && open && !saving) setOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, saving]);

  function edit(coach?: Coach) {
    setEditingId(coach?.id ?? null);
    setForm(
      coach
        ? { name: coach.name, bio: coach.bio ?? "", timezone: coach.timezone }
        : empty,
    );
    setError("");
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      let coach: Coach;

      if (demo) {
        coach = {
          id: editingId ?? crypto.randomUUID(),
          whop_company_id: companyId,
          ...form,
          status: "active",
        };
      } else {
        const response = await fetch(
          editingId ? `/api/coaches/${editingId}` : "/api/coaches",
          {
            method: editingId ? "PATCH" : "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ companyId, ...form }),
          },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        coach = payload.coach;
      }

      setCoaches((items) => {
        const next = editingId
          ? items.map((item) => (item.id === editingId ? coach : item))
          : [...items, coach];
        onCoachesChange?.(next);
        return next;
      });
      setOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save coach.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!pendingArchive) return;
    setArchiving(true);
    setError("");

    try {
      if (!demo) {
        const response = await fetch(
          `/api/coaches/${pendingArchive.id}?companyId=${encodeURIComponent(companyId)}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error || "Could not archive coach.");
        }
      }

      setCoaches((items) => {
        const next = items.filter((item) => item.id !== pendingArchive.id);
        onCoachesChange?.(next);
        return next;
      });
      setPendingArchive(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not archive coach.",
      );
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="content-stack fade-in">
      <section className="unavailable-hero">
        <div>
          <p className="eyebrow">Your team</p>
          <h2>Coaches & assignment</h2>
          <p>
            Manage the people who deliver sessions. Each coach receives their own
            weekly availability.
          </p>
        </div>
        <button type="button" className="sc-btn-primary" onClick={() => edit()}>
          <Plus size={16} /> Add coach
        </button>
      </section>

      {error && !open && <p className="form-error action-error">{error}</p>}

      <div className="coach-grid">
        {coaches.length === 0 && (
          <div className="panel coach-empty">
            <UserRound />
            <strong>No active coaches yet</strong>
            <p>
              Add the person who will deliver sessions, then set their weekly
              availability.
            </p>
            <button
              type="button"
              className="sc-btn-primary"
              onClick={() => edit()}
            >
              <Plus size={16} /> Add first coach
            </button>
          </div>
        )}

        {coaches.map((coach) => (
          <article className="coach-card panel" key={coach.id}>
            <span className="coach-avatar">
              <UserRound />
            </span>
            <div>
              <span className="health-badge success">Active</span>
              <h3>{coach.name}</h3>
              <p>{coach.bio || "No bio yet."}</p>
              <small>{coach.timezone}</small>
              <div className="manage-actions">
                <button type="button" onClick={() => edit(coach)}>
                  <Pencil size={14} /> Edit
                </button>
                <button
                  type="button"
                  className="danger-link"
                  onClick={() => setPendingArchive(coach)}
                >
                  <Trash2 size={14} /> Archive
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {open && (
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
                  <p className="eyebrow">Team member</p>
                  <h2 id="coach-dialog-title">
                    {editingId ? "Edit coach" : "Add a coach"}
                  </h2>
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
                  {saving ? "Saving…" : "Save coach"}
                </button>
              </div>
            </form>
          </div>
        </OverlayPortal>
      )}

      {pendingArchive && (
        <ConfirmDialog
          title={`Archive ${pendingArchive.name}?`}
          description="The coach will no longer be available for new assignments. Existing booking history stays intact."
          confirmLabel="Archive coach"
          busy={archiving}
          onClose={() => setPendingArchive(null)}
          onConfirm={archive}
        />
      )}
    </div>
  );
}

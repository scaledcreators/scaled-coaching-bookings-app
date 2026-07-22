"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { OverlayPortal } from "@/components/overlay-portal";

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  return (
    <OverlayPortal>
      <div
        className="modal-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) onClose();
        }}
      >
        <section
          className="modal confirm-modal sc-card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-description"
        >
          <div className="confirm-dialog-icon">
            <AlertTriangle size={21} />
          </div>
          <button
            type="button"
            className="icon-button confirm-dialog-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close confirmation"
          >
            <X size={18} />
          </button>
          <div>
            <p className="eyebrow">Please confirm</p>
            <h2 id="confirm-dialog-title">{title}</h2>
            <p id="confirm-dialog-description">{description}</p>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="sc-btn-secondary"
              onClick={onClose}
              disabled={busy}
            >
              Keep it
            </button>
            <button
              type="button"
              className="sc-btn-danger"
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </section>
      </div>
    </OverlayPortal>
  );
}

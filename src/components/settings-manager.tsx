"use client";

import { useRef, useState } from "react";
import {
  Check,
  Globe2,
  ImageIcon,
  LifeBuoy,
  Palette,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { CustomSelect } from "@/components/custom-select";
import { useTenantTheme } from "@/components/tenant-theme-provider";
import { DEFAULT_SUPPORT_CONTACT } from "@/lib/constants";
import { DEFAULT_APPEARANCE, THEME_PRESETS } from "@/lib/theme";
import type { BookingSettings } from "@/lib/types";

const timezoneOptions = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
].map((value) => ({ value, label: value.replaceAll("_", " ") }));
const colorKeys = [
  { key: "theme_primary", label: "Primary" },
  { key: "theme_accent", label: "Accent" },
  { key: "theme_highlight", label: "Highlight" },
] as const;

export function SettingsManager({
  companyId,
  demo,
  initialSettings,
}: {
  companyId: string;
  demo: boolean;
  initialSettings: BookingSettings;
}) {
  const { settings, updatePreview, replaceSettings } = useTenantTheme();
  const [form, setForm] = useState({
    defaultTimezone: initialSettings.default_timezone,
    supportContact: initialSettings.support_contact || DEFAULT_SUPPORT_CONTACT,
  });
  const [advanced, setAdvanced] = useState(settings.theme_name === "custom");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function markChanged() {
    setSaved(false);
    setError("");
  }

  function preview(changes: Partial<BookingSettings>) {
    markChanged();
    updatePreview(changes);
  }

  function applyPreset(preset: (typeof THEME_PRESETS)[number]) {
    setAdvanced(false);
    preview({
      theme_name: preset.name,
      theme_primary: preset.primary,
      theme_accent: preset.accent,
      theme_highlight: preset.highlight,
    });
  }

  function updateColor(key: (typeof colorKeys)[number]["key"], value: string) {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
    setAdvanced(true);
    preview({ theme_name: "custom", [key]: value.toLowerCase() });
  }

  async function uploadIcon(file: File | undefined) {
    setDragging(false);
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type,
      )
    ) {
      setError("Use a PNG, JPG, WebP, or GIF image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("The icon must be 5 MB or smaller.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      if (demo) {
        preview({ logo_url: URL.createObjectURL(file) });
        return;
      }
      const body = new FormData();
      body.set("companyId", companyId);
      body.set("file", file);
      const response = await fetch("/api/settings/icon", {
        method: "POST",
        body,
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Could not upload icon.");
      preview({ logo_url: payload.url });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not upload icon.",
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!demo) {
        const response = await fetch("/api/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            companyId,
            defaultTimezone: form.defaultTimezone,
            supportContact: form.supportContact,
            displayName: settings.display_name,
            logoUrl: settings.logo_url,
            themeName: settings.theme_name,
            themePrimary: settings.theme_primary,
            themeAccent: settings.theme_accent,
            themeHighlight: settings.theme_highlight,
          }),
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "Could not save settings.");
        replaceSettings(payload.settings);
      }
      setSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content-stack settings-page fade-in">
      <header className="section-page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>Settings</h2>
          <p>
            Make the coaching experience feel like your brand. Changes are
            scoped only to this Whop company.
          </p>
        </div>
      </header>
      <form className="settings-stack" onSubmit={save}>
        <section className="panel settings-card identity-settings-card">
          <div className="settings-card-icon">
            <ImageIcon size={20} />
          </div>
          <div className="settings-card-body">
            <div className="settings-card-heading">
              <h3>App identity</h3>
              <p>
                Use your company name and icon everywhere members and operators
                see this app.
              </p>
            </div>
            <div className="identity-settings-grid">
              <div
                className={`icon-uploader ${dragging ? "dragging" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  void uploadIcon(event.dataTransfer.files[0]);
                }}
              >
                <div className="icon-uploader-preview">
                  {settings.logo_url ? (
                    <span
                      role="img"
                      aria-label="Current app icon"
                      style={{ backgroundImage: `url(${settings.logo_url})` }}
                    />
                  ) : (
                    <span>
                      {settings.display_name.charAt(0).toUpperCase() || "C"}
                    </span>
                  )}
                </div>
                <div>
                  <strong>App icon</strong>
                  <p>Square PNG, JPG, WebP, or GIF. Up to 5 MB.</p>
                  <div className="icon-uploader-actions">
                    <button
                      type="button"
                      className="sc-btn-secondary"
                      onClick={() => fileInput.current?.click()}
                      disabled={uploading}
                    >
                      <Upload size={15} />
                      {uploading ? "Uploading…" : "Choose image"}
                    </button>
                    {settings.logo_url && (
                      <button
                        type="button"
                        className="icon-remove-button"
                        onClick={() => preview({ logo_url: null })}
                      >
                        <X size={15} /> Remove
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={fileInput}
                  className="sr-only"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => void uploadIcon(event.target.files?.[0])}
                />
              </div>
              <div className="field">
                <label>App name</label>
                <input
                  value={settings.display_name}
                  maxLength={60}
                  onChange={(event) =>
                    preview({ display_name: event.target.value })
                  }
                  placeholder="Coaching Bookings"
                  required
                />
                <small className="field-help">
                  The “Created by &ldquo;Scaled Creators&rdquo;” credit always appears
                  underneath.
                </small>
              </div>
            </div>
          </div>
        </section>

        <section className="panel settings-card theme-settings-card">
          <div className="settings-card-icon">
            <Palette size={20} />
          </div>
          <div className="settings-card-body">
            <div className="settings-card-heading">
              <h3>Theme</h3>
              <p>
                Pick a complete colorway. The dashboard and member experience
                update live while you choose.
              </p>
            </div>
            <div className="theme-preset-grid">
              {THEME_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.name}
                  className={`theme-preset ${settings.theme_name === preset.name ? "selected" : ""}`}
                  onClick={() => applyPreset(preset)}
                  aria-pressed={settings.theme_name === preset.name}
                >
                  <span
                    className="theme-preset-swatch"
                    style={{
                      background: `linear-gradient(135deg,${preset.accent},${preset.primary},${preset.highlight})`,
                    }}
                  />
                  <span>{preset.name}</span>
                  {settings.theme_name === preset.name && <Check size={14} />}
                </button>
              ))}
            </div>
            <div className="theme-advanced-heading">
              <button
                type="button"
                className="advanced-toggle"
                onClick={() => setAdvanced((current) => !current)}
                aria-expanded={advanced}
              >
                {advanced ? "Hide custom colors" : "Customize colors"}
              </button>
              <button
                type="button"
                className="reset-theme-button"
                onClick={() => {
                  setAdvanced(false);
                  preview({
                    ...DEFAULT_APPEARANCE,
                    display_name: settings.display_name,
                    logo_url: settings.logo_url,
                  });
                }}
              >
                <RotateCcw size={14} /> Reset colors
              </button>
            </div>
            {advanced && (
              <div className="theme-color-grid">
                {colorKeys.map(({ key, label }) => (
                  <label className="hex-color-field" key={key}>
                    <span>{label}</span>
                    <div>
                      <input
                        type="color"
                        value={settings[key]}
                        onChange={(event) =>
                          updateColor(key, event.target.value)
                        }
                        aria-label={`${label} color`}
                      />
                      <input
                        key={`${key}-${settings[key]}`}
                        defaultValue={settings[key]}
                        maxLength={7}
                        pattern="#[0-9a-fA-F]{6}"
                        onChange={(event) =>
                          updateColor(key, event.target.value)
                        }
                        onBlur={(event) => {
                          if (!/^#[0-9a-fA-F]{6}$/.test(event.target.value)) {
                            event.target.value = settings[key];
                          }
                        }}
                        aria-label={`${label} hex value`}
                      />
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-card-icon">
            <Globe2 size={20} />
          </div>
          <div className="settings-card-body">
            <div className="settings-card-heading">
              <h3>Regional settings</h3>
              <p>
                Used for availability, booking requests, and customer-facing
                session times.
              </p>
            </div>
            <div className="field">
              <label>Default timezone</label>
              <CustomSelect
                value={form.defaultTimezone}
                options={timezoneOptions}
                onChange={(value) => {
                  markChanged();
                  setForm({ ...form, defaultTimezone: value });
                }}
                placeholder="Choose a timezone"
              />
              <small className="field-help">
                Individual coaches can still keep their own timezone.
              </small>
            </div>
          </div>
        </section>
        <section className="panel settings-card">
          <div className="settings-card-icon">
            <LifeBuoy size={20} />
          </div>
          <div className="settings-card-body">
            <div className="settings-card-heading">
              <h3>Customer support</h3>
              <p>
                Give customers a direct way to contact you from the coaching
                experience.
              </p>
            </div>
            <div className="field">
              <label>Support email</label>
              <input
                type="email"
                value={form.supportContact}
                onChange={(event) => {
                  markChanged();
                  setForm({ ...form, supportContact: event.target.value });
                }}
                placeholder="support@example.com"
                required
              />
              <small className="field-help">
                This address appears in the customer Help panel.
              </small>
            </div>
          </div>
        </section>
        {error && <p className="form-error action-error">{error}</p>}
        <div className="settings-action-bar">
          <div>
            <strong>Company appearance & settings</strong>
            <span>
              {saved
                ? "Your changes are live."
                : "Preview changes, then save when you’re ready."}
            </span>
          </div>
          <button className="sc-btn-primary" disabled={saving || uploading}>
            {saving ? (
              "Saving…"
            ) : saved ? (
              <>
                <Check size={16} /> Saved
              </>
            ) : (
              "Save changes"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

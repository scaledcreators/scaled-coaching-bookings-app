"use client";

import { useMemo, useState } from "react";
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
} from "lucide-react";
import { CustomCheckbox } from "@/components/custom-checkbox";
import type {
  AvailabilityRule,
  Booking,
  CapacityOverride,
  Coach,
} from "@/lib/types";
import {
  bookingDatesInTimezone,
  bookingReservesCapacity,
} from "@/lib/booking-lifecycle";

const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const shortDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
type Day = {
  weekday: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

const blankDays = (): Day[] =>
  dayNames.map((_, weekday) => ({
    weekday,
    enabled: weekday > 0 && weekday < 6,
    startTime: "09:00",
    endTime: "17:00",
  }));

function toDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1, 12);
}

function calendarDays(month: Date) {
  const start = startOfMonth(month);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);
    return value;
  });
}

export function AvailabilityManager({
  companyId,
  demo,
  coach,
  initialRules,
  timezone,
  defaultDailyCapacity,
  initialCapacityOverrides,
  bookings,
  onAddBlackout,
  onRulesChange,
  onDataChange,
}: {
  companyId: string;
  demo: boolean;
  coach: Coach | null;
  initialRules: AvailabilityRule[];
  timezone: string;
  defaultDailyCapacity: number;
  initialCapacityOverrides: CapacityOverride[];
  bookings: Booking[];
  onAddBlackout: () => void;
  onRulesChange?: (rules: AvailabilityRule[]) => void;
  onDataChange?: () => void;
}) {
  const coachId = coach?.id ?? null;
  const rules = initialRules;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Day[] | null>(null);
  const [dailyCapacity, setDailyCapacity] = useState(defaultDailyCapacity);
  const [capacitySource, setCapacitySource] = useState(defaultDailyCapacity);
  const [capacityDirty, setCapacityDirty] = useState(false);
  const [capacitySaved, setCapacitySaved] = useState(false);
  const [overrides, setOverrides] = useState(initialCapacityOverrides);
  const overrideSignature = JSON.stringify(initialCapacityOverrides);
  const [overrideSourceSignature, setOverrideSourceSignature] =
    useState(overrideSignature);
  const [capacityMonth, setCapacityMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const selectedOverride = overrides.find(
    (override) => override.capacity_date === selectedDate,
  );
  const [overrideCapacity, setOverrideCapacity] = useState(
    selectedOverride?.max_bookings ?? defaultDailyCapacity,
  );
  const capacityUsage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const booking of bookings) {
      if (!bookingReservesCapacity(booking)) continue;
      for (const key of bookingDatesInTimezone(booking, timezone)) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }, [bookings, timezone]);

  if (capacitySource !== defaultDailyCapacity) {
    setCapacitySource(defaultDailyCapacity);
    if (!capacityDirty) setDailyCapacity(defaultDailyCapacity);
  }
  if (overrideSourceSignature !== overrideSignature) {
    setOverrideSourceSignature(overrideSignature);
    setOverrides(initialCapacityOverrides);
  }

  const days = useMemo(() => {
    const result = blankDays().map((day) => ({ ...day, enabled: false }));
    const scoped = rules.filter(
      (rule) => rule.coach_id === coachId && rule.offer_id === null,
    );
    if (!scoped.length) return blankDays();
    for (const rule of scoped) {
      result[rule.weekday] = {
        weekday: rule.weekday,
        enabled: true,
        startTime: rule.start_time.slice(0, 5),
        endTime: rule.end_time.slice(0, 5),
      };
    }
    return result;
  }, [coachId, rules]);
  const current = draft ?? days;

  function changeDay(weekday: number, update: Partial<Day>) {
    setSaved(false);
    setDraft(
      current.map((day) =>
        day.weekday === weekday ? { ...day, ...update } : day,
      ),
    );
  }

  async function saveAvailability() {
    if (!coachId) return;
    setSaving(true);
    setError("");
    try {
      let next: AvailabilityRule[];
      if (demo) {
        next = current
          .filter((day) => day.enabled)
          .map((day) => ({
            id: crypto.randomUUID(),
            whop_company_id: companyId,
            coach_id: coachId,
            offer_id: null,
            weekday: day.weekday,
            start_time: day.startTime,
            end_time: day.endTime,
            timezone,
            status: "active",
          }));
      } else {
        const response = await fetch("/api/availability-rules", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            companyId,
            coachId,
            timezone,
            days: current,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        next = payload.rules;
      }
      const merged = [
        ...rules.filter(
          (rule) => !(rule.coach_id === coachId && rule.offer_id === null),
        ),
        ...next,
      ];
      onRulesChange?.(merged);
      setDraft(null);
      setSaved(true);
      onDataChange?.();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save availability.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveDefaultCapacity() {
    setSaving(true);
    setError("");
    try {
      if (!demo) {
        const response = await fetch("/api/capacity-settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            companyId,
            defaultDailyCapacity: dailyCapacity,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
      }
      setCapacitySaved(true);
      setCapacityDirty(false);
      onDataChange?.();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save capacity.",
      );
    } finally {
      setSaving(false);
    }
  }

  function chooseCapacityDate(date: string) {
    setSelectedDate(date);
    setOverrideCapacity(
      overrides.find((override) => override.capacity_date === date)
        ?.max_bookings ?? dailyCapacity,
    );
  }

  async function saveOverride() {
    setSaving(true);
    setError("");
    try {
      let savedOverride: CapacityOverride;
      if (demo) {
        savedOverride = {
          id: selectedOverride?.id ?? crypto.randomUUID(),
          whop_company_id: companyId,
          capacity_date: selectedDate,
          max_bookings: overrideCapacity,
        };
      } else {
        const response = await fetch("/api/capacity-settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            companyId,
            date: selectedDate,
            maxBookings: overrideCapacity,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        savedOverride = payload.override;
      }
      setOverrides((items) => [
        ...items.filter((item) => item.capacity_date !== selectedDate),
        savedOverride,
      ]);
      onDataChange?.();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save override.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeOverride() {
    if (!selectedOverride) return;
    setSaving(true);
    setError("");
    try {
      if (!demo) {
        const query = new URLSearchParams({ companyId, date: selectedDate });
        const response = await fetch(`/api/capacity-settings?${query}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error);
        }
      }
      setOverrides((items) =>
        items.filter((item) => item.capacity_date !== selectedDate),
      );
      setOverrideCapacity(dailyCapacity);
      onDataChange?.();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not remove override.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content-stack fade-in">
      <header className="section-page-heading">
        <div>
          <p className="eyebrow">Weekly schedule</p>
          <h2>Availability</h2>
          <p>
            Set the hours and daily workload for your single coaching calendar.
          </p>
        </div>
      </header>

      {!coach ? (
        <div className="notice">An active coach profile is required first.</div>
      ) : (
        <section className="panel availability-editor">
          <div className="panel-heading availability-heading">
            <div>
              <h2>Requestable hours</h2>
              <p>
                Blackouts, bookings, buffers, notice periods, and daily capacity
                are removed automatically.
              </p>
            </div>
            <span className="single-schedule-owner">{coach.name}</span>
          </div>
          <div className="schedule-days">
            {current.map((day) => (
              <div
                className={`availability-edit-row ${day.enabled ? "enabled" : ""}`}
                key={day.weekday}
              >
                <CustomCheckbox
                  checked={day.enabled}
                  onChange={(enabled) => changeDay(day.weekday, { enabled })}
                  label={dayNames[day.weekday]}
                  description={day.enabled ? "Accept requests" : "Unavailable"}
                />
                {day.enabled && (
                  <div className="time-range">
                    <Clock3 size={15} />
                    <label>
                      <span>From</span>
                      <input
                        type="time"
                        value={day.startTime}
                        onChange={(event) =>
                          changeDay(day.weekday, {
                            startTime: event.target.value,
                          })
                        }
                      />
                    </label>
                    <span className="time-separator">to</span>
                    <label>
                      <span>Until</span>
                      <input
                        type="time"
                        value={day.endTime}
                        onChange={(event) =>
                          changeDay(day.weekday, {
                            endTime: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="availability-save-row">
            <span className="muted">Times use {timezone}</span>
            <button
              className="sc-btn-primary"
              onClick={saveAvailability}
              disabled={saving}
            >
              {saving ? (
                "Saving…"
              ) : saved ? (
                <><Check size={16} /> Changes saved</>
              ) : (
                "Save availability"
              )}
            </button>
          </div>
        </section>
      )}

      <section className="panel capacity-settings">
        <div className="panel-heading capacity-heading">
          <div>
            <p className="eyebrow">Daily workload</p>
            <h2>Booking capacity</h2>
            <p>
              The default applies to every date. Select a calendar date to make
              a one-day exception.
            </p>
          </div>
          <div className="default-capacity-control">
            <label htmlFor="daily-capacity">Default per day</label>
            <div>
              <input
                id="daily-capacity"
                type="number"
                min="1"
                max="100"
                value={dailyCapacity}
                onChange={(event) => {
                  setDailyCapacity(Number(event.target.value));
                  setCapacityDirty(true);
                  setCapacitySaved(false);
                }}
              />
              <button
                type="button"
                className="sc-btn-secondary"
                onClick={saveDefaultCapacity}
                disabled={saving || dailyCapacity < 1}
              >
                {capacitySaved ? <><Check size={15} /> Saved</> : "Save default"}
              </button>
            </div>
          </div>
        </div>
        <div className="capacity-layout">
          <div className="capacity-calendar">
            <header>
              <button
                type="button"
                aria-label="Previous month"
                onClick={() =>
                  setCapacityMonth(
                    new Date(
                      capacityMonth.getFullYear(),
                      capacityMonth.getMonth() - 1,
                      1,
                      12,
                    ),
                  )
                }
              >
                <ChevronLeft size={18} />
              </button>
              <strong>
                {new Intl.DateTimeFormat("en-US", {
                  month: "long",
                  year: "numeric",
                }).format(capacityMonth)}
              </strong>
              <button
                type="button"
                aria-label="Next month"
                onClick={() =>
                  setCapacityMonth(
                    new Date(
                      capacityMonth.getFullYear(),
                      capacityMonth.getMonth() + 1,
                      1,
                      12,
                    ),
                  )
                }
              >
                <ChevronRight size={18} />
              </button>
            </header>
            <div className="capacity-weekdays" aria-hidden="true">
              {shortDays.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="capacity-grid">
              {calendarDays(capacityMonth).map((date) => {
                const key = toDateKey(date);
                const outside = date.getMonth() !== capacityMonth.getMonth();
                const override = overrides.find(
                  (item) => item.capacity_date === key,
                );
                const limit = override?.max_bookings ?? dailyCapacity;
                const reserved = capacityUsage.get(key) ?? 0;
                const full = limit === 0 || reserved >= limit;
                return (
                  <button
                    type="button"
                    key={key}
                    className={`${outside ? "outside" : ""} ${override ? "has-override" : ""} ${full ? "at-capacity" : ""} ${selectedDate === key ? "selected" : ""}`}
                    disabled={outside}
                    aria-pressed={selectedDate === key}
                    onClick={() => chooseCapacityDate(key)}
                  >
                    <span>{date.getDate()}</span>
                    {!outside && <small>{reserved}/{limit}</small>}
                  </button>
                );
              })}
            </div>
          </div>
          <aside className="capacity-date-editor">
            <small>Selected date</small>
            <h3>
              {new Intl.DateTimeFormat("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              }).format(new Date(`${selectedDate}T12:00:00`))}
            </h3>
            <p>
              {selectedOverride
                ? `This date overrides the ${dailyCapacity}-booking default.`
                : `This date currently uses the ${dailyCapacity}-booking default.`}
            </p>
            <div className="capacity-usage-summary">
              <span>
                <strong>{capacityUsage.get(selectedDate) ?? 0}</strong> reserved
              </span>
              <span>
                <strong>{selectedOverride?.max_bookings ?? dailyCapacity}</strong> maximum
              </span>
            </div>
            <p className="capacity-source">
              {selectedOverride ? "Date override" : "Default capacity"}
              {(selectedOverride?.max_bookings ?? dailyCapacity) === 0
                ? " · Closed"
                : (capacityUsage.get(selectedDate) ?? 0) >=
                    (selectedOverride?.max_bookings ?? dailyCapacity)
                  ? " · At capacity"
                  : " · Accepting requests"}
            </p>
            <div className="field">
              <label htmlFor="override-capacity">Maximum bookings</label>
              <input
                id="override-capacity"
                type="number"
                min="0"
                max="100"
                value={overrideCapacity}
                onChange={(event) =>
                  setOverrideCapacity(Number(event.target.value))
                }
              />
              <span className="field-help">Set 0 to close this date.</span>
            </div>
            <button
              type="button"
              className="sc-btn-primary"
              onClick={saveOverride}
              disabled={saving || overrideCapacity < 0}
            >
              Save date override
            </button>
            {selectedOverride && (
              <button
                type="button"
                className="text-button"
                onClick={removeOverride}
                disabled={saving}
              >
                Use the default again
              </button>
            )}
          </aside>
        </div>
      </section>

      {error && <p className="form-error action-error">{error}</p>}

      <section className="blackout-callout panel">
        <span className="blackout-callout-icon"><Ban size={21} /></span>
        <div>
          <p className="eyebrow">Exceptions</p>
          <h3>Blackout dates</h3>
          <p>
            Block vacations, travel, holidays, or any dates that should never
            appear to customers.
          </p>
        </div>
        <button className="sc-btn-secondary" onClick={onAddBlackout}>
          <Plus size={16} /> Add blackout dates
        </button>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";

type RangePart = "start" | "end";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const fieldFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const compactFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1, 12);
}

function calendarDays(month: Date) {
  const first = startOfMonth(month);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

export function CustomDateRangePicker({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activePart, setActivePart] = useState<RangePart>("start");
  const [month, setMonth] = useState(() =>
    startOfMonth(parseDateKey(startDate)),
  );
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const todayKey = toDateKey(new Date());

  useEffect(() => {
    if (!open) return;
    function closeFromOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  function openCalendar(part: RangePart) {
    setActivePart(part);
    setMonth(
      startOfMonth(parseDateKey(part === "start" ? startDate : endDate)),
    );
    setOpen(true);
  }

  function selectDate(date: Date) {
    const selected = toDateKey(date);
    if (activePart === "start") {
      onChange(selected, selected > endDate ? selected : endDate);
      setActivePart("end");
      return;
    }
    if (selected < startDate) return;
    onChange(startDate, selected);
    setOpen(false);
  }

  return (
    <div className={`date-range-picker ${open ? "open" : ""}`} ref={root}>
      <div className="date-range-fields">
        <div className="field">
          <label>First day</label>
          <button
            type="button"
            className={`date-field-trigger ${open && activePart === "start" ? "active" : ""}`}
            aria-haspopup="dialog"
            aria-expanded={open && activePart === "start"}
            onClick={() => openCalendar("start")}
          >
            <span>
              <small>Starts</small>
              <strong>{fieldFormatter.format(start)}</strong>
            </span>
            <CalendarDays size={18} />
          </button>
        </div>
        <div className="field">
          <label>Last day</label>
          <button
            type="button"
            className={`date-field-trigger ${open && activePart === "end" ? "active" : ""}`}
            aria-haspopup="dialog"
            aria-expanded={open && activePart === "end"}
            onClick={() => openCalendar("end")}
          >
            <span>
              <small>Ends</small>
              <strong>{fieldFormatter.format(end)}</strong>
            </span>
            <CalendarDays size={18} />
          </button>
        </div>
      </div>
      {open && (
        <div
          className="calendar-popover"
          role="dialog"
          aria-label={`Choose ${activePart === "start" ? "the first" : "the last"} unavailable day`}
        >
          <header className="calendar-header">
            <button
              type="button"
              className="calendar-nav-button"
              aria-label="Previous month"
              onClick={() =>
                setMonth(
                  new Date(month.getFullYear(), month.getMonth() - 1, 1, 12),
                )
              }
            >
              <ChevronLeft size={18} />
            </button>
            <div>
              <small>
                {activePart === "start"
                  ? "Choose first day"
                  : "Choose last day"}
              </small>
              <strong>{monthFormatter.format(month)}</strong>
            </div>
            <button
              type="button"
              className="calendar-nav-button"
              aria-label="Next month"
              onClick={() =>
                setMonth(
                  new Date(month.getFullYear(), month.getMonth() + 1, 1, 12),
                )
              }
            >
              <ChevronRight size={18} />
            </button>
          </header>
          <div className="calendar-weekdays" aria-hidden="true">
            {weekdays.map((day) => (
              <span key={day}>{day.slice(0, 2)}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarDays(month).map((date) => {
              const key = toDateKey(date);
              const beforeStart = activePart === "end" && key < startDate;
              const isStart = key === startDate;
              const isEnd = key === endDate;
              const inRange = key > startDate && key < endDate;
              const outside = date.getMonth() !== month.getMonth();
              return (
                <button
                  type="button"
                  key={key}
                  className={`${outside ? "outside" : ""} ${inRange ? "in-range" : ""} ${isStart ? "range-start" : ""} ${isEnd ? "range-end" : ""}`}
                  disabled={beforeStart}
                  aria-label={fieldFormatter.format(date)}
                  aria-pressed={isStart || isEnd}
                  aria-current={key === todayKey ? "date" : undefined}
                  onClick={() => selectDate(date)}
                >
                  <span>{date.getDate()}</span>
                  {key === todayKey && <i />}
                </button>
              );
            })}
          </div>
          <footer className="calendar-footer">
            <div>
              <small>Unavailable range</small>
              <strong>
                {compactFormatter.format(start)} <span>→</span>{" "}
                {compactFormatter.format(end)}
              </strong>
            </div>
            <button type="button" onClick={() => setOpen(false)}>
              <Check size={15} /> Done
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}

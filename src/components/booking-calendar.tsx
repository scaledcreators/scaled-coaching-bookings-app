"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";

export type BookingCalendarDay = {
  date: string;
  slots: string[];
  capacity: number;
  bookedCount: number;
};

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1, 12);
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function calendarCells(month: string) {
  const first = parseMonth(month);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);
    return value;
  });
}

function shiftMonth(month: string, amount: number) {
  const value = parseMonth(month);
  value.setMonth(value.getMonth() + amount);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

export function BookingCalendar({
  month,
  earliestMonth,
  latestMonth,
  days,
  timezone,
  selectedDate,
  selectedSlot,
  loading,
  onMonthChange,
  onDateChange,
  onSlotChange,
}: {
  month: string;
  earliestMonth: string;
  latestMonth: string;
  days: BookingCalendarDay[];
  timezone: string;
  selectedDate: string;
  selectedSlot: string;
  loading: boolean;
  onMonthChange: (month: string) => void;
  onDateChange: (date: string) => void;
  onSlotChange: (slot: string) => void;
}) {
  const monthDate = parseMonth(month);
  const monthNumber = monthDate.getMonth();
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const selected = dayMap.get(selectedDate);
  const today = dateKey(new Date());
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(monthDate);

  return (
    <div className="booking-calendar-shell">
      <section className="booking-month-panel" aria-label="Available dates">
        <header className="booking-calendar-header">
          <button
            type="button"
            aria-label="Previous month"
            disabled={month <= earliestMonth || loading}
            onClick={() => onMonthChange(shiftMonth(month, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <small>Available dates</small>
            <strong>{monthLabel}</strong>
          </div>
          <button
            type="button"
            aria-label="Next month"
            disabled={month >= latestMonth || loading}
            onClick={() => onMonthChange(shiftMonth(month, 1))}
          >
            <ChevronRight size={18} />
          </button>
        </header>
        <div className="booking-calendar-weekdays" aria-hidden="true">
          {weekdays.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className={`booking-calendar-grid ${loading ? "loading" : ""}`}>
          {calendarCells(month).map((date) => {
            const key = dateKey(date);
            const day = dayMap.get(key);
            const outside = date.getMonth() !== monthNumber;
            const available = Boolean(day?.slots.length) && !outside;
            return (
              <button
                type="button"
                key={key}
                className={`${outside ? "outside" : ""} ${available ? "available" : "unavailable"} ${selectedDate === key ? "selected" : ""}`}
                disabled={!available || loading}
                aria-label={`${date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${available ? ", available" : ", unavailable"}`}
                aria-pressed={selectedDate === key}
                aria-current={key === today ? "date" : undefined}
                onClick={() => onDateChange(key)}
              >
                <span>{date.getDate()}</span>
                {available && <i />}
              </button>
            );
          })}
        </div>
        <footer className="booking-calendar-legend">
          <span><i className="available-dot" /> Available</span>
          <span><i /> Unavailable or at capacity</span>
        </footer>
      </section>

      <section className="booking-times-panel" aria-label="Available times">
        <header>
          <span className="booking-times-icon">
            <Clock3 size={18} />
          </span>
          <div>
            <small>Available times</small>
            <strong>
              {selectedDate
                ? new Intl.DateTimeFormat("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${selectedDate}T12:00:00Z`))
                : "Choose a date"}
            </strong>
          </div>
        </header>
        {loading ? (
          <div className="booking-times-empty">Loading this month…</div>
        ) : !selected ? (
          <div className="booking-times-empty">
            <CalendarDays size={22} />
            <span>Select a highlighted date to see its times.</span>
          </div>
        ) : (
          <div className="booking-time-grid">
            {selected.slots.map((value) => {
              const date = new Date(value);
              return (
                <button
                  type="button"
                  key={value}
                  className={selectedSlot === value ? "selected" : ""}
                  aria-pressed={selectedSlot === value}
                  onClick={() => onSlotChange(value)}
                >
                  {new Intl.DateTimeFormat("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: timezone,
                  }).format(date)}
                </button>
              );
            })}
          </div>
        )}
        {selected && (
          <p>
            {selected.capacity - selected.bookedCount} of {selected.capacity}{" "}
            daily spots remain before this request.
          </p>
        )}
      </section>
    </div>
  );
}

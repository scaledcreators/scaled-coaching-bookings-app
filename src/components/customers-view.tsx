"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronRight, Search } from "lucide-react";
import {
  bookingMemberInitial,
  bookingMemberLabel,
  bookingMemberUsername,
} from "@/lib/member";
import {
  bookingStatusLabel,
  bookingStatusTone,
} from "@/lib/booking-status";
import type { Booking } from "@/lib/types";

export function CustomersView({ bookings }: { bookings: Booking[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const customers = useMemo(
    () =>
      Array.from(new Set(bookings.map((booking) => booking.whop_user_id)))
        .map((userId) => {
          const history = bookings.filter(
            (booking) => booking.whop_user_id === userId,
          );
          return {
            userId,
            label: bookingMemberLabel(history[0]),
            username: bookingMemberUsername(history[0]),
            history,
            upcoming: history.filter((booking) =>
              [
                "pending_approval",
                "pending_payment",
                "confirmed",
                "reschedule_requested",
              ].includes(booking.status),
            ).length,
            spentBookings: history.filter((booking) =>
              Boolean(booking.whop_payment_id),
            ).length,
          };
        })
        .filter((customer) =>
          `${customer.label} ${customer.username ?? ""} ${customer.userId}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        ),
    [bookings, query],
  );
  const active = customers.find((customer) => customer.userId === selected);

  return (
    <div className="content-stack fade-in">
      <section className="unavailable-hero">
        <div>
          <p className="eyebrow">Member care</p>
          <h2>Customers</h2>
          <p>
            Review each Whop member’s complete booking and payment-linked
            session history.
          </p>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, username, or ID"
          />
        </label>
      </section>
      <div className="customer-layout">
        <article className="panel customer-list">
          {customers.length === 0 && (
            <div className="empty-state">
              <CalendarDays />
              <p>No customers found.</p>
            </div>
          )}
          {customers.map((customer) => (
            <button
              key={customer.userId}
              className={selected === customer.userId ? "active" : ""}
              onClick={() => setSelected(customer.userId)}
            >
              <span className="avatar">
                {bookingMemberInitial(customer.history[0])}
              </span>
              <div>
                <strong>{customer.label}</strong>
                {customer.username && customer.username !== customer.label && (
                  <span className="customer-username">{customer.username}</span>
                )}
                <small>
                  {customer.history.length} bookings · {customer.upcoming} upcoming
                </small>
              </div>
              <ChevronRight size={16} />
            </button>
          ))}
        </article>
        <article className="panel customer-detail">
          {active ? (
            <>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Customer history</p>
                  <h2>{active.label}</h2>
                  {active.username && active.username !== active.label && (
                    <p className="customer-detail-username">{active.username}</p>
                  )}
                  <code className="customer-user-id">{active.userId}</code>
                </div>
                <span className="health-badge neutral">
                  {active.spentBookings} paid
                </span>
              </div>
              {active.history.map((booking) => (
                <div className="customer-booking" key={booking.id}>
                  <div>
                    <strong>
                      {booking.booking_offers?.title ?? "Coaching session"}
                    </strong>
                    <p>
                      {booking.requested_start_at
                        ? new Date(booking.requested_start_at).toLocaleString()
                        : "Time pending"}
                    </p>
                  </div>
                  <span
                    className={`health-badge ${bookingStatusTone(booking.status)}`}
                  >
                    {bookingStatusLabel(booking.status)}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <div className="empty-state customer-empty">
              <p>Select a customer to view booking history.</p>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

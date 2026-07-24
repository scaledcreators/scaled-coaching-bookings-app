import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607230001_capacity_and_booking_archive.sql",
  ),
  "utf8",
);

describe("atomic capacity migration contract", () => {
  it("serializes direct creates and reschedules before counting capacity", () => {
    expect(migration.match(/pg_advisory_xact_lock/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("create_booking_request_atomic");
    expect(migration).toContain("reschedule_booking_request_atomic");
    expect(migration).toContain("DAY_AT_CAPACITY");
    expect(migration).toContain("MEMBER_DAILY_LIMIT");
  });

  it("excludes missing and overdue payment deadlines from reservations", () => {
    expect(migration).toContain("b.payment_due_at > now()");
    expect(migration).toContain(
      "payment_due_at is null or payment_due_at <= now()",
    );
  });

  it("preserves financial records with soft archive fields", () => {
    expect(migration).toContain("admin_archived_at timestamptz");
    expect(migration).not.toMatch(/delete\s+from\s+booking_requests/i);
  });
});

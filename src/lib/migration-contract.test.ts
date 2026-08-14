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
const customizationMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202608130001_custom_labels_delivery_and_intake.sql",
  ),
  "utf8",
);
const notificationMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202608140001_whop_notification_delivery.sql",
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

describe("customization migration contract", () => {
  it("adds labels and delivery mode without replacing existing records", () => {
    expect(customizationMigration).toContain("add column if not exists service_label_singular");
    expect(customizationMigration).toContain("add column if not exists member_bookings_label");
    expect(customizationMigration).toContain("add column if not exists delivery_mode");
    expect(customizationMigration).not.toMatch(/drop\s+table|delete\s+from/i);
  });
});

describe("notification migration contract", () => {
  it("deduplicates each event and channel and preserves booking records", () => {
    expect(notificationMigration).toContain(
      "unique (booking_request_id, event_key, channel)",
    );
    expect(notificationMigration).toContain(
      "claim_booking_notification_delivery",
    );
    expect(notificationMigration).not.toMatch(/delete\s+from\s+booking_requests/i);
  });
});

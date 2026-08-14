import { describe, expect, it } from "vitest";
import { coachNotificationTarget } from "@/lib/notification-target";

describe("coach notification target", () => {
  it("targets the company owner through the installed experience", () => {
    expect(
      coachNotificationTarget("exp_test", "user_owner"),
    ).toStrictEqual({
      experience_id: "exp_test",
      user_ids: ["user_owner"],
    });
  });

  it("never uses the broken company/account notification target", () => {
    const target = coachNotificationTarget("exp_test", "user_owner");
    expect(target).not.toHaveProperty("company_id");
    expect(target).not.toHaveProperty("account_id");
  });
});

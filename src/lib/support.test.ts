import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createChannel: vi.fn(),
  createMessage: vi.fn(),
}));

vi.mock("@/lib/whop", () => ({
  whop: {
    supportChannels: { create: mocks.createChannel },
    messages: { create: mocks.createMessage },
  },
}));

import {
  createNativeSupportRequest,
  formatSupportMessage,
} from "@/lib/support";

afterEach(() => {
  mocks.createChannel.mockReset();
  mocks.createMessage.mockReset();
});

describe("native Whop support", () => {
  it("formats the submitted context without changing the customer message", () => {
    expect(
      formatSupportMessage({
        subject: "  Meeting link  ",
        message: "  I cannot find the link.  ",
        experienceId: "exp_example",
      }),
    ).toBe(
      "**Meeting link**\nExperience ID: exp_example\n\nI cannot find the link.",
    );
  });

  it("creates the company support channel before posting the message", async () => {
    mocks.createChannel.mockResolvedValue({ id: "support_123" });
    mocks.createMessage.mockResolvedValue({ id: "message_123" });

    const channel = await createNativeSupportRequest({
      companyId: "biz_example",
      userId: "user_example",
      experienceId: "exp_example",
      subject: "Booking question",
      message: "Can I move my session?",
    });

    expect(mocks.createChannel).toHaveBeenCalledWith({
      company_id: "biz_example",
      user_id: "user_example",
      custom_name: "Booking question",
    });
    expect(mocks.createMessage).toHaveBeenCalledWith({
      channel_id: "support_123",
      content:
        "**Booking question**\nExperience ID: exp_example\n\nCan I move my session?",
    });
    expect(mocks.createChannel.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createMessage.mock.invocationCallOrder[0],
    );
    expect(channel).toEqual({ id: "support_123" });
  });
});

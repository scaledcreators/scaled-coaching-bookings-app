import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { companyIdForExperience } from "@/lib/data";
import { createNativeSupportRequest } from "@/lib/support";

const schema = z.object({
  experienceId: z.string().startsWith("exp_"),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(5_000),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const viewer = await requireRequestViewer(request, input.experienceId);
    if (viewer.demo) {
      return Response.json({ channelId: "support_demo" }, { status: 201 });
    }

    const companyId = await companyIdForExperience(input.experienceId);
    const channel = await createNativeSupportRequest({
      companyId,
      userId: viewer.userId,
      experienceId: input.experienceId,
      subject: input.subject,
      message: input.message,
    });

    return Response.json({ channelId: channel.id }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not send your support message.",
      },
      { status: 400 },
    );
  }
}

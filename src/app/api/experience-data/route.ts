import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import {
  companyIdForExperience,
  getCompanyData,
  memberFacingCompanyData,
} from "@/lib/data";

export async function GET(request: Request) {
  try {
    const experienceId = z
      .string()
      .startsWith("exp_")
      .parse(new URL(request.url).searchParams.get("experienceId"));
    const viewer = await requireRequestViewer(request, experienceId);
    const companyId = await companyIdForExperience(experienceId);
    const data = memberFacingCompanyData(
      await getCompanyData(companyId),
      experienceId,
      viewer.userId,
    );
    return Response.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not refresh data.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

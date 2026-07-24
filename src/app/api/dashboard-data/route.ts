import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { getCompanyData } from "@/lib/data";

export async function GET(request: Request) {
  try {
    const companyId = z
      .string()
      .startsWith("biz_")
      .parse(new URL(request.url).searchParams.get("companyId"));
    await requireRequestViewer(request, companyId, true);
    const data = await getCompanyData(companyId);
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

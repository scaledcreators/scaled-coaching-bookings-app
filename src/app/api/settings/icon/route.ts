import { requireRequestViewer } from "@/lib/auth";
import {
  BRAND_ASSETS_BUCKET,
  ensureBrandAssetsBucket,
} from "@/lib/branding-storage";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const maxFileSize = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const companyId = form.get("companyId");
    const file = form.get("file");
    if (typeof companyId !== "string" || !companyId.startsWith("biz_"))
      throw new Error("A valid company is required.");
    if (!(file instanceof File)) throw new Error("Choose an image to upload.");
    const extension = allowedTypes.get(file.type);
    if (!extension) throw new Error("Use a PNG, JPG, WebP, or GIF image.");
    if (file.size > maxFileSize)
      throw new Error("The icon must be 5 MB or smaller.");
    await requireRequestViewer(request, companyId, true);

    const client = await ensureBrandAssetsBucket();
    const path = `${companyId}/icon-${Date.now()}.${extension}`;
    const { error } = await client.storage
      .from(BRAND_ASSETS_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
    if (error) throw error;
    const { data } = client.storage
      .from(BRAND_ASSETS_BUCKET)
      .getPublicUrl(path);
    return Response.json({ url: data.publicUrl });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not upload icon.",
      },
      { status: 400 },
    );
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_APPEARANCE, normalizeAppearance } from "@/lib/theme";
import type { BookingAppearance } from "@/lib/types";

const SETTINGS_BUCKET = "coaching-booking-settings";
export const BRAND_ASSETS_BUCKET = "coaching-booking-brand-assets";

async function ensureBucket(
  client: SupabaseClient,
  bucket: string,
  isPublic: boolean,
  allowedMimeTypes?: string[],
) {
  const { data } = await client.storage.getBucket(bucket);
  if (data) return;
  const { error } = await client.storage.createBucket(bucket, {
    public: isPublic,
    fileSizeLimit: 5 * 1024 * 1024,
    ...(allowedMimeTypes ? { allowedMimeTypes } : {}),
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

export async function readCompanyAppearance(
  companyId: string,
): Promise<BookingAppearance> {
  try {
    const client = getSupabaseAdmin();
    const { data, error } = await client.storage
      .from(SETTINGS_BUCKET)
      .download(`${companyId}/appearance.json`);
    if (error || !data) return DEFAULT_APPEARANCE;
    return normalizeAppearance(
      JSON.parse(await data.text()) as Partial<BookingAppearance>,
    );
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export async function saveCompanyAppearance(
  companyId: string,
  appearance: BookingAppearance,
) {
  const client = getSupabaseAdmin();
  await ensureBucket(client, SETTINGS_BUCKET, false, ["application/json"]);
  const normalized = normalizeAppearance(appearance);
  const payload = Buffer.from(JSON.stringify(normalized));
  const { error } = await client.storage
    .from(SETTINGS_BUCKET)
    .upload(`${companyId}/appearance.json`, payload, {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw error;
  return normalized;
}

export async function ensureBrandAssetsBucket() {
  const client = getSupabaseAdmin();
  await ensureBucket(client, BRAND_ASSETS_BUCKET, true, [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ]);
  return client;
}

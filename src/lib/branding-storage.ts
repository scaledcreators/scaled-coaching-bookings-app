import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_APPEARANCE, normalizeAppearance } from "@/lib/theme";
import type { BookingAppearance } from "@/lib/types";

const SETTINGS_BUCKET = "coaching-booking-settings";
export const BRAND_ASSETS_BUCKET = "coaching-booking-brand-assets";
const APPEARANCE_COLUMNS =
  "display_name,logo_url,theme_name,theme_primary,theme_accent,theme_highlight";

function appearanceColumnsMissing(
  error: { code?: string; message?: string } | null,
) {
  if (!error) return false;
  return (
    ["42703", "PGRST204"].includes(error.code ?? "") ||
    /display_name|logo_url|theme_name|theme_primary|theme_accent|theme_highlight/i.test(
      error.message ?? "",
    )
  );
}

function hasDatabaseAppearance(value: Partial<BookingAppearance> | null) {
  return Boolean(value?.display_name || value?.theme_name || value?.theme_primary);
}

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
    const { data: stored, error: settingsError } = await client
      .from("booking_settings")
      .select(APPEARANCE_COLUMNS)
      .eq("whop_company_id", companyId)
      .maybeSingle();
    if (
      !settingsError &&
      hasDatabaseAppearance(stored as Partial<BookingAppearance> | null)
    ) {
      return normalizeAppearance(stored as Partial<BookingAppearance>);
    }
    if (settingsError && !appearanceColumnsMissing(settingsError)) {
      throw settingsError;
    }

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
  const normalized = normalizeAppearance(appearance);
  let fileError: Error | null = null;
  try {
    await ensureBucket(client, SETTINGS_BUCKET, false, ["application/json"]);
    const payload = Buffer.from(JSON.stringify(normalized));
    const { error } = await client.storage
      .from(SETTINGS_BUCKET)
      .upload(`${companyId}/appearance.json`, payload, {
        cacheControl: "0",
        contentType: "application/json",
        upsert: true,
      });
    if (error) throw error;
  } catch (error) {
    fileError =
      error instanceof Error
        ? error
        : new Error("Could not save appearance.");
  }

  const { error: settingsError } = await client.from("booking_settings").upsert(
    {
      whop_company_id: companyId,
      ...normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "whop_company_id" },
  );
  if (settingsError && !appearanceColumnsMissing(settingsError)) {
    throw settingsError;
  }
  if (settingsError && fileError) throw fileError;
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

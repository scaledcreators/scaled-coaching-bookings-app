import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { saveCompanyAppearance } from "@/lib/branding-storage";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeAppearance, THEME_NAMES } from "@/lib/theme";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const schema = z.object({
  companyId: z.string().startsWith("biz_"),
  defaultTimezone: z.string().min(1).max(100),
  supportContact: z.union([z.string().email(), z.literal("")]),
  displayName: z.string().trim().min(1).max(60),
  logoUrl: z.union([
    z.string().url().startsWith("https://"),
    z.literal(""),
    z.null(),
  ]),
  themeName: z.enum(THEME_NAMES),
  themePrimary: color,
  themeAccent: color,
  themeHighlight: color,
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    await requireRequestViewer(request, input.companyId, true);

    const appearance = await saveCompanyAppearance(
      input.companyId,
      normalizeAppearance({
        display_name: input.displayName,
        logo_url: input.logoUrl || null,
        theme_name: input.themeName,
        theme_primary: input.themePrimary,
        theme_accent: input.themeAccent,
        theme_highlight: input.themeHighlight,
      }),
    );

    const { data, error } = await getSupabaseAdmin()
      .from("booking_settings")
      .upsert({
        whop_company_id: input.companyId,
        default_timezone: input.defaultTimezone,
        support_contact: input.supportContact || null,
        updated_at: new Date().toISOString(),
      })
      .select("emergency_paused,default_timezone,support_contact")
      .single();
    if (error) throw error;

    return Response.json({ settings: { ...data, ...appearance } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save settings.",
      },
      { status: 400 },
    );
  }
}

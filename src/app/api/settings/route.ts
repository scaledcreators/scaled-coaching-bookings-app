import { z } from "zod";
import { requireRequestViewer } from "@/lib/auth";
import { saveCompanyAppearance } from "@/lib/branding-storage";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeAppearance, THEME_NAMES } from "@/lib/theme";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const schema = z.object({
  companyId: z.string().startsWith("biz_"),
  defaultTimezone: z.string().min(1).max(100),
  supportContact: z.union([z.string().email(), z.literal("")]).optional(),
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
  serviceLabelSingular: z.string().trim().min(1).max(30),
  serviceLabelPlural: z.string().trim().min(1).max(30),
  adminBookingsLabel: z.string().trim().min(1).max(40),
  memberBookingsLabel: z.string().trim().min(1).max(40),
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

    const settingsUpdate: Record<string, string | null> = {
      whop_company_id: input.companyId,
      default_timezone: input.defaultTimezone,
      updated_at: new Date().toISOString(),
      service_label_singular: input.serviceLabelSingular,
      service_label_plural: input.serviceLabelPlural,
      admin_bookings_label: input.adminBookingsLabel,
      member_bookings_label: input.memberBookingsLabel,
    };
    if (input.supportContact !== undefined) {
      settingsUpdate.support_contact = input.supportContact || null;
    }

    const { data, error } = await getSupabaseAdmin()
      .from("booking_settings")
      .upsert(settingsUpdate)
      .select(
        "emergency_paused,default_timezone,default_daily_capacity,support_contact,service_label_singular,service_label_plural,admin_bookings_label,member_bookings_label",
      )
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

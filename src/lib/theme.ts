import type { CSSProperties } from "react";
import type {
  BookingAppearance,
  BookingSettings,
  ThemeName,
} from "@/lib/types";

export const THEME_PRESETS = [
  {
    name: "Orange",
    primary: "#ff4b18",
    accent: "#a84a32",
    highlight: "#ff7849",
  },
  { name: "Red", primary: "#ef233c", accent: "#7a1220", highlight: "#ff4760" },
  { name: "Blue", primary: "#2f6fed", accent: "#10306b", highlight: "#5ec8ff" },
  { name: "Pink", primary: "#ff2e88", accent: "#7a1a52", highlight: "#ff8fc7" },
  {
    name: "Violet",
    primary: "#8b5cf6",
    accent: "#3b1d72",
    highlight: "#c4a7ff",
  },
  { name: "Teal", primary: "#14b8a6", accent: "#0b4f4a", highlight: "#67e8d5" },
  {
    name: "Emerald",
    primary: "#22c55e",
    accent: "#14532d",
    highlight: "#86efac",
  },
  {
    name: "Indigo",
    primary: "#6366f1",
    accent: "#292a6b",
    highlight: "#a5b4fc",
  },
  {
    name: "Monochrome",
    primary: "#e7e5e4",
    accent: "#44403c",
    highlight: "#a8a29e",
  },
  {
    name: "Copper",
    primary: "#c96b3b",
    accent: "#5c2d22",
    highlight: "#e8a47a",
  },
] as const;

export const THEME_NAMES = [
  "Orange",
  "Red",
  "Blue",
  "Pink",
  "Violet",
  "Teal",
  "Emerald",
  "Indigo",
  "Monochrome",
  "Copper",
  "custom",
] as const;

export const DEFAULT_APPEARANCE: BookingAppearance = {
  display_name: "Coaching Bookings",
  logo_url: null,
  theme_name: "Orange",
  theme_primary: "#ff4b18",
  theme_accent: "#a84a32",
  theme_highlight: "#ff7849",
};

export function normalizeHexColor(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized
      .slice(1)
      .split("")
      .map((part) => `${part}${part}`)
      .join("")}`;
  }
  return fallback;
}

export function normalizeAppearance(
  value: Partial<BookingAppearance> | null | undefined,
): BookingAppearance {
  const displayName =
    typeof value?.display_name === "string"
      ? value.display_name.trim().slice(0, 60)
      : "";
  const themeName = THEME_NAMES.includes(value?.theme_name as ThemeName)
    ? (value?.theme_name as ThemeName)
    : DEFAULT_APPEARANCE.theme_name;
  return {
    display_name: displayName || DEFAULT_APPEARANCE.display_name,
    logo_url:
      typeof value?.logo_url === "string" &&
      value.logo_url.startsWith("https://")
        ? value.logo_url
        : null,
    theme_name: themeName,
    theme_primary: normalizeHexColor(
      value?.theme_primary,
      DEFAULT_APPEARANCE.theme_primary,
    ),
    theme_accent: normalizeHexColor(
      value?.theme_accent,
      DEFAULT_APPEARANCE.theme_accent,
    ),
    theme_highlight: normalizeHexColor(
      value?.theme_highlight,
      DEFAULT_APPEARANCE.theme_highlight,
    ),
  };
}

function readableInk(hex: string) {
  const normalized = normalizeHexColor(
    hex,
    DEFAULT_APPEARANCE.theme_primary,
  ).slice(1);
  const [red, green, blue] = [0, 2, 4].map((offset) =>
    Number.parseInt(normalized.slice(offset, offset + 2), 16),
  );
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? "#111113" : "#ffffff";
}

export function themeStyle(
  settings: Pick<
    BookingSettings,
    "theme_primary" | "theme_accent" | "theme_highlight"
  >,
): CSSProperties {
  return {
    "--sc-primary": settings.theme_primary,
    "--sc-accent": settings.theme_accent,
    "--sc-orange": settings.theme_highlight,
    "--brand-gradient": `linear-gradient(110deg,${settings.theme_primary},${settings.theme_highlight})`,
    "--brand-soft": `color-mix(in srgb,${settings.theme_primary} 9%,transparent)`,
    "--brand-soft-strong": `color-mix(in srgb,${settings.theme_primary} 15%,transparent)`,
    "--brand-border": `color-mix(in srgb,${settings.theme_primary} 24%,transparent)`,
    "--brand-border-strong": `color-mix(in srgb,${settings.theme_primary} 45%,transparent)`,
    "--brand-glow": `color-mix(in srgb,${settings.theme_primary} 22%,transparent)`,
    "--brand-ink": readableInk(settings.theme_primary),
  } as CSSProperties;
}

"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { themeStyle } from "@/lib/theme";
import type { BookingSettings } from "@/lib/types";

type TenantThemeContextValue = {
  settings: BookingSettings;
  updatePreview: (changes: Partial<BookingSettings>) => void;
  replaceSettings: (settings: BookingSettings) => void;
};

const TenantThemeContext = createContext<TenantThemeContextValue | null>(null);

export function TenantThemeProvider({
  initialSettings,
  children,
}: {
  initialSettings: BookingSettings;
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const value = useMemo<TenantThemeContextValue>(
    () => ({
      settings,
      updatePreview: (changes) =>
        setSettings((current) => ({ ...current, ...changes })),
      replaceSettings: setSettings,
    }),
    [settings],
  );

  return (
    <TenantThemeContext.Provider value={value}>
      <div className="tenant-theme-root" style={themeStyle(settings)}>
        {children}
      </div>
    </TenantThemeContext.Provider>
  );
}

export function useTenantTheme() {
  const value = useContext(TenantThemeContext);
  if (!value)
    throw new Error("useTenantTheme must be used inside TenantThemeProvider");
  return value;
}

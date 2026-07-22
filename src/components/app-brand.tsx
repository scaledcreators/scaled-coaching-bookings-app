"use client";

import { useTenantTheme } from "@/components/tenant-theme-provider";

export function AppBrand({
  variant = "admin",
}: {
  variant?: "admin" | "member";
}) {
  const { settings } = useTenantTheme();
  const initial = settings.display_name.trim().charAt(0).toUpperCase() || "C";
  return (
    <div className={`app-brand app-brand-${variant}`}>
      {settings.logo_url ? (
        <span
          className="app-brand-icon"
          role="img"
          aria-label={`${settings.display_name} icon`}
          style={{ backgroundImage: `url(${settings.logo_url})` }}
        />
      ) : (
        <span className="brand-mark" aria-hidden="true">
          {initial}
        </span>
      )}
      <div className="app-brand-copy">
        <strong>{settings.display_name}</strong>
        <small>Created by &ldquo;Scaled Creators&rdquo;</small>
      </div>
    </div>
  );
}

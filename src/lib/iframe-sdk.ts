"use client";

import { createSdk } from "@whop/iframe";

let sdk: ReturnType<typeof createSdk> | null = null;

export function getIframeSdk() {
  if (!sdk) {
    sdk = createSdk({ appId: process.env.NEXT_PUBLIC_WHOP_APP_ID });
  }
  return sdk;
}

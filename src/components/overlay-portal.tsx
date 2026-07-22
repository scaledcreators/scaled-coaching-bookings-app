"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function OverlayPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return typeof document === "undefined"
    ? null
    : createPortal(children, document.body);
}

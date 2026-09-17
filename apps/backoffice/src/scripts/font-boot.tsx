"use client";

/**
 * Nạp font preference từ cookie (ThemeBoot đã set `data-font`) trước paint ổn định.
 * `useLayoutEffect` — chạy sau DOM commit, trước paint browser tiếp theo — giảm flash
 * Inter → font đã chọn. Always-on (inter / geistMono) là no-op.
 */
import { useLayoutEffect } from "react";

import { ensureFontLoaded } from "@/lib/fonts/ensure-font-loaded";
import { FONT_KEYS, type FontKey } from "@/lib/fonts/registry";

function isFontKey(value: string | null): value is FontKey {
  return value !== null && (FONT_KEYS as string[]).includes(value);
}

export function FontBoot() {
  useLayoutEffect(() => {
    const raw = document.documentElement.getAttribute("data-font");
    if (isFontKey(raw)) {
      void ensureFontLoaded(raw);
    }
  }, []);

  return null;
}

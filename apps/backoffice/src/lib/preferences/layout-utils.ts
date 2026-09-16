import type { FontKey } from "@/lib/fonts/registry";

export function applyContentLayout(value: "centered" | "full-width") {
  const root = document.documentElement;
  root.setAttribute("data-content-layout", value);
}

export function applyNavbarStyle(value: "sticky" | "scroll") {
  const root = document.documentElement;
  root.setAttribute("data-navbar-style", value);
}

export function applySidebarVariant(value: string) {
  const root = document.documentElement;
  root.setAttribute("data-sidebar-variant", value);
}

export function applySidebarCollapsible(value: string) {
  const root = document.documentElement;
  root.setAttribute("data-sidebar-collapsible", value);
}

/**
 * Đổi `data-font` sau khi CSS variable của family đã có trên `<body>`.
 * Font lazy (không phải Inter / Geist Mono) phải `await ensureFontLoaded` trước —
 * nếu set attribute sớm, `--font-sans: var(--font-…)` trỏ biến chưa định nghĩa.
 */
export async function applyFont(value: FontKey) {
  const { ensureFontLoaded } = await import("@/lib/fonts/ensure-font-loaded");
  await ensureFontLoaded(value);
  document.documentElement.setAttribute("data-font", value);
}

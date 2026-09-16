/**
 * Font preference registry — metadata only.
 *
 * Critical path chỉ nạp Inter (sans mặc định) + Geist Mono (`--font-mono`).
 * Các font UI khác lazy qua `ensureFontLoaded` khi user chọn / cookie khác default.
 * Trước đây `fontVars` gắn cả 12 `next/font` → Lighthouse critical path kéo mọi woff2.
 */

import { geistMono } from "./families/geist-mono";
import { inter } from "./families/inter";

/** Nhãn + CSS variable name — KHÔNG import `next/font` ở đây (trừ always-on bên dưới). */
export const FONT_META = {
  inter: { label: "Inter", cssVar: "--font-inter" },
  roboto: { label: "Roboto", cssVar: "--font-roboto" },
  poppins: { label: "Poppins", cssVar: "--font-poppins" },
  geist: { label: "Geist", cssVar: "--font-geist" },
  geistMono: { label: "Geist Mono", cssVar: "--font-geist-mono" },
  jakarta: { label: "Plus Jakarta Sans", cssVar: "--font-jakarta" },
  nunito: { label: "Nunito", cssVar: "--font-nunito" },
  gabriela: { label: "Gabriela", cssVar: "--font-gabriela" },
  outfit: { label: "Outfit", cssVar: "--font-outfit" },
  manrope: { label: "Manrope", cssVar: "--font-manrope" },
  dmSans: { label: "DM Sans", cssVar: "--font-dm-sans" },
  greatVibes: { label: "Great Vibes", cssVar: "--font-great-vibes" },
} as const;

export type FontKey = keyof typeof FONT_META;

export const FONT_KEYS = Object.keys(FONT_META) as FontKey[];

/**
 * Class CSS variable luôn gắn `<body>`: Inter + Geist Mono.
 * Không gồm các family lazy — tránh preload/link mọi Google Font trên cold load.
 */
export const fontVars = `${inter.variable} ${geistMono.variable}`;

/** Font đã có class trên body từ SSR — `ensureFontLoaded` no-op. */
export const ALWAYS_LOADED_FONT_KEYS = new Set<FontKey>(["inter", "geistMono"]);

export const fontOptions = (Object.entries(FONT_META) as Array<[FontKey, (typeof FONT_META)[FontKey]]>).map(
  ([key, meta]) => ({
    key,
    label: meta.label,
    variable: meta.cssVar,
  }),
);

"use client";

/**
 * Lazy-load `next/font` family chưa có trên `<body>`.
 *
 * Mỗi family nằm file riêng — dynamic `import()` chỉ kéo woff2/CSS của font được chọn.
 * Gắn `font.variable` lên `document.body` để `html[data-font=…]` map `--font-sans` hoạt động.
 */
import { ALWAYS_LOADED_FONT_KEYS, type FontKey } from "./registry";

type FontModule = { variable: string };

const loaders: Record<FontKey, () => Promise<FontModule>> = {
  inter: () => import("./families/inter").then((m) => m.inter),
  roboto: () => import("./families/roboto").then((m) => m.roboto),
  poppins: () => import("./families/poppins").then((m) => m.poppins),
  geist: () => import("./families/geist").then((m) => m.geist),
  geistMono: () => import("./families/geist-mono").then((m) => m.geistMono),
  jakarta: () => import("./families/jakarta").then((m) => m.jakarta),
  nunito: () => import("./families/nunito").then((m) => m.nunito),
  gabriela: () => import("./families/gabriela").then((m) => m.gabriela),
  outfit: () => import("./families/outfit").then((m) => m.outfit),
  manrope: () => import("./families/manrope").then((m) => m.manrope),
  dmSans: () => import("./families/dm-sans").then((m) => m.dmSans),
  greatVibes: () => import("./families/great-vibes").then((m) => m.greatVibes),
};

/** Keys đã gắn class lên body (SSR always-on + lazy đã load trong session). */
const loadedKeys = new Set<FontKey>(ALWAYS_LOADED_FONT_KEYS);

/** In-flight dedupe — đổi font nhanh không import trùng. */
const inflight = new Map<FontKey, Promise<void>>();

/**
 * Đảm bảo CSS variable của `key` có trên `document.body`.
 * No-op nếu đã always-on hoặc đã load trong tab này.
 */
export function ensureFontLoaded(key: FontKey): Promise<void> {
  if (loadedKeys.has(key)) {
    return Promise.resolve();
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const task = loaders[key]()
    .then((font) => {
      if (typeof document !== "undefined" && font.variable) {
        document.body.classList.add(font.variable);
      }
      loadedKeys.add(key);
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
}

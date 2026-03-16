import { GameProduct } from "@megawin/game-core/entities/game-core.enums";

/**
 * Brand color token cho từng game — single source of truth.
 *
 * Dùng ở mọi nơi trong backoffice:
 * - `hex`          → Recharts / inline style (fill, stroke)
 * - `twBg`         → Tailwind `bg-game-*` (icon backgrounds, badges)
 * - `twText`       → Tailwind `text-game-*` (labels, amounts)
 * - `twBorder`     → Tailwind `border-game-*` (card borders, dividers)
 * - `twBgMuted`    → Tailwind `bg-game-*-muted` (card gradients, surfaces)
 * - `gradientFrom` → gradient start class (Tailwind)
 * - `gradientTo`   → gradient end class (Tailwind)
 *
 * CSS variables `--game-*` được định nghĩa trong globals.css và map vào
 * Tailwind `@theme inline` — thay đổi 1 nơi là cập nhật toàn bộ app.
 */
export interface GameColorTokens {
  /** Hex color dùng cho Recharts fill/stroke và inline style */
  hex: string;
  /** Tailwind class: background brand color, e.g. `bg-game-mega645` */
  twBg: string;
  /** Tailwind class: text brand color, e.g. `text-game-mega645` */
  twText: string;
  /** Tailwind class: border brand color, e.g. `border-game-mega645` */
  twBorder: string;
  /** Tailwind class: muted surface background, e.g. `bg-game-mega645-muted` */
  twBgMuted: string;
  /** Gradient start class cho card backgrounds */
  gradientFrom: string;
  /** Gradient via class cho card backgrounds */
  gradientVia: string;
  /** Gradient end class cho card backgrounds */
  gradientTo: string;
  /** Dark mode gradient start */
  gradientFromDark: string;
  /** Dark mode gradient via */
  gradientViaDark: string;
  /** Dark mode gradient end */
  gradientToDark: string;
}

/**
 * Brand color tokens cho 7 games trong hệ thống.
 *
 * Keys là GameProduct enum values để có type-safety khi lookup.
 * Fallback: dùng `getGameColors(gameProduct)` để lấy với graceful default.
 */
export const GAME_COLORS: Record<GameProduct, GameColorTokens> = {
  // ── Mega 6/45 — Teal/Emerald ─────────────────────────────────────────────
  [GameProduct.Mega645]: {
    hex: "#14b8a6",
    twBg: "bg-game-mega645",
    twText: "text-game-mega645",
    twBorder: "border-game-mega645",
    twBgMuted: "bg-game-mega645-muted",
    gradientFrom: "from-teal-50/90",
    gradientVia: "via-cyan-50/70",
    gradientTo: "to-emerald-50/50",
    gradientFromDark: "dark:from-teal-950/50",
    gradientViaDark: "dark:via-cyan-950/40",
    gradientToDark: "dark:to-emerald-950/30",
  },

  // ── Power 6/55 — Red/Orange ───────────────────────────────────────────────
  [GameProduct.Power655]: {
    hex: "#ef4444",
    twBg: "bg-game-power655",
    twText: "text-game-power655",
    twBorder: "border-game-power655",
    twBgMuted: "bg-game-power655-muted",
    gradientFrom: "from-red-50/90",
    gradientVia: "via-orange-50/70",
    gradientTo: "to-amber-50/50",
    gradientFromDark: "dark:from-red-950/50",
    gradientViaDark: "dark:via-orange-950/40",
    gradientToDark: "dark:to-amber-950/30",
  },

  // ── Lotto 5/35 — Amber/Orange ────────────────────────────────────────────
  [GameProduct.Lotto535]: {
    hex: "#f59e0b",
    twBg: "bg-game-lotto535",
    twText: "text-game-lotto535",
    twBorder: "border-game-lotto535",
    twBgMuted: "bg-game-lotto535-muted",
    gradientFrom: "from-amber-50/90",
    gradientVia: "via-yellow-50/70",
    gradientTo: "to-orange-50/50",
    gradientFromDark: "dark:from-amber-950/50",
    gradientViaDark: "dark:via-yellow-950/40",
    gradientToDark: "dark:to-orange-950/30",
  },

  // ── Keno — Blue ──────────────────────────────────────────────────────────
  [GameProduct.Keno]: {
    hex: "#3b82f6",
    twBg: "bg-game-keno",
    twText: "text-game-keno",
    twBorder: "border-game-keno",
    twBgMuted: "bg-game-keno-muted",
    gradientFrom: "from-blue-50/90",
    gradientVia: "via-sky-50/70",
    gradientTo: "to-indigo-50/50",
    gradientFromDark: "dark:from-blue-950/50",
    gradientViaDark: "dark:via-sky-950/40",
    gradientToDark: "dark:to-indigo-950/30",
  },

  // ── Max3D — Violet ────────────────────────────────────────────────────────
  [GameProduct.Max3d]: {
    hex: "#8b5cf6",
    twBg: "bg-game-max3d",
    twText: "text-game-max3d",
    twBorder: "border-game-max3d",
    twBgMuted: "bg-game-max3d-muted",
    gradientFrom: "from-violet-50/90",
    gradientVia: "via-purple-50/70",
    gradientTo: "to-indigo-50/50",
    gradientFromDark: "dark:from-violet-950/50",
    gradientViaDark: "dark:via-purple-950/40",
    gradientToDark: "dark:to-indigo-950/30",
  },

  // ── Max3D Pro — Pink ──────────────────────────────────────────────────────
  [GameProduct.Max3dpro]: {
    hex: "#ec4899",
    twBg: "bg-game-max3dpro",
    twText: "text-game-max3dpro",
    twBorder: "border-game-max3dpro",
    twBgMuted: "bg-game-max3dpro-muted",
    gradientFrom: "from-pink-50/90",
    gradientVia: "via-rose-50/70",
    gradientTo: "to-fuchsia-50/50",
    gradientFromDark: "dark:from-pink-950/50",
    gradientViaDark: "dark:via-rose-950/40",
    gradientToDark: "dark:to-fuchsia-950/30",
  },

  // ── Bingo 18 — Emerald ────────────────────────────────────────────────────
  [GameProduct.Bingo18]: {
    hex: "#10b981",
    twBg: "bg-game-bingo18",
    twText: "text-game-bingo18",
    twBorder: "border-game-bingo18",
    twBgMuted: "bg-game-bingo18-muted",
    gradientFrom: "from-emerald-50/90",
    gradientVia: "via-green-50/70",
    gradientTo: "to-teal-50/50",
    gradientFromDark: "dark:from-emerald-950/50",
    gradientViaDark: "dark:via-green-950/40",
    gradientToDark: "dark:to-teal-950/30",
  },
};

const DEFAULT_COLORS: GameColorTokens = {
  hex: "#6b7280",
  twBg: "bg-muted",
  twText: "text-muted-foreground",
  twBorder: "border-border",
  twBgMuted: "bg-muted",
  gradientFrom: "from-gray-50/90",
  gradientVia: "via-gray-50/70",
  gradientTo: "to-slate-50/50",
  gradientFromDark: "dark:from-gray-950/50",
  gradientViaDark: "dark:via-gray-950/40",
  gradientToDark: "dark:to-slate-950/30",
};

/**
 * Lấy brand color tokens cho game.
 *
 * Trả về default gray tokens nếu gameProduct không được nhận diện.
 * An toàn khi dùng với dynamic game product IDs từ API.
 */
export function getGameColors(gameProduct: string): GameColorTokens {
  return GAME_COLORS[gameProduct as GameProduct] ?? DEFAULT_COLORS;
}

/**
 * Lấy hex color cho game — dùng cho Recharts fill/stroke.
 *
 * Shorthand của `getGameColors(gameProduct).hex`.
 */
export function getGameHex(gameProduct: string): string {
  return getGameColors(gameProduct).hex;
}

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
  /**
   * Tailwind gradient classes cho icon tròn ở page header.
   *
   * Dùng với: `className={\`bg-linear-to-br \${c.iconGradient}\`}`
   * Đồng nhất trên tất cả pages của cùng 1 game.
   * Ví dụ: `"from-teal-500 to-teal-600"`
   */
  iconGradient: string;
}

/**
 * Brand color tokens cho 7 games trong hệ thống.
 *
 * Keys là GameProduct enum values để có type-safety khi lookup.
 * Fallback: dùng `getGameColors(gameProduct)` để lấy với graceful default.
 *
 * Màu được đồng nhất từ trang jackpot (nguồn đáng tin cậy nhất — được thiết kế có chủ đích):
 * - Mega645:  teal      (#0d9488) — teal-600, khớp jackpot teal-400→emerald-500
 * - Power655: red       (#ef4444) — red-500, khớp jackpot red-500→orange-500
 * - Lotto535: amber     (#d97706) — amber-600, khớp jackpot amber-400→orange-500
 * - Keno:     orange    (#ea580c) — orange-600, khớp operations orange-500→orange-600
 * - Max3D:    violet    (#7c3aed) — violet-600, phân biệt rõ với Max3DPro
 * - Max3DPro: pink      (#db2777) — pink-600, phân biệt rõ với Max3D
 * - Bingo18:  lime/green (#16a34a) — green-600, phân biệt rõ với Mega645 (teal)
 */
export const GAME_COLORS: Record<GameProduct, GameColorTokens> = {
  // ── Mega 6/45 — Teal ─────────────────────────────────────────────────────
  // Jackpot page: from-teal-400 to-emerald-500, overview: teal-400→emerald-500
  [GameProduct.Mega645]: {
    hex: "#0d9488",
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
    iconGradient: "from-teal-500 to-teal-600",
  },

  // ── Power 6/55 — Red/Orange ───────────────────────────────────────────────
  // Jackpot page: from-red-500 to-orange-500, overview: red-500→orange-500
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
    iconGradient: "from-red-500 to-orange-500",
  },

  // ── Lotto 5/35 — Amber/Orange ────────────────────────────────────────────
  // Jackpot page: from-amber-400 to-orange-500, overview: amber-400→orange-500
  [GameProduct.Lotto535]: {
    hex: "#d97706",
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
    iconGradient: "from-amber-400 to-orange-500",
  },

  // ── Keno — Orange ────────────────────────────────────────────────────────
  // Operations: from-orange-500 to-orange-600 (nhất quán qua tất cả pages)
  [GameProduct.Keno]: {
    hex: "#ea580c",
    twBg: "bg-game-keno",
    twText: "text-game-keno",
    twBorder: "border-game-keno",
    twBgMuted: "bg-game-keno-muted",
    gradientFrom: "from-orange-50/90",
    gradientVia: "via-amber-50/70",
    gradientTo: "to-yellow-50/50",
    gradientFromDark: "dark:from-orange-950/50",
    gradientViaDark: "dark:via-amber-950/40",
    gradientToDark: "dark:to-yellow-950/30",
    iconGradient: "from-orange-500 to-orange-600",
  },

  // ── Max3D — Violet ────────────────────────────────────────────────────────
  // Màu violet để phân biệt rõ với Power655 (red) và Max3DPro (pink)
  [GameProduct.Max3d]: {
    hex: "#7c3aed",
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
    iconGradient: "from-violet-500 to-violet-600",
  },

  // ── Max3D Pro — Pink ──────────────────────────────────────────────────────
  // Màu pink để phân biệt rõ với Max3D (violet)
  [GameProduct.Max3dpro]: {
    hex: "#db2777",
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
    iconGradient: "from-pink-500 to-pink-600",
  },

  // ── Bingo 18 — Green ─────────────────────────────────────────────────────
  // Green-600 (#16a34a) để phân biệt rõ với Mega645 (teal #0d9488)
  // Operations & config đều dùng amber-orange — nhưng trùng Lotto535/Keno.
  // Dùng green tươi để có bảng màu 7 game riêng biệt hoàn toàn.
  [GameProduct.Bingo18]: {
    hex: "#16a34a",
    twBg: "bg-game-bingo18",
    twText: "text-game-bingo18",
    twBorder: "border-game-bingo18",
    twBgMuted: "bg-game-bingo18-muted",
    gradientFrom: "from-green-50/90",
    gradientVia: "via-emerald-50/70",
    gradientTo: "to-teal-50/50",
    gradientFromDark: "dark:from-green-950/50",
    gradientViaDark: "dark:via-emerald-950/40",
    gradientToDark: "dark:to-teal-950/30",
    iconGradient: "from-green-500 to-green-600",
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
  iconGradient: "from-gray-400 to-gray-500",
};

/**
 * Gradient cho icon header của các trang hệ thống (non-game).
 *
 * Đồng bộ với màu `--primary` (indigo) trong globals.css.
 * Dùng cho: Tenants, Accounts, Reports, Me/Profile, Settings...
 *
 * @example
 * ```tsx
 * <div className={`bg-linear-to-br ${SYSTEM_ICON_GRADIENT}`}>
 * ```
 */
export const SYSTEM_ICON_GRADIENT = "from-indigo-500 to-indigo-600";

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

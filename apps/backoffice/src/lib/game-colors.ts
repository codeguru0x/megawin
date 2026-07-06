import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { alphaLabelToNumber } from "@megawin/shared/utils";

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
 * Màu được chọn để tối đa hoá sự phân biệt trên chart/bar — đặc biệt khi
 * hiển thị stacked bar nhỏ, các màu lân cận phải tách rõ ràng:
 * - Mega645:  teal      (#0d9488) — teal-600
 * - Power655: red       (#dc2626) — red-600 (đậm hơn red-500 để tách khỏi pink)
 * - Lotto535: amber     (#d97706) — amber-600
 * - Keno:     sky/cyan  (#0284c7) — sky-700 (tách xa khỏi amber/orange của Lotto535)
 * - Max3D:    violet    (#7c3aed) — violet-600
 * - Max3DPro: fuchsia   (#c026d3) — fuchsia-600 (tách rõ khỏi red Power655)
 * - Bingo18:  lime      (#65a30d) — lime-600 (tách rõ khỏi teal Mega645)
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
  // Hex: red-600 (#dc2626) đậm hơn red-500 để tách rõ khỏi pink Max3DPro trên bar
  [GameProduct.Power655]: {
    hex: "#dc2626",
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

  // ── Keno — Sky/Cyan ─────────────────────────────────────────────────────
  // Chuyển từ orange → sky-700 (#0284c7) để tách xa khỏi amber của Lotto535.
  // Trên stacked bar, orange Keno và amber Lotto535 gần như không phân biệt được.
  [GameProduct.Keno]: {
    hex: "#0284c7",
    twBg: "bg-game-keno",
    twText: "text-game-keno",
    twBorder: "border-game-keno",
    twBgMuted: "bg-game-keno-muted",
    gradientFrom: "from-sky-50/90",
    gradientVia: "via-cyan-50/70",
    gradientTo: "to-blue-50/50",
    gradientFromDark: "dark:from-sky-950/50",
    gradientViaDark: "dark:via-cyan-950/40",
    gradientToDark: "dark:to-blue-950/30",
    iconGradient: "from-sky-500 to-sky-600",
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

  // ── Max3D Pro — Fuchsia ──────────────────────────────────────────────────
  // Chuyển từ pink-600 (#db2777) → fuchsia-600 (#c026d3) để tách rõ khỏi red Power655.
  // Pink gần red quá trên stacked bar nhỏ → fuchsia (tím hồng) tách xa hơn.
  [GameProduct.Max3dpro]: {
    hex: "#c026d3",
    twBg: "bg-game-max3dpro",
    twText: "text-game-max3dpro",
    twBorder: "border-game-max3dpro",
    twBgMuted: "bg-game-max3dpro-muted",
    gradientFrom: "from-fuchsia-50/90",
    gradientVia: "via-purple-50/70",
    gradientTo: "to-pink-50/50",
    gradientFromDark: "dark:from-fuchsia-950/50",
    gradientViaDark: "dark:via-purple-950/40",
    gradientToDark: "dark:to-pink-950/30",
    iconGradient: "from-fuchsia-500 to-fuchsia-600",
  },

  // ── Bingo 18 — Lime ──────────────────────────────────────────────────────
  // Lime-600 (#65a30d) tách rõ khỏi Mega645 (teal) — green-600 quá gần teal.
  [GameProduct.Bingo18]: {
    hex: "#65a30d",
    twBg: "bg-game-bingo18",
    twText: "text-game-bingo18",
    twBorder: "border-game-bingo18",
    twBgMuted: "bg-game-bingo18-muted",
    gradientFrom: "from-lime-50/90",
    gradientVia: "via-green-50/70",
    gradientTo: "to-emerald-50/50",
    gradientFromDark: "dark:from-lime-950/50",
    gradientViaDark: "dark:via-green-950/40",
    gradientToDark: "dark:to-emerald-950/30",
    iconGradient: "from-lime-500 to-lime-600",
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
 * Dùng `--color-primary` từ theme → tự động đổi theo theme preset.
 * Dùng cho: Tenants, Accounts, Reports, Me/Profile, Settings...
 *
 * @example
 * ```tsx
 * <div className={`bg-linear-to-br ${SYSTEM_ICON_GRADIENT}`}>
 * ```
 */
export const SYSTEM_ICON_GRADIENT = "from-primary/70 to-primary";

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

/**
 * 6 CSS variables màu board (`--board-a`..`--board-f`) định nghĩa trong globals.css,
 * có sẵn light + dark mode. Dùng làm palette cho board indicator (border-left/badge/dot).
 */
const BOARD_COLOR_VARS = [
  "var(--board-a)",
  "var(--board-b)",
  "var(--board-c)",
  "var(--board-d)",
  "var(--board-e)",
  "var(--board-f)",
] as const;

/**
 * Màu ổn định cho 1 boardNo bất kỳ — hỗ trợ số board động (A, B, ... Z, AA, AB...).
 *
 * Map boardNo theo thứ tự chữ cái (`alphaLabelToNumber`) rồi tuần hoàn qua 6 màu
 * palette → board thứ 7 ("G") lại dùng màu của "A". Deterministic: cùng boardNo
 * luôn ra cùng màu. An toàn với boardNo không hợp lệ (fallback màu đầu tiên).
 *
 * @param boardNo Ký hiệu board (A, B, ... AA...).
 * @returns Chuỗi `var(--board-*)` dùng cho inline style / border color.
 */
export function boardColorVar(boardNo: string): string {
  let index: number;
  try {
    index = (alphaLabelToNumber(boardNo) - 1) % BOARD_COLOR_VARS.length;
  } catch {
    index = 0; // fallback cho boardNo không hợp lệ
  }
  return BOARD_COLOR_VARS[index] ?? BOARD_COLOR_VARS[0];
}

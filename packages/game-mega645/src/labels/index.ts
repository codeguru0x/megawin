/**
 * Mega 6/45 – Display Labels
 *
 * Tên hiển thị cho các kiểu chơi, hạng giải, v.v. của Mega 6/45.
 * Dùng trong tất cả UI components (analytics, tickets, reports, ...).
 *
 * Import: `import { MEGA645_PLAY_TYPE_LABELS, ... } from "@megawin/game-mega645/labels"`
 */

import { PlayType, PrizeTier } from "../entities/enums";

// ─────────────────────────────────────────────
// Play Type Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị đầy đủ cho mỗi kiểu chơi Mega 6/45.
 * Dùng trong analytics, live-feed, dropdown filter.
 */
export const MEGA645_PLAY_TYPE_LABELS: Record<PlayType, string> = {
  [PlayType.Standard]: "Chuẩn",
  [PlayType.Bao5]: "Bao 5",
  [PlayType.Bao7]: "Bao 7",
  [PlayType.Bao8]: "Bao 8",
  [PlayType.Bao9]: "Bao 9",
  [PlayType.Bao10]: "Bao 10",
  [PlayType.Bao11]: "Bao 11",
  [PlayType.Bao12]: "Bao 12",
  [PlayType.Bao13]: "Bao 13",
  [PlayType.Bao14]: "Bao 14",
  [PlayType.Bao15]: "Bao 15",
  [PlayType.Bao18]: "Bao 18",
  [PlayType.QuickPick]: "Chọn nhanh",
} as const;

/**
 * Lấy tên hiển thị kiểu chơi Mega 6/45.
 *
 * @param playType - PlayType value
 */
export function getMega645PlayTypeLabel(playType: PlayType): string {
  return MEGA645_PLAY_TYPE_LABELS[playType] ?? playType;
}

// ─────────────────────────────────────────────
// Prize Tier Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị hạng giải thưởng Mega 6/45.
 * 4 hạng: Đặc Biệt (Jackpot) → Nhất → Nhì → Ba.
 */
export const MEGA645_PRIZE_TIER_LABELS: Record<PrizeTier, string> = {
  [PrizeTier.Jackpot]: "Giải Đặc Biệt",
  [PrizeTier.Tier1]: "Giải Nhất",
  [PrizeTier.Tier2]: "Giải Nhì",
  [PrizeTier.Tier3]: "Giải Ba",
} as const;

/**
 * Lấy tên hiển thị hạng giải thưởng Mega 6/45.
 *
 * @param tier - PrizeTier value
 */
export function getMega645PrizeTierLabel(tier: PrizeTier): string {
  return MEGA645_PRIZE_TIER_LABELS[tier] ?? tier;
}

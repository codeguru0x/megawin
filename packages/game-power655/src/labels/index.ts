/**
 * Power 6/55 – Display Labels
 *
 * Tên hiển thị cho các kiểu chơi, hạng giải, v.v. của Power 6/55.
 * Dùng trong tất cả UI components (analytics, tickets, reports, ...).
 *
 * Import: `import { POWER655_PLAY_TYPE_LABELS, ... } from "@megawin/game-power655/labels"`
 */

import { PlayType, PrizeTier } from "../entities/enums";

// ─────────────────────────────────────────────
// Play Type Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị đầy đủ cho mỗi kiểu chơi Power 6/55.
 * Dùng trong analytics, live-feed, dropdown filter.
 */
export const POWER655_PLAY_TYPE_LABELS: Record<PlayType, string> = {
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
 * Lấy tên hiển thị kiểu chơi Power 6/55.
 *
 * @param playType - PlayType value
 */
export function getPower655PlayTypeLabel(playType: PlayType): string {
  return POWER655_PLAY_TYPE_LABELS[playType] ?? playType;
}

// ─────────────────────────────────────────────
// Prize Tier Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị hạng giải thưởng Power 6/55.
 * 5 hạng: Jackpot 1 → Jackpot 2 → Nhất → Nhì → Ba.
 */
export const POWER655_PRIZE_TIER_LABELS: Record<PrizeTier, string> = {
  [PrizeTier.Jackpot1]: "Jackpot 1",
  [PrizeTier.Jackpot2]: "Jackpot 2",
  [PrizeTier.Tier1]: "Giải Nhất",
  [PrizeTier.Tier2]: "Giải Nhì",
  [PrizeTier.Tier3]: "Giải Ba",
} as const;

/**
 * Lấy tên hiển thị hạng giải thưởng Power 6/55.
 *
 * @param tier - PrizeTier value
 */
export function getPower655PrizeTierLabel(tier: PrizeTier): string {
  return POWER655_PRIZE_TIER_LABELS[tier] ?? tier;
}

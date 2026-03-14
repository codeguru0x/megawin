/**
 * Lotto 5/35 – Display Labels
 *
 * Tên hiển thị cho các kiểu chơi, hạng giải, v.v. của Lotto 5/35.
 * Dùng trong tất cả UI components (analytics, tickets, reports, ...).
 *
 * Import: `import { LOTTO535_PLAY_TYPE_LABELS, ... } from "@megawin/game-lotto535/labels"`
 */

import { PlayType, PrizeTier } from "../entities/enums";

// ─────────────────────────────────────────────
// Play Type Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị đầy đủ cho mỗi kiểu chơi Lotto 5/35.
 * Dùng trong analytics, live-feed, dropdown filter.
 */
export const LOTTO535_PLAY_TYPE_LABELS: Record<PlayType, string> = {
  [PlayType.Standard]: "Chuẩn",
  [PlayType.MainCover4]: "Bao 4",
  [PlayType.MainCover]: "Bao số chính",
  [PlayType.SpecialCover]: "Bao số ĐB",
  [PlayType.QuickPick]: "Chọn nhanh",
} as const;

/**
 * Tên hiển thị ngắn gọn (dùng cho heatmap, badge, chip UI).
 * Khác `LOTTO535_PLAY_TYPE_LABELS` ở chỗ ngắn hơn khi cần.
 */
export const LOTTO535_PLAY_TYPE_LABELS_SHORT: Record<PlayType, string> = {
  [PlayType.Standard]: "Chuẩn",
  [PlayType.MainCover4]: "Bao 4",
  [PlayType.MainCover]: "Bao chính",
  [PlayType.SpecialCover]: "Bao ĐB",
  [PlayType.QuickPick]: "Chọn nhanh",
} as const;

/**
 * Lấy tên hiển thị kiểu chơi Lotto 5/35.
 *
 * @param playType - PlayType value
 * @param short - Dùng label ngắn (mặc định: false)
 */
export function getLotto535PlayTypeLabel(playType: PlayType, short = false): string {
  const map = short ? LOTTO535_PLAY_TYPE_LABELS_SHORT : LOTTO535_PLAY_TYPE_LABELS;
  return map[playType] ?? playType;
}

// ─────────────────────────────────────────────
// Prize Tier Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị hạng giải thưởng Lotto 5/35.
 * 7 hạng: Độc Đắc → Nhất → Nhì → Ba → Tư → Năm → Khuyến Khích.
 */
export const LOTTO535_PRIZE_TIER_LABELS: Record<PrizeTier, string> = {
  [PrizeTier.Jackpot]: "Giải Độc Đắc",
  [PrizeTier.Tier1]: "Giải Nhất",
  [PrizeTier.Tier2]: "Giải Nhì",
  [PrizeTier.Tier3]: "Giải Ba",
  [PrizeTier.Tier4]: "Giải Tư",
  [PrizeTier.Tier5]: "Giải Năm",
  [PrizeTier.Consolation]: "Giải Khuyến Khích",
} as const;

/**
 * Lấy tên hiển thị hạng giải thưởng Lotto 5/35.
 *
 * @param tier - PrizeTier value
 */
export function getLotto535PrizeTierLabel(tier: PrizeTier): string {
  return LOTTO535_PRIZE_TIER_LABELS[tier] ?? tier;
}

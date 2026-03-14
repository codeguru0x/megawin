/**
 * Max 3D – Display Labels
 *
 * Tên hiển thị cho các kiểu chơi, play mode, hạng giải, v.v. của Max 3D.
 * Dùng trong tất cả UI components (analytics, tickets, reports, ...).
 *
 * Import: `import { MAX3D_PLAY_TYPE_LABELS, ... } from "@megawin/game-max3d/labels"`
 */

import { PlayMode, PlayType, BasicPrizeTier, PlusPrizeTier } from "../entities/enums";

// ─────────────────────────────────────────────
// Play Mode Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị cách chơi chính (basic = Max 3D Cơ Bản, plus = Max 3D+).
 */
export const MAX3D_PLAY_MODE_LABELS: Record<PlayMode, string> = {
  [PlayMode.Basic]: "Max 3D Cơ Bản",
  [PlayMode.Plus]: "Max 3D+",
} as const;

/**
 * Lấy tên hiển thị play mode Max 3D.
 *
 * @param mode - PlayMode value
 */
export function getMax3dPlayModeLabel(mode: PlayMode): string {
  return MAX3D_PLAY_MODE_LABELS[mode] ?? mode;
}

// ─────────────────────────────────────────────
// Play Type Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị kiểu chơi trên mỗi board.
 * Dùng trong analytics, live-feed, dropdown filter.
 */
export const MAX3D_PLAY_TYPE_LABELS: Record<PlayType, string> = {
  [PlayType.Straight]: "Thẳng",
  [PlayType.Combo3]: "Tổ Hợp 3",
  [PlayType.Combo6]: "Tổ Hợp 6",
  [PlayType.QuickPick]: "Chọn nhanh",
} as const;

/**
 * Lấy tên hiển thị kiểu chơi Max 3D.
 *
 * @param playType - PlayType value
 */
export function getMax3dPlayTypeLabel(playType: PlayType): string {
  return MAX3D_PLAY_TYPE_LABELS[playType] ?? playType;
}

/**
 * Tên hiển thị kết hợp mode + type, dùng trong analytics để phân biệt rõ hơn.
 *
 * Ví dụ: "basic.straight" → "Basic Thẳng", "plus.straight" → "Plus Thẳng"
 */
export const MAX3D_MODE_TYPE_LABELS: Record<string, string> = {
  "basic.straight": "Basic Thẳng",
  "basic.combo3": "Basic Tổ Hợp 3",
  "basic.combo6": "Basic Tổ Hợp 6",
  "basic.quickPick": "Basic Chọn nhanh",
  "plus.straight": "Plus Thẳng",
  "plus.quickPick": "Plus Chọn nhanh",
} as const;

/**
 * Lấy label kết hợp mode.type cho Max 3D.
 *
 * @param mode - PlayMode value
 * @param playType - PlayType value
 */
export function getMax3dModeTypeLabel(mode: PlayMode, playType: PlayType): string {
  const key = `${mode}.${playType}`;
  return MAX3D_MODE_TYPE_LABELS[key] ?? `${mode} ${MAX3D_PLAY_TYPE_LABELS[playType] ?? playType}`;
}

// ─────────────────────────────────────────────
// Prize Tier Labels – Basic (4 hạng)
// ─────────────────────────────────────────────

/**
 * Tên hiển thị hạng giải thưởng Max 3D Cơ Bản.
 * 4 hạng: Đặc Biệt → Nhất → Nhì → Ba.
 */
export const MAX3D_BASIC_PRIZE_TIER_LABELS: Record<BasicPrizeTier, string> = {
  [BasicPrizeTier.Special]: "Giải Đặc Biệt",
  [BasicPrizeTier.First]: "Giải Nhất",
  [BasicPrizeTier.Second]: "Giải Nhì",
  [BasicPrizeTier.Third]: "Giải Ba",
} as const;

/**
 * Lấy tên hiển thị hạng giải thưởng Max 3D Cơ Bản.
 *
 * @param tier - BasicPrizeTier value
 */
export function getMax3dBasicPrizeTierLabel(tier: BasicPrizeTier): string {
  return MAX3D_BASIC_PRIZE_TIER_LABELS[tier] ?? tier;
}

// ─────────────────────────────────────────────
// Prize Tier Labels – Plus (7 hạng)
// ─────────────────────────────────────────────

/**
 * Tên hiển thị hạng giải thưởng Max 3D+ (Plus mode).
 * 7 hạng: Đặc Biệt → Nhất → Nhì → Ba → Tư → Năm → Sáu.
 */
export const MAX3D_PLUS_PRIZE_TIER_LABELS: Record<PlusPrizeTier, string> = {
  [PlusPrizeTier.Special]: "Giải Đặc Biệt",
  [PlusPrizeTier.First]: "Giải Nhất",
  [PlusPrizeTier.Second]: "Giải Nhì",
  [PlusPrizeTier.Third]: "Giải Ba",
  [PlusPrizeTier.Fourth]: "Giải Tư",
  [PlusPrizeTier.Fifth]: "Giải Năm",
  [PlusPrizeTier.Sixth]: "Giải Sáu",
} as const;

/**
 * Lấy tên hiển thị hạng giải thưởng Max 3D+.
 *
 * @param tier - PlusPrizeTier value
 */
export function getMax3dPlusPrizeTierLabel(tier: PlusPrizeTier): string {
  return MAX3D_PLUS_PRIZE_TIER_LABELS[tier] ?? tier;
}

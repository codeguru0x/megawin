/**
 * Max 3D Pro – Display Labels
 *
 * Tên hiển thị cho các play mode, kiểu chơi, hạng giải, v.v. của Max 3D Pro.
 * Dùng trong tất cả UI components (analytics, tickets, reports, ...).
 *
 * Import: `import { MAX3DPRO_PLAY_MODE_LABELS, ... } from "@megawin/game-max3dpro/labels"`
 */

import { PlayMode, PlayType, PrizeTier } from "../entities/enums";

// ─────────────────────────────────────────────
// Play Mode Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị cách chơi bao của Max 3D Pro.
 *
 * - `multiNumber`: Bao nhiều bộ số (chọn 3-20 bộ ba số, tạo C(n,2) cặp)
 * - `multiDigit`: Bao bộ ba số (chọn 3 chữ số đầu + 3 chữ số sau, expand hoán vị)
 */
export const MAX3DPRO_PLAY_MODE_LABELS: Record<PlayMode, string> = {
  [PlayMode.MultiNumber]: "Bao nhiều bộ số",
  [PlayMode.MultiDigit]: "Bao bộ ba số",
} as const;

/**
 * Lấy tên hiển thị play mode Max 3D Pro.
 *
 * @param mode - PlayMode value
 */
export function getMax3dproPlayModeLabel(mode: PlayMode): string {
  return MAX3DPRO_PLAY_MODE_LABELS[mode] ?? mode;
}

// ─────────────────────────────────────────────
// Play Type Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị kiểu chơi Max 3D Pro.
 * Chỉ hỗ trợ `straight` và `quickPick` (không có combo3/combo6).
 */
export const MAX3DPRO_PLAY_TYPE_LABELS: Record<PlayType, string> = {
  [PlayType.Straight]: "Thẳng",
  [PlayType.QuickPick]: "Chọn nhanh",
} as const;

/**
 * Lấy tên hiển thị kiểu chơi Max 3D Pro.
 *
 * @param playType - PlayType value
 */
export function getMax3dproPlayTypeLabel(playType: PlayType): string {
  return MAX3DPRO_PLAY_TYPE_LABELS[playType] ?? playType;
}

// ─────────────────────────────────────────────
// Prize Tier Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị hạng giải thưởng Max 3D Pro.
 * 8 hạng: Đặc Biệt → Phụ Đặc Biệt → Nhất → Nhì → Ba → Tư → Năm → Sáu.
 *
 * `specialSub` (Giải phụ Đặc Biệt) là điểm độc nhất của Max 3D Pro:
 * trùng 2 bộ ba số giải ĐB nhưng NGƯỢC thứ tự quay.
 */
export const MAX3DPRO_PRIZE_TIER_LABELS: Record<PrizeTier, string> = {
  [PrizeTier.Special]: "Giải Đặc Biệt",
  [PrizeTier.SpecialSub]: "Giải Phụ Đặc Biệt",
  [PrizeTier.First]: "Giải Nhất",
  [PrizeTier.Second]: "Giải Nhì",
  [PrizeTier.Third]: "Giải Ba",
  [PrizeTier.Fourth]: "Giải Tư",
  [PrizeTier.Fifth]: "Giải Năm",
  [PrizeTier.Sixth]: "Giải Sáu",
} as const;

/**
 * Lấy tên hiển thị hạng giải thưởng Max 3D Pro.
 *
 * @param tier - PrizeTier value
 */
export function getMax3dproPrizeTierLabel(tier: PrizeTier): string {
  return MAX3DPRO_PRIZE_TIER_LABELS[tier] ?? tier;
}

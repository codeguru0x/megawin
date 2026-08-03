/**
 * Max 3D – Shared Types
 *
 * Quy ước:
 * - Bộ ba số (triplet) lưu dạng string "000"-"999" (3 chữ số, zero-padded).
 * - Tiền lưu dạng integer VND (không float).
 * - Ngày report dùng ISODateString "YYYY-MM-DD".
 */

export type { ISODateString } from "@megawin/game-core/types";
import type { OpsStatsConfig } from "@megawin/game-core/types";
import type { Max3dOpsAlertType } from "./ops-alert";

// ─────────────────────────────────────────────
// Draw Number (kỳ quay trong tuần)
// ─────────────────────────────────────────────

/**
 * Max 3D quay vào thứ 2, 4, 6 hàng tuần, 1 kỳ/ngày lúc 18h00.
 * DrawNo = 1 (chỉ có 1 kỳ/ngày).
 */
export type DrawNo = typeof DrawNo.Default;

export const DrawNo = {
  Default: 1,
} as const;

export const DRAW_NO_VALUES: readonly number[] = [DrawNo.Default];

// ─────────────────────────────────────────────
// Max 3D Number Ranges
// ─────────────────────────────────────────────

/** Mỗi chữ số: 0-9. */
export const MAX3D_DIGIT_MIN = 0;
export const MAX3D_DIGIT_MAX = 9;

/** Bộ ba số: 000-999 (1000 giá trị). */
export const MAX3D_TRIPLET_MIN = 0;
export const MAX3D_TRIPLET_MAX = 999;
export const MAX3D_TRIPLET_TOTAL = 1000;

/** Số lượng bộ ba số quay mỗi kỳ. */
export const MAX3D_DRAW_COUNT_SPECIAL = 2;
export const MAX3D_DRAW_COUNT_FIRST = 4;
export const MAX3D_DRAW_COUNT_SECOND = 6;
export const MAX3D_DRAW_COUNT_THIRD = 8;
export const MAX3D_DRAW_TOTAL = 20;

// ─────────────────────────────────────────────
// Triplet & Value Types
// ─────────────────────────────────────────────

/**
 * Bộ ba số (000-999).
 * Lưu dạng string zero-padded 3 ký tự: "000", "001", ..., "999".
 */
export type Triplet = string;

/**
 * Lựa chọn của người chơi trên 1 board.
 *
 * - Max 3D cơ bản (basic): 1 bộ ba số → triplets.length = 1
 * - Max 3D+ (plus): 2 bộ ba số → triplets.length = 2
 * - Tổ hợp: 1 bộ ba số → triplets.length = 1 (expand thành hoán vị)
 */
export interface BoardSelection {
  triplets: Triplet[];
}

// ─────────────────────────────────────────────
// Prize Amounts
// ─────────────────────────────────────────────

/**
 * Giá trị giải thưởng cố định cho Max 3D Cơ Bản (1 bộ ba số, straight).
 * Áp dụng cho 1 lần tham gia dự thưởng mệnh giá 10.000 đồng.
 */
export interface BasicPrizeAmounts {
  special: number;
  first: number;
  second: number;
  third: number;
}

/**
 * Giá trị giải thưởng cho cách chơi tổ hợp (combo).
 * Tính theo từng loại tổ hợp (combo3, combo6).
 */
export interface ComboPrizeAmounts {
  combo3: BasicPrizeAmounts;
  combo6: BasicPrizeAmounts;
}

/**
 * Giá trị giải thưởng cho Max 3D+ (2 bộ ba số).
 * 7 hạng giải.
 */
export interface PlusPrizeAmounts {
  special: number;
  first: number;
  second: number;
  third: number;
  fourth: number;
  fifth: number;
  sixth: number;
}

/**
 * Tổng hợp tất cả giải thưởng mặc định cho game Max 3D.
 */
export interface Max3dPrizeConfig {
  /** Giải thưởng Max 3D Cơ Bản (straight). */
  basic: BasicPrizeAmounts;
  /** Giải thưởng tổ hợp. */
  combo: ComboPrizeAmounts;
  /** Giải thưởng Max 3D+. */
  plus: PlusPrizeAmounts;
}

// ─────────────────────────────────────────────
// Game Config Sub-types
// ─────────────────────────────────────────────

/** Tỷ lệ tài chính. */
export interface FinancialRates {
  defaultCommissionRate: number;
}

/** Quy tắc chơi. */
export interface PlayRules {
  unitPrice: number;
  /** Số lần cược tối thiểu per board (≥ 1). Mặc định 1. */
  minBetCount: number;
  /** Số lần cược tối đa per board. Mặc định 10. */
  maxBetCount: number;
  maxBoardsPerTicket: number;
  maxDrawCount: number;
  salesCloseBeforeMinutes: number;
  drawsPerDay: number;
  drawTimes: string[];
  /** Các ngày trong tuần được phép quay (0=CN, 1=T2, ..., 6=T7). */
  drawDaysOfWeek: number[];
}

// ─────────────────────────────────────────────
// Operations & Risk Control Config (analysis max3d-ops §3.6)
// ─────────────────────────────────────────────

/**
 * Ngưỡng cảnh báo vận hành — evaluator so mỗi tick worker (p0-04).
 *
 * KHÁC Keno/Bingo18: KHÔNG có cap kỳ và revenue kỳ (bán nhiều ngày) không ổn định
 * làm mẫu số → ngưỡng TUYỆT ĐỐI VND (chốt 30/07/2026, analysis §7 Q2).
 */
export interface OpsAlertsConfig {
  /** Ngưỡng 1 entry bị coi là cược lớn (VND). Default 5.000.000. */
  largeBetAmount: number;
  /** Ngưỡng worst-case tổng (VND tuyệt đối) → `exposure_threshold`. Default 5 tỷ. */
  exposureWarnAmount: number;
  /**
   * Ngưỡng liability ĐB của 1 cặp plus (VND) → `pair_liability`. Default 2 tỷ
   * (ĐB plus 1 tỷ/unit ×100.000 — 20.000đ cược vào 1 cặp = liability 2 tỷ; bắn
   * sớm thiên an toàn vì KHÔNG có cap kỳ — chốt §7 Q2).
   */
  pairLiabilityWarnAmount: number;
  /** Số account distinct cùng 1 cặp → `combo_concentration`. Default 5. */
  comboAccountsWarn: number;
  /** Bật/tắt từng loại alert. Khoá tự đúng theo `Max3dOpsAlertType`. */
  enabled: Record<Max3dOpsAlertType, boolean>;
}

/**
 * Section `ops` trong GlobalConfig — cấu hình vận hành & kiểm soát rủi ro.
 *
 * KHÔNG expose cho player. `stats` dùng {@link OpsStatsConfig} ĐẦY ĐỦ (có
 * `topCombosK` — cắt danh sách `topPairs`, khác Bingo18 dùng base).
 */
export interface OpsConfig {
  /** Ngưỡng alert (evaluator so — p0-04). */
  alerts: OpsAlertsConfig;
  /** Nhịp worker + top-K (`OpsStatsConfig` từ game-core — topCombosK cho topPairs). */
  stats: OpsStatsConfig;
}

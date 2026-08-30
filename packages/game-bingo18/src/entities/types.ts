/**
 * Bingo 18 – Shared Types
 *
 * Bingo 18 (Vietlott):
 * - Tập số: 1-6 (số nguyên)
 * - Quay 3 số mỗi kỳ (mỗi số rút ngẫu nhiên từ {1,2,3,4,5,6})
 * - Tổng 3 số: 3-18
 * - Cách chơi cơ bản: một số, hai số trùng, ba số trùng
 * - Cách chơi bổ sung: cộng tổng, Lớn/Hòa/Nhỏ
 */

import type { OpsStatsConfigBase } from "@megawin/game-core/types";

import type { Bingo18BigSmallBet, Bingo18TripleKind } from "./enums";
import type { Bingo18OpsAlertType } from "./ops-alert";

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

export type { ISODateString } from "@megawin/game-core/types";

// ─────────────────────────────────────────────
// Bingo 18 Number Ranges
// ─────────────────────────────────────────────

/** Mặt xúc xắc: 1-6. */
export const BINGO18_DICE_MIN = 1;
export const BINGO18_DICE_MAX = 6;

/** Số lượng số quay mỗi kỳ. */
export const BINGO18_DRAW_COUNT = 3;

/** Tổng tối thiểu / tối đa của 3 số quay. */
export const BINGO18_SUM_MIN = 3;
export const BINGO18_SUM_MAX = 18;

/** Ranh giới Lớn/Nhỏ: Nhỏ 3-9, Hòa 10-11, Lớn 12-18. */
export const BINGO18_SMALL_MAX = 9;
export const BINGO18_DRAW_VALUES = [10, 11] as const;
export const BINGO18_BIG_MIN = 12;

// ─────────────────────────────────────────────
// Valid Number Helpers
// ─────────────────────────────────────────────

/** Tất cả số Bingo 18 hợp lệ: 1, 2, 3, 4, 5, 6. */
export const BINGO18_VALID_NUMBERS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6]);

/** Tất cả tổng hợp lệ: 3-18. */
export const BINGO18_VALID_SUMS: ReadonlySet<number> = new Set(
  Array.from({ length: BINGO18_SUM_MAX - BINGO18_SUM_MIN + 1 }, (_, i) => i + BINGO18_SUM_MIN),
);

/** Tất cả cặp trùng nhau hợp lệ: 1-6. */
export const BINGO18_VALID_DOUBLES: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6]);

// ─────────────────────────────────────────────
// Board Selection (user input)
// ─────────────────────────────────────────────

/**
 * Lựa chọn "Một số": chọn 1 số (1-6).
 * Thắng nếu số đó xuất hiện trong 3 số quay.
 * Trúng 1 lần = x1.2, trúng 2 lần = x2, trúng 3 lần = x3.
 */
export interface SingleNumSelection {
  number: number;
}

/**
 * Lựa chọn "Hai số trùng nhau": chọn 1 cặp (1-6).
 * Thắng nếu kết quả có ít nhất 2 số trùng với số đã chọn.
 */
export interface DoubleMatchSelection {
  number: number;
}

/**
 * Lựa chọn "Ba số trùng nhau": chọn cụ thể (1-6) hoặc "bất kỳ".
 * - Cụ thể: thắng nếu cả 3 số quay trùng với số đã chọn.
 * - Bất kỳ: thắng nếu cả 3 số quay giống nhau (bất kể số nào).
 */
export interface TripleMatchSelection {
  kind: Bingo18TripleKind;
  number?: number;
}

/**
 * Lựa chọn "Cộng tổng": chọn 1 tổng (3-18).
 * Thắng nếu tổng 3 số quay bằng tổng đã chọn.
 */
export interface SumTotalSelection {
  sum: number;
}

/**
 * Lựa chọn "Lớn/Hòa/Nhỏ".
 */
export interface BigSmallDrawSelection {
  bet: Bingo18BigSmallBet;
}

// ─────────────────────────────────────────────
// Prize Configuration Types
// ─────────────────────────────────────────────

/**
 * Bảng giải thưởng cách chơi "Một số".
 * Key: số lần xuất hiện (1, 2, 3) → giá trị thưởng.
 */
export interface SingleNumPrizes {
  match1: number;
  match2: number;
  match3: number;
}

/**
 * Bảng giải thưởng cách chơi "Hai số trùng nhau".
 * Trùng 2 = thắng.
 */
export interface DoubleMatchPrizes {
  win: number;
}

/**
 * Bảng giải thưởng cách chơi "Ba số trùng nhau".
 */
export interface TripleMatchPrizes {
  specific: number;
  any: number;
}

/**
 * Bảng giải thưởng cách chơi "Cộng tổng".
 * Key: tổng dưới dạng string (e.g. "3", "18") → giá trị thưởng (VND).
 * Dùng string vì MongoDB luôn serialize object key thành string.
 */
export type SumTotalPrizes = Record<string, number>;

/**
 * Bảng giải thưởng cách chơi "Lớn/Hòa/Nhỏ".
 */
export interface BigSmallDrawPrizes {
  big: number;
  draw: number;
  small: number;
}

/** Tỷ lệ tài chính – dùng trong GlobalConfigDoc.rates. */
export interface FinancialRates {
  defaultCommissionRate: number;
}

// ─────────────────────────────────────────────
// Operations & Risk Control Config (§3.6 analysis bingo18-ops)
// ─────────────────────────────────────────────

/**
 * Ngưỡng cảnh báo vận hành — evaluator so mỗi tick worker (p0-04).
 *
 * KHÁC Keno: không có cap kỳ làm mẫu số exposure → dùng cặp
 * `% doanh thu + sàn tuyệt đối` (chốt 30/07/2026, analysis §7 Q2).
 */
export interface OpsAlertsConfig {
  /** Ngưỡng 1 entry bị coi là cược lớn (VND). Default 1.000.000. */
  largeBetAmount: number;
  /**
   * Cảnh báo `exposure_threshold` khi worstCase ≥ pct% doanh thu kỳ.
   * Đơn vị %: [100, 1000]. Default 300 = worst-case gấp 3 lần doanh thu.
   */
  exposureWarnRevenuePct: number;
  /**
   * Sàn tuyệt đối (VND): worstCase dưới mức này KHÔNG cảnh báo dù vượt % —
   * chống noise kỳ vắng khách (revenue nhỏ → % luôn cao). Default 50.000.000.
   */
  exposureWarnMinAmount: number;
  /**
   * % lệch tối đa 1 hướng bigSmallDraw (theo amount) để cảnh báo `sidebet_skew`.
   * Đơn vị %: [50, 95]. Default 70. Xác suất nền ĐỐI XỨNG
   * (small 37,5% / draw 25% / big 37,5% — 81/54/81 trên 216 tổ hợp).
   */
  sidebetSkewPct: number;
  /**
   * Ngưỡng tiền (VND) dồn vào 1 bucket NHÂN CAO (sumTotal 3/18, tripleMatch specific —
   * ×120) để cảnh báo `bucket_concentration`. Default 5.000.000
   * (5tr vào tổng 3/18 = liability 600tr nếu trúng).
   */
  bucketConcentrationAmount: number;
  /** Bật/tắt từng loại alert. Khoá tự đúng theo `Bingo18OpsAlertType` (type dẫn xuất). */
  enabled: Record<Bingo18OpsAlertType, boolean>;
}

/**
 * Section `ops` trong GlobalConfig — cấu hình vận hành & kiểm soát rủi ro.
 *
 * KHÔNG expose cho player (allowlist DTO player không chứa `ops`).
 * `stats` dùng {@link OpsStatsConfigBase} (KHÔNG có `topCombosK` — Bingo 18 không có
 * khái niệm combo, 38 bucket đóng; quyết định "không cấu hình thừa" 30/07/2026).
 */
export interface OpsConfig {
  /** Ngưỡng alert (evaluator so — p0-04). */
  alerts: OpsAlertsConfig;
  /** Nhịp worker + top-K (`OpsStatsConfigBase` từ game-core — không topCombosK). */
  stats: OpsStatsConfigBase;
}

/** Quy tắc chơi – dùng trong GlobalConfigDoc.play. */
export interface PlayRules {
  /** Mệnh giá 1 lần tham gia dự thưởng (VND). Default: 10.000 */
  unitPrice: number;
  /** Số lần cược tối thiểu per board/sideBet (≥ 1). Mặc định 1. */
  minBetCount: number;
  /** Số lần cược tối đa per board/sideBet. Mặc định 10. */
  maxBetCount: number;
  /** Số board cơ bản tối đa trên 1 vé. */
  maxBasicBoardsPerTicket: number;
  /** Số kỳ liên tiếp tối đa. */
  maxDrawCount: number;
  /** Đóng bán trước giờ quay bao nhiêu giây. */
  salesCloseBeforeSeconds: number;
  /** Khoảng cách giữa các kỳ quay (phút). Default: 6 */
  drawIntervalMinutes: number;
  /** Giờ bắt đầu quay trong ngày. Default: "06:06" (kỳ đầu quay sau khi cửa sổ bán vé đầu tiên đóng) */
  firstDrawTime: string;
  /** Giờ kết thúc quay trong ngày (kỳ cuối). Default: "21:53" */
  lastDrawTime: string;
  /** Timezone vận hành. Default: "Asia/Ho_Chi_Minh" */
  timezone: string;
}

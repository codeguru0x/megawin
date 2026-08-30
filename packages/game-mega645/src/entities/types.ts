/**
 * Mega 6/45 – Shared Types
 *
 * Mega 6/45: chọn 6 số từ 01-45, KHÔNG có số đặc biệt.
 * Giá vé: 10,000 VND / line.
 * Lịch quay: 3 lần/tuần – Thứ 4, Thứ 6, Chủ nhật lúc 18:00.
 */

import type { OpsStatsConfig } from "@megawin/game-core/types";

import type { Mega645OpsAlertType } from "./ops-alert";

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

export type { ISODateString } from "@megawin/game-core/types";

// ─────────────────────────────────────────────
// Draw Number
// ─────────────────────────────────────────────

/**
 * Mega 6/45 chỉ quay 1 kỳ/ngày (18h).
 */
export type DrawNo = typeof DrawNo.Single;

export const DrawNo = {
  Single: 1,
} as const;

export const DRAW_NO_VALUES: readonly DrawNo[] = [DrawNo.Single];

// ─────────────────────────────────────────────
// Mega 6/45 Number Ranges
// ─────────────────────────────────────────────

/** Số hợp lệ: 1-45. */
export const MEGA645_NUMBER_MIN = 1;
export const MEGA645_NUMBER_MAX = 45;
/** Phải chọn đúng 6 số cho standard play. */
export const MEGA645_NUMBER_COUNT = 6;

// ─────────────────────────────────────────────
// String Number Helpers
// ─────────────────────────────────────────────

/** Tất cả số hợp lệ dạng string zero-padded: "01"-"45". */
export const ALL_NUMBERS: readonly string[] = Array.from(
  { length: MEGA645_NUMBER_MAX - MEGA645_NUMBER_MIN + 1 },
  (_, i) => String(i + MEGA645_NUMBER_MIN).padStart(2, "0"),
);

/** Set tra nhanh O(1) cho số hợp lệ. */
export const VALID_NUMBER_SET: ReadonlySet<string> = new Set(ALL_NUMBERS);

// ─────────────────────────────────────────────
// Tuple & Value Types
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Board Selection (user input)
// ─────────────────────────────────────────────

/**
 * Lựa chọn số của người chơi trên 1 board.
 *
 * Mega 6/45 KHÔNG có số đặc biệt, chỉ có numbers.
 * - standard:  numbers.length = 6
 * - bao5:      numbers.length = 5
 * - bao7-18:   numbers.length = 7..18
 */
export interface BoardSelection {
  /**
   * Danh sách các số người chơi đã chọn ("01"-"45"), unique, sorted tăng dần.
   * - standard: 6 số (1 line)
   * - bao5: 5 số (hệ thống bổ sung số thứ 6 từ 40 số còn lại → 40 lines)
   * - bao7-18: 7..18 số (expand thành C(N,6) lines)
   */
  numbers: string[];
}

// ─────────────────────────────────────────────
// Line Value (expanded, canonical)
// ─────────────────────────────────────────────

/**
 * Một line con (bộ 6 số) sau khi expand từ board.
 * Đây là đơn vị nhỏ nhất để so sánh với kết quả quay.
 */
export interface LineValue {
  /** 6 số sorted tăng dần ("01"-"45"). */
  numbers: string[];
}

// ─────────────────────────────────────────────
// Prize Amounts
// ─────────────────────────────────────────────

/**
 * Giá trị giải thưởng cố định (VND) cho mỗi tier.
 * Mega 6/45 chỉ có 3 giải cố định (Jackpot là tích luỹ).
 */
export interface PrizeAmounts {
  /** Giải Nhất: 5/6 số. */
  tier1: number;
  /** Giải Nhì: 4/6 số. */
  tier2: number;
  /** Giải Ba: 3/6 số. */
  tier3: number;
}

// ─────────────────────────────────────────────
// Game Config Sub-types
// ─────────────────────────────────────────────

/**
 * Cấu hình Jackpot.
 * Mega 6/45 theo luật Vietlott: Jackpot chỉ tích luỹ (roll-over),
 * KHÔNG có cơ chế chia giải xuống hạng dưới.
 */
export interface JackpotConfig {
  /** Số tiền khởi điểm khi mở cycle Jackpot mới sau khi có winner (VND). Min 12 tỷ. */
  seedAmount: number;
}

/** Tỷ lệ tài chính. */
export interface FinancialRates {
  /** Tỷ lệ hoa hồng mặc định cho đại lý (tenant). Ví dụ: 0.2 = 20%. */
  defaultCommissionRate: number;
  /** Tỷ lệ thu nhập công ty trên tổng doanh thu. Ví dụ: 0.15 = 15%. */
  companyRate: number;
}

/**
 * Quy tắc chơi.
 * Mega 6/45 quay 3 lần/tuần: Thứ 4, Thứ 6, Chủ nhật.
 */
export interface PlayRules {
  /** Đơn giá 1 line (VND). Mặc định: 10,000 VND. */
  unitPrice: number;
  /** Số lần cược tối thiểu per board (≥ 1). Mặc định 1. */
  minBetCount: number;
  /** Số lần cược tối đa per board. Mặc định 10. */
  maxBetCount: number;
  /** Số board tối đa trên 1 vé (tối đa 6 boards: A-F). */
  maxBoardsPerTicket: number;
  /** Số kỳ quay tối đa mà 1 vé có thể tham gia liên tiếp. */
  maxDrawCount: number;
  /** Số phút đóng bán trước giờ quay. Ví dụ: 5 = đóng bán 5 phút trước 18:00. */
  salesCloseBeforeMinutes: number;
  /** Số kỳ quay mỗi tuần (3: Wed, Fri, Sun). */
  drawsPerWeek: number;
  /** Các ngày quay trong tuần (0=Sun, 3=Wed, 5=Fri). */
  drawDaysOfWeek: number[];
  /** Giờ quay (HH:mm). */
  drawTime: string;
}

// ─────────────────────────────────────────────
// Bao Combinations lookup
// ─────────────────────────────────────────────

/**
 * Bảng tra cứu nhanh số line cho từng loại bao.
 * Bao 5 đặc biệt: chọn 5 số, số thứ 6 = 40 số còn lại → 40 lines.
 * Bao 7-18: C(N, 6).
 */
export const BAO_COMBINATIONS: Record<number, number> = {
  5: 40,
  7: 7,
  8: 28,
  9: 84,
  10: 210,
  11: 462,
  12: 924,
  13: 1716,
  14: 3003,
  15: 5005,
  18: 18564,
};

// ─────────────────────────────────────────────
// Operations & Risk Control config (analysis §3.8)
// ─────────────────────────────────────────────

/**
 * Cấu hình ngưỡng alert vận hành (`ops.alerts`) — evaluator so ngưỡng này (p0-02).
 *
 * Tất cả ngưỡng cấu hình động; đổi có hiệu lực trong ~1 chu kỳ worker, không deploy.
 * Defaults là THAM KHẢO — staff chỉnh qua tab "Vận hành" trang config game.
 */
export interface Mega645OpsAlertsConfig {
  /**
   * Ngưỡng cược lớn (VND) — `entry.amount >= giá trị này` → `large_bet`.
   * Default 30.000.000 — đồng bộ Power 6/55 vì bảng giá Bao y hệt (Bao 7 = 70.000đ,
   * Bao 14 = 30,03tr).
   */
  largeBetAmount: number;
  /**
   * Ngưỡng exposure giải cố định (VND, tuyệt đối) — `fixedWorstCase >= giá trị
   * này` → `exposure_threshold`. Default 500.000.000 — scale ¼ theo tier1 (10tr =
   * ¼ tier1 Power 6/55 40tr). VND tuyệt đối (không phải %) vì Mega 6/45 không có
   * `maxPerDraw` để tính phần trăm.
   */
  fixedExposureWarnAmount: number;
  /**
   * Số account distinct cùng cược 1 combo để cảnh báo dồn cược `combo_concentration`.
   * Default 5 = ≥5 người cùng 1 bộ số → nghi syndicate.
   */
  comboAccountsWarn: number;
  /**
   * Ngưỡng giá board Bao cao (VND) — playType bao13..bao18 có board với giá
   * `BAO_COMBINATIONS[N] × unitPrice >= giá trị này` → `bao_high_stake`.
   * Default 30.000.000 (board bao13 = 17,16tr CHƯA chạm; bao14 = 30,03tr đã chạm).
   */
  baoHighStakeAmount: number;
  /** Bật/tắt từng loại alert. Khoá tự đúng theo `Mega645OpsAlertType` (type dẫn xuất). */
  enabled: Record<Mega645OpsAlertType, boolean>;
}

/**
 * Section `ops` trong GlobalConfig — cấu hình vận hành & kiểm soát rủi ro (§3.8).
 *
 * KHÔNG expose cho player (allowlist DTO player không chứa `ops`).
 */
export interface Mega645OpsConfig {
  /** Ngưỡng alert (evaluator so — p0-02). */
  alerts: Mega645OpsAlertsConfig;
  /** Nhịp worker + top-K stats (`OpsStatsConfig` từ game-core: tickSeconds, topPotentialK, topAccountsK, topCombosK). */
  stats: OpsStatsConfig;
}

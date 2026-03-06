/**
 * Power 6/55 – Core Value Types
 *
 * Xổ số tự chọn theo ma trận POWER 6/55:
 * - Chọn 6 số từ tập hợp 01 đến 55
 * - Bonus number: 1 số đặc biệt quay từ 49 quả bóng còn lại (sau khi rút 6)
 * - Quay số mở thưởng: thứ 3, thứ 5, thứ 7 hàng tuần lúc 18h00
 * - Giá vé: 10.000đ/bộ số (1 lần tham gia dự thưởng)
 * - Tối đa 6 kỳ quay liên tiếp
 *
 * Tất cả types ở đây được dùng chung giữa entities, rules, helpers.
 * Không import logic/function ở đây – chỉ pure types & constants.
 */

import type { GameConfigScope } from "@megawin/game-core/entities";

// ─── Number Ranges ───

/** Số nhỏ nhất có thể chọn. */
export const POWER655_MAIN_MIN = 1;
/** Số lớn nhất có thể chọn. */
export const POWER655_MAIN_MAX = 55;
/** Số lượng số chính cần chọn cho 1 bộ số dự thưởng. */
export const POWER655_MAIN_COUNT = 6;

/** Tất cả số chính hợp lệ dạng string zero-padded: "01"-"55". */
export const ALL_MAIN_NUMBERS: readonly string[] = Array.from(
  { length: POWER655_MAIN_MAX - POWER655_MAIN_MIN + 1 },
  (_, i) => String(i + POWER655_MAIN_MIN).padStart(2, "0"),
);

/** Set tra nhanh O(1) cho số chính hợp lệ. */
export const VALID_MAIN_NUMBER_SET: ReadonlySet<string> = new Set(ALL_MAIN_NUMBERS);

/**
 * Bộ 6 số chính dạng string zero-padded.
 * Khi lưu player selection: sorted tăng dần (canonical form).
 * Khi lưu draw result: giữ nguyên thứ tự quay (draw order).
 */
export type MainTuple = readonly [string, string, string, string, string, string];

/**
 * Số đặc biệt (bonus number).
 * Quay từ 49 quả bóng còn lại sau khi đã rút 6 quả chính.
 * Giá trị: "01"-"55", nhưng luôn KHÁC 6 số winning chính.
 * Dùng để xác định Jackpot 2 (trùng 5/6 + bonus).
 */
export type BonusNumber = string;

/**
 * 1 dòng (line) = 1 bộ 6 số chính.
 * Không chứa bonus – bonus chỉ có trong kết quả quay.
 * Khi chơi Bao, 1 board expand ra nhiều lines (C(N,6) tổ hợp).
 */
export interface LineValue {
  /** 6 số chính đã sort tăng dần. */
  main: MainTuple;
}

/**
 * Số thứ tự kỳ quay trong ngày.
 * Power 6/55 chỉ có 1 kỳ/ngày (khác Lotto 5/35 có 2 kỳ).
 */
export const DrawNo = { Single: 1 } as const;
export type DrawNo = (typeof DrawNo)[keyof typeof DrawNo];

/** ISO date string format "YYYY-MM-DD". */
export type ISODateString = string;

/**
 * Lựa chọn số cho 1 bảng (board).
 * - Standard/QuickPick: 6 số
 * - Bao N: N số (7-18)
 */
export interface BoardSelection {
  /** Danh sách số đã chọn dạng string zero-padded ("01"-"55"). Số lượng phụ thuộc PlayType. */
  mainNumbers: string[];
}

/** Ký hiệu bảng trên thẻ chọn số: A, B, C, D, E (tối đa 5 bảng/vé). */
export const VALID_BOARD_NOS = ["A", "B", "C", "D", "E"] as const;
export type BoardNo = (typeof VALID_BOARD_NOS)[number];

/**
 * Giá trị giải thưởng cố định (không tích luỹ).
 * Áp dụng cho Giải Nhất, Nhì, Ba.
 * Giải thưởng = prizeAmount × số lần tham gia dự thưởng (số lines trúng).
 */
export interface PrizeAmounts {
  /** Giải Nhất (trùng 5/6): mặc định 40.000.000đ/lần tham gia. */
  tier1: number;
  /** Giải Nhì (trùng 4/6): mặc định 500.000đ/lần tham gia. */
  tier2: number;
  /** Giải Ba (trùng 3/6): mặc định 50.000đ/lần tham gia. */
  tier3: number;
}

// ─── Jackpot Config ───

/** Cấu hình Jackpot 1 – giải trùng 6/6 số. */
export interface Jackpot1Config {
  /** Số tiền khởi điểm khi bắt đầu chu kỳ mới (mặc định 30 tỷ). */
  seedAmount: number;
}

/** Cấu hình Jackpot 2 – giải trùng 5/6 + bonus. */
export interface Jackpot2Config {
  /** Số tiền khởi điểm khi bắt đầu chu kỳ mới (mặc định 3 tỷ). */
  seedAmount: number;
}

/**
 * Cấu hình Jackpot tổng hợp.
 *
 * Công thức tích luỹ mỗi kỳ:
 *   Tích luỹ = Revenue(100%) - FixedPrizes - AgentCommission(20%) - CompanyTake(15%)
 *   JP1 += tích luỹ × jp1ContributionRatio (90%)
 *   JP2 += tích luỹ × jp2ContributionRatio (10%)
 *
 * Overflow: khi JP1 > jp1OverflowThreshold → phần vượt chuyển sang JP2.
 */
export interface JackpotConfig {
  /** Cấu hình Jackpot 1 (trùng 6/6). */
  jackpot1: Jackpot1Config;
  /** Cấu hình Jackpot 2 (trùng 5/6 + bonus). */
  jackpot2: Jackpot2Config;
  /** Tỷ lệ JP1 nhận từ tổng tích luỹ (0.9 = 90%). */
  jp1ContributionRatio: number;
  /** Tỷ lệ JP2 nhận từ tổng tích luỹ (0.1 = 10%). */
  jp2ContributionRatio: number;
  /** Ngưỡng JP1 tối đa (VNĐ). Phần vượt chuyển sang JP2. Mặc định 300 tỷ. */
  jp1OverflowThreshold: number;
  /** Ngưỡng tổng JP để kích hoạt split cycle (VNĐ). Khi JP1+JP2 vượt → chia cho các giải. */
  splitThreshold: number;
  /** Tỷ lệ chia split cycle cho từng hạng giải cố định. */
  splitRatios: SplitRatios;
}

/**
 * Tỷ lệ chia split cycle.
 * Khi tổng Jackpot vượt splitThreshold, chia cho Giải Nhất/Nhì/Ba.
 * Số parts xác định tỷ lệ: ví dụ {2,1,1} = 50%/25%/25%.
 */
export interface SplitRatios {
  /** Phần cho Giải Nhất. */
  tier1: number;
  /** Phần cho Giải Nhì. */
  tier2: number;
  /** Phần cho Giải Ba. */
  tier3: number;
}

// ─── Financial Rates ───

/**
 * Tỷ lệ tài chính.
 * Áp dụng cho tất cả tenant (global) hoặc override per-tenant.
 */
export interface FinancialRates {
  /** Hoa hồng đại lý (mặc định 0.2 = 20% doanh thu). Override per-tenant qua TenantConfig. */
  defaultCommissionRate: number;
  /** Tỷ lệ công ty thu về (mặc định 0.15 = 15% doanh thu). Bù jackpot seed + lợi nhuận. */
  companyRate: number;
}

// ─── Play Rules ───

/**
 * Luật chơi Power 6/55.
 * Các giá trị mặc định theo thể lệ Vietlott.
 */
export interface PlayRules {
  /** Giá 1 lần tham gia dự thưởng (1 bộ 6 số). Mặc định 10.000đ. */
  unitPrice: number;
  /** Số bảng tối đa trên 1 vé (A-E). Mặc định 5. */
  maxBoardsPerTicket: number;
  /** Số kỳ quay tối đa cho multi-draw. Mặc định 6. */
  maxDrawCount: number;
  /** Đóng bán trước giờ quay bao nhiêu phút. Mặc định 15 (theo thể lệ). */
  salesCloseBeforeMinutes: number;
  /** Số kỳ quay mỗi ngày. Power 6/55 = 1 kỳ (lotto 5/35 = 2 kỳ). */
  drawsPerDay: number;
  /** Giờ quay trong ngày. VD: ["18:00"]. */
  drawTimes: string[];
  /** Ngày quay trong tuần (JS Date.getDay()). [2,4,6] = Thứ 3, Thứ 5, Thứ 7. */
  drawDaysOfWeek: number[];
}

// ─── Bao Play Type Combinations ───

/**
 * Số lượng bộ số (lines) tham gia dự thưởng theo loại Bao.
 * Tính bằng C(n, 6) – tổ hợp chập 6 từ n số đã chọn.
 *
 * | Bao | Số chọn | Bộ số | Giá (VNĐ)     |
 * |-----|---------|-------|---------------|
 * |  7  |    7    |    7  |    70.000     |
 * |  8  |    8    |   28  |   280.000     |
 * |  9  |    9    |   84  |   840.000     |
 * | 10  |   10    |  210  | 2.100.000     |
 * | 11  |   11    |  462  | 4.620.000     |
 * | 12  |   12    |  924  | 9.240.000     |
 * | 13  |   13    | 1716  | 17.160.000    |
 * | 14  |   14    | 3003  | 30.030.000    |
 * | 15  |   15    | 5005  | 50.050.000    |
 * | 18  |   18    |18564  | 185.640.000   |
 */
export const BAO_COMBINATIONS: Record<string, number> = {
  bao7: 7,
  bao8: 28,
  bao9: 84,
  bao10: 210,
  bao11: 462,
  bao12: 924,
  bao13: 1716,
  bao14: 3003,
  bao15: 5005,
  bao18: 18564,
};

// ─── Re-export ───
export type { GameConfigScope };

/**
 * Lotto 5/35 – Shared Types
 *
 * Các kiểu dữ liệu nhỏ dùng chung giữa entities.
 * Tách file riêng để tránh circular import.
 *
 * Quy ước chung:
 * - Số lưu dạng string zero-padded ("01"-"35") — WYSIWYG, khớp display.
 * - Tiền lưu dạng integer VND (không float).
 * - Ngày report dùng ISODateString "YYYY-MM-DD".
 * - Timestamp dùng Date.
 */

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

export type { ISODateString } from "@megawin/game-core/types";

import type { OpsStatsConfig } from "@megawin/game-core/types";

import type { Lotto535OpsAlertType } from "./ops-alert";

// ─────────────────────────────────────────────
// Draw Number (kỳ quay trong ngày)
// ─────────────────────────────────────────────

/**
 * Số thứ tự kỳ quay trong ngày cho Lotto 5/35.
 * Type-safe: chỉ chấp nhận 1 hoặc 2.
 */
export type DrawNo = typeof DrawNo.Morning | typeof DrawNo.Evening;

/**
 * Kỳ quay trong ngày.
 * - Morning (1): kỳ 13h
 * - Evening (2): kỳ 21h – kỳ chia giải Jackpot (split cycle) luôn là kỳ này.
 */
export const DrawNo = {
  /** Kỳ 13h (kỳ 1). */
  Morning: 1,
  /** Kỳ 21h (kỳ 2) – kỳ chia giải Jackpot. */
  Evening: 2,
} as const;

/** Mảng tất cả giá trị DrawNo – dùng cho validation. */
export const DRAW_NO_VALUES: readonly DrawNo[] = [DrawNo.Morning, DrawNo.Evening];

// ─────────────────────────────────────────────
// Lotto 5/35 Number Ranges (dùng cho validation)
// ─────────────────────────────────────────────

/** Giá trị nhỏ nhất của số chính (1). */
export const LOTTO535_MAIN_MIN = 1;

/** Giá trị lớn nhất của số chính (35). */
export const LOTTO535_MAIN_MAX = 35;

/** Số lượng số chính cần chọn mỗi line (5 số). */
export const LOTTO535_MAIN_COUNT = 5;

/** Giá trị nhỏ nhất của số đặc biệt (1). */
export const LOTTO535_SPECIAL_MIN = 1;

/** Giá trị lớn nhất của số đặc biệt (12). */
export const LOTTO535_SPECIAL_MAX = 12;

// ─────────────────────────────────────────────
// String Number Helpers
// ─────────────────────────────────────────────

/** Tất cả số chính hợp lệ dạng string zero-padded: "01"-"35". */
export const ALL_MAIN_NUMBERS: readonly string[] = Array.from(
  { length: LOTTO535_MAIN_MAX - LOTTO535_MAIN_MIN + 1 },
  (_, i) => String(i + LOTTO535_MAIN_MIN).padStart(2, "0"),
);

/** Set tra nhanh O(1) cho số chính hợp lệ. */
export const VALID_MAIN_NUMBER_SET: ReadonlySet<string> = new Set(ALL_MAIN_NUMBERS);

/** Set tra nhanh O(1) cho số đặc biệt hợp lệ: "01"-"12". */
export const VALID_SPECIAL_NUMBER_SET: ReadonlySet<string> = new Set(
  Array.from({ length: LOTTO535_SPECIAL_MAX - LOTTO535_SPECIAL_MIN + 1 }, (_, i) =>
    String(i + LOTTO535_SPECIAL_MIN).padStart(2, "0"),
  ),
);

// ─────────────────────────────────────────────
// Tuple & Value Types
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Board Selection (user input)
// ─────────────────────────────────────────────

/**
 * Lựa chọn số của người chơi trên 1 board.
 * Số lượng phần tử tuỳ thuộc play type:
 * - standard:     mainNumbers.length = 5, specialNumbers.length = 1
 * - mainCover4:   mainNumbers.length = 4, specialNumbers.length = 1
 * - mainCover:    mainNumbers.length = 6..15, specialNumbers.length = 1
 * - specialCover: mainNumbers.length = 5, specialNumbers.length = 2..12
 */
export interface BoardSelection {
  /** Danh sách số chính ("01"-"35"), unique, sorted tăng dần. */
  mainNumbers: string[];

  /** Danh sách số đặc biệt ("01"-"12"), unique, sorted tăng dần. */
  specialNumbers: string[];
}

// ─────────────────────────────────────────────
// Line Value (expanded, canonical)
// ─────────────────────────────────────────────

/**
 * Một line con sau khi expand từ board:
 * - main: đúng 5 số chính string, sorted tăng dần
 * - special: đúng 1 số đặc biệt string
 */
export interface LineValue {
  /** 5 số chính string, sorted tăng dần (canonical form). */
  main: string[];

  /** 1 số đặc biệt string. */
  special: string;
}

// ─────────────────────────────────────────────
// Prize Amounts (dùng chung Global & Tenant config)
// ─────────────────────────────────────────────

/**
 * Giá trị giải thưởng cố định (VND) cho mỗi tier.
 * Dùng chung bởi GlobalConfigDoc.defaultPrizes và TenantConfigDoc.prizeOverrides.
 */
export interface PrizeAmounts {
  /** Giải Nhất: 5 số chính. */
  tier1: number;
  /** Giải Nhì: 4 chính + đặc biệt. */
  tier2: number;
  /** Giải Ba: 4 chính. */
  tier3: number;
  /** Giải Tư: 3 chính + đặc biệt. */
  tier4: number;
  /** Giải Năm: 3 chính. */
  tier5: number;
  /** Giải Khuyến Khích: chỉ đặc biệt. */
  consolation: number;
}

// ─────────────────────────────────────────────
// Game Config Sub-types (tách ra để tránh indexed access)
// ─────────────────────────────────────────────

/** Cấu hình Jackpot – dùng trong GlobalConfigDoc.jackpot. */
export interface JackpotConfig {
  /** Số tiền khởi điểm khi mở kỳ Jackpot mới (VND). */
  seedAmount: number;
  /** Ngưỡng kích hoạt chia Jackpot (VND). */
  splitThreshold: number;
  /** Tỷ lệ chia Jackpot cho từng tier. */
  splitRatios: SplitRatios;
}

/** Tỷ lệ tài chính – dùng trong GlobalConfigDoc.rates. */
export interface FinancialRates {
  /** Hoa hồng đại lý mặc định (tỷ lệ trên doanh thu). */
  defaultCommissionRate: number;
  /** Tỷ lệ công ty thu về trên doanh thu. */
  companyRate: number;
}

/** Quy tắc chơi – dùng trong GlobalConfigDoc.play. */
export interface PlayRules {
  /** Giá 1 line (bộ số con) cho 1 kỳ (VND). */
  unitPrice: number;
  /**
   * Số lần cược tối thiểu per board (≥ 1).
   * Mặc định 1 — player luôn phải cược ít nhất 1 lần.
   */
  minBetCount: number;
  /** Số lần cược tối đa per board. Mặc định 10. */
  maxBetCount: number;
  /** Số board tối đa trên 1 vé (A-E). */
  maxBoardsPerTicket: number;
  /** Số kỳ liên tiếp tối đa (KY). */
  maxDrawCount: number;
  /** Đóng bán trước giờ quay bao nhiêu phút. */
  salesCloseBeforeMinutes: number;
  /** Số kỳ quay mỗi ngày. */
  drawsPerDay: number;
  /** Giờ quay trong ngày (HH:mm). Timezone cố định: Asia/Ho_Chi_Minh. */
  drawTimes: string[];
}

// ─────────────────────────────────────────────
// Split Ratios
// ─────────────────────────────────────────────

/**
 * Tỷ lệ chia Jackpot cho các tier khi split cycle.
 * Tổng = 6 (tier1 = 2/6, tier2-5 mỗi tier = 1/6).
 * Key là PrizeTier string.
 */
export interface SplitRatios {
  /** Tỷ lệ phần chia cho Giải Nhất (mặc định 2/6 ≈ 33.3%). */
  tier1: number;
  /** Tỷ lệ phần chia cho Giải Nhì (mặc định 1/6 ≈ 16.7%). */
  tier2: number;
  /** Tỷ lệ phần chia cho Giải Ba (mặc định 1/6 ≈ 16.7%). */
  tier3: number;
  /** Tỷ lệ phần chia cho Giải Tư (mặc định 1/6 ≈ 16.7%). */
  tier4: number;
  /** Tỷ lệ phần chia cho Giải Năm (mặc định 1/6 ≈ 16.7%). */
  tier5: number;
}

// ─────────────────────────────────────────────
// Ops Config (vận hành & kiểm soát rủi ro — analysis §3.8)
// ─────────────────────────────────────────────

/**
 * Ngưỡng alert vận hành — dùng trong `GlobalConfigDoc.ops.alerts`.
 *
 * Defaults là THAM KHẢO — staff chỉnh qua tab "Vận hành" trang config game. Zod
 * schema ở route siết range; use-case KHÔNG validate lại (rule §8 code-quality).
 */
export interface Lotto535OpsAlertsConfig {
  /**
   * Ngưỡng cược lớn (VND) — `entry.amount >= giá trị này` → `large_bet`.
   * Default 30.000.000 — đồng nhất Power 6/55 (user chốt 05/08).
   */
  largeBetAmount: number;
  /**
   * Ngưỡng exposure giải cố định (VND, tuyệt đối) — `fixedWorstCase >= giá trị
   * này` → `exposure_threshold`. Default 500.000.000 — tier1 Lotto 5/35 (10tr)
   * nhỏ hơn Power 6/55 (40tr) nên ngưỡng thấp hơn tương ứng.
   */
  fixedExposureWarnAmount: number;
  /**
   * Số account distinct cùng cược 1 combo để cảnh báo dồn cược `combo_concentration`.
   * Default 5 = ≥5 người cùng 1 bộ số → nghi syndicate.
   */
  comboAccountsWarn: number;
  /**
   * Ngưỡng giá board `mainCover` cao (VND) — playType `mainCover6..mainCover15`
   * có board với giá `combination(N,5) × unitPrice >= giá trị này` →
   * `cover_high_stake`. Default 10.000.000 (board `mainCover13` = 12,87tr ĐÃ chạm;
   * `mainCover12` = 7,92tr CHƯA chạm).
   */
  coverHighStakeAmount: number;
  /**
   * Tỷ trọng tối đa 1 số đặc biệt được phép chiếm trong tổng tiền `kind=special`
   * trước khi bắn `special_skew` (số thập phân 0–1, KHÔNG phải VND nguyên).
   * Default 0.35 — baseline lý thuyết đều = 1/12 ≈ 8,3%, ngưỡng 35% đã là lệch rõ rệt.
   */
  specialSkewRatio: number;
  /**
   * Tổng tiền `kind=special` tối thiểu (VND) để rule `special_skew` có nghĩa —
   * chống nhiễu kỳ vắng (kỳ mới mở bán, ít tiền, 1 số ĐB dễ "chiếm 100%" giả tạo).
   * Default 50.000.000.
   */
  specialSkewMinAmount: number;
  /** Bật/tắt từng loại alert. Khoá tự đúng theo `Lotto535OpsAlertType` (type dẫn xuất). */
  enabled: Record<Lotto535OpsAlertType, boolean>;
}

/**
 * Section `ops` trong GlobalConfig — cấu hình vận hành & kiểm soát rủi ro (§3.8).
 *
 * KHÔNG expose cho player (allowlist DTO player không chứa `ops`).
 */
export interface Lotto535OpsConfig {
  /** Ngưỡng alert (evaluator so — p0-02). */
  alerts: Lotto535OpsAlertsConfig;
  /** Nhịp worker + top-K stats (`OpsStatsConfig` từ game-core: tickSeconds, topPotentialK, topAccountsK, topCombosK). */
  stats: OpsStatsConfig;
}

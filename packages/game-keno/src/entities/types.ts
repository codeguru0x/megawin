/**
 * Keno – Shared Types
 *
 * Keno Vietlott:
 * - Tập số: "01"-"80" (string 2 ký tự, zero-padded)
 * - Quay 20 số mỗi kỳ
 * - Người chơi chọn 1-10 số (cách chơi cơ bản)
 * - Hoặc đặt cược Lớn/Nhỏ, Chẵn/Lẻ (cách chơi bổ sung)
 */

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

export type { ISODateString } from "@megawin/game-core/types";

import type { OpsStatsConfig } from "@megawin/game-core/types";

import type { KenoBigSmallBet, KenoEvenOddBet } from "./enums";
import type { KenoOpsAlertType } from "./ops-alert";

// ─────────────────────────────────────────────
// Keno Number Ranges
// ─────────────────────────────────────────────

/** Số Keno: 1-80 (giá trị số học, dùng cho logic tính toán). */
export const KENO_NUMBER_MIN = 1;
export const KENO_NUMBER_MAX = 80;

/** Số lượng số quay mỗi kỳ. */
export const KENO_DRAW_COUNT = 20;

/** Số lượng số người chơi chọn: 1-10. */
export const KENO_PICK_MIN = 1;
export const KENO_PICK_MAX = 10;

// ─────────────────────────────────────────────
// String Number Helpers
// ─────────────────────────────────────────────

/**
 * Tất cả số Keno hợp lệ theo thứ tự tăng dần dạng string zero-padded: `["01", …, "80"]`.
 *
 * Dùng để render/iterate (heatmap 80 ô, list số) — KHÔNG tự `Array.from({length:80})` +
 * `padStart` lặp lại ở tầng UI. `KENO_VALID_NUMBERS` là Set dẫn xuất từ mảng này cho lookup O(1).
 */
export const KENO_ALL_NUMBERS: readonly string[] = Array.from({ length: KENO_NUMBER_MAX }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

/**
 * Tất cả số Keno hợp lệ dưới dạng string: "01", "02", ..., "80".
 * Dùng cho validation và lookup.
 */
export const KENO_VALID_NUMBERS: ReadonlySet<string> = new Set(KENO_ALL_NUMBERS);

/** Parse string number ("01"-"80") thành số nguyên. Trả null nếu invalid. */
export function parseKenoNumber(s: string): number | null {
  if (!KENO_VALID_NUMBERS.has(s)) return null;
  return parseInt(s, 10);
}

/** Format số nguyên thành string Keno ("01"-"80"). Trả null nếu out of range. */
export function formatKenoNumber(n: number): string | null {
  if (n < KENO_NUMBER_MIN || n > KENO_NUMBER_MAX || !Number.isInteger(n)) return null;
  return String(n).padStart(2, "0");
}

// ─────────────────────────────────────────────
// Big/Small boundary
// ─────────────────────────────────────────────

/**
 * Ngưỡng Lớn/Nhỏ:
 * - Số từ 1-40: "nhỏ"
 * - Số từ 41-80: "lớn"
 */
export const KENO_BIG_SMALL_BOUNDARY = 40;

// ─────────────────────────────────────────────
// Board Selection (user input)
// ─────────────────────────────────────────────

/**
 * Lựa chọn số của người chơi trên 1 board (cách chơi cơ bản).
 * Chọn 1-10 số dạng string "01"-"80", unique, sorted tăng dần.
 */
export interface NumberSelection {
  /** Danh sách số đã chọn dạng string ("01"-"80"), unique, sorted tăng dần. */
  numbers: string[];
}

/**
 * Lựa chọn cách chơi bổ sung Lớn/Nhỏ (Panel C).
 */
export interface BigSmallSelection {
  bet: KenoBigSmallBet;
}

/**
 * Lựa chọn cách chơi bổ sung Chẵn/Lẻ (Panel C).
 */
export interface EvenOddSelection {
  bet: KenoEvenOddBet;
}

// ─────────────────────────────────────────────
// Prize Configuration Types (dùng chung Global & Tenant config)
// ─────────────────────────────────────────────

/**
 * Bảng giải thưởng cách chơi cơ bản.
 * Key: "pick{N}" (N = 1-10)
 * Value: map từ số trùng (matchCount dạng string) → giá trị thưởng (VND).
 *
 * LƯU Ý: MongoDB và JSON serialize object key luôn là STRING.
 * Key matchCount lưu dạng "0", "1", ..., "10" (string), KHÔNG phải number.
 *
 * Dùng chung bởi GlobalConfigDoc.basicPrizes và TenantConfigDoc.prizeOverrides.basicPrizes.
 */
export type BasicPrizes = Record<string, Record<string, number>>;

/**
 * Bảng giải thưởng cách chơi bổ sung Lớn/Nhỏ.
 */
export interface BigSmallPrizes {
  /** Lớn: ≥13 số từ 41-80 → 26.000đ */
  big13Plus: number;
  /** Lớn: 11 hoặc 12 số từ 41-80 → 10.000đ */
  big1112: number;
  /** Hoà Lớn Nhỏ: 10 số mỗi bên → 26.000đ */
  draw: number;
  /** Nhỏ: 11 hoặc 12 số từ 01-40 → 10.000đ */
  small1112: number;
  /** Nhỏ: ≥13 số từ 01-40 → 26.000đ */
  small13Plus: number;
}

/**
 * Bảng giải thưởng cách chơi bổ sung Chẵn/Lẻ.
 */
export interface EvenOddPrizes {
  /** Chẵn: ≥15 số chẵn → 200.000đ */
  even15Plus: number;
  /** Chẵn: 13 hoặc 14 số chẵn → 40.000đ */
  even1314: number;
  /** Chẵn 11-12: 11 hoặc 12 số chẵn → 20.000đ */
  even1112: number;
  /** Hoà: 10 chẵn + 10 lẻ → 20.000đ */
  draw: number;
  /** Lẻ 11-12: 11 hoặc 12 số lẻ → 20.000đ */
  odd1112: number;
  /** Lẻ: 13 hoặc 14 số lẻ → 40.000đ */
  odd1314: number;
  /** Lẻ: ≥15 số lẻ → 200.000đ */
  odd15Plus: number;
}

/**
 * Giới hạn trả thưởng mỗi kỳ quay cho bậc cao (pick8, pick9, pick10).
 *
 * Quy tắc Vietlott: khi tổng số bộ trúng vượt `maxSetsForFixed`,
 * thay vì trả giá cố định, pool `maxPerDraw` được chia đều cho tất cả bộ trúng.
 *
 * Dùng bởi step `ApplyPayoutCaps` trong settle pipeline.
 */
export interface PayoutCaps {
  /** Bậc 8 trùng 8: ≤50 bộ → 200tr/bộ, >50 bộ → 10 tỷ chia đều. */
  pick8MaxPerDraw: number;
  pick8MaxSetsForFixed: number;

  /** Bậc 9 trùng 9: ≤12 bộ → 800tr/bộ, >12 bộ → 10 tỷ chia đều. */
  pick9MaxPerDraw: number;
  pick9MaxSetsForFixed: number;

  /** Bậc 10 trùng 10: ≤5 bộ → 2 tỷ/bộ, >5 bộ → 10 tỷ chia đều. */
  pick10MaxPerDraw: number;
  pick10MaxSetsForFixed: number;
}

/** Tỷ lệ tài chính — dùng trong `GlobalConfigDoc.rates`. */
export interface FinancialRates {
  /**
   * Hoa hồng đại lý mặc định áp dụng cho tất cả tenant chưa có TenantConfig.
   * Đơn vị: tỷ lệ [0, 1]. Ví dụ: 0.20 = 20%.
   * Override per tenant qua `TenantConfigDoc.commissionRate`.
   */
  defaultCommissionRate: number;
}

/**
 * Quy tắc gameplay — dùng trong `GlobalConfigDoc.play`.
 *
 * Toàn bộ các tham số này có thể được staff chỉnh sửa qua backoffice UI.
 * Thay đổi có hiệu lực ngay cho các ticket mới — ticket cũ đã paid không bị ảnh hưởng.
 */
export interface PlayRules {
  /** Mệnh giá 1 lần tham gia (VND). Default: 10.000 */
  unitPrice: number;
  /**
   * Số lần cược tối thiểu per board/sideBet (≥ 1).
   * Mặc định 1 — player luôn phải cược ít nhất 1 lần.
   */
  minBetCount: number;
  /** Số lần cược tối đa per board/sideBet (≥ 1). Mặc định 10. */
  maxBetCount: number;
  /** Số panel cơ bản tối đa trên 1 vé. Default: 2 (A, B) */
  maxBasicBoardsPerTicket: number;
  /** Số kỳ liên tiếp tối đa. Default: 20 */
  maxDrawCount: number;
  /** Đóng bán trước giờ quay bao nhiêu giây. Default: 60 */
  salesCloseBeforeSeconds: number;
  /** Khoảng cách giữa các kỳ quay (phút). Default: 8 */
  drawIntervalMinutes: number;
  /** Giờ bắt đầu quay trong ngày. Default: "06:08" (kỳ đầu quay sau khi cửa sổ bán vé đầu tiên đóng) */
  firstDrawTime: string;
  /** Giờ kết thúc quay trong ngày (kỳ cuối). Default: "21:52" */
  lastDrawTime: string;
  /** Timezone vận hành. Default: "Asia/Ho_Chi_Minh" */
  timezone: string;
}

/**
 * Override giải thưởng cho tenant — subset các fields cần ghi đè so với global config.
 *
 * Dùng chung bởi:
 * - `GlobalConfigDoc` (đặt default values)
 * - `TenantConfigDoc` (override per tenant — các field không set sẽ dùng global)
 *
 * Tất cả fields optional: tenant chỉ cần override đúng phần họ muốn thay đổi.
 */
export interface KenoPrizeOverrides {
  basicPrizes?: BasicPrizes;
  bigSmallPrizes?: BigSmallPrizes;
  evenOddPrizes?: EvenOddPrizes;
}

// ─────────────────────────────────────────────
// Operations & Risk Control config (§3.9)
// ─────────────────────────────────────────────

/**
 * Ngưỡng số bộ cappable gần cap `maxSetsForFixed` (cảnh báo trước khi chuyển chia đều).
 *
 * Vietlott: pick8 cap 50 bộ, pick9 12 bộ, pick10 5 bộ (`keno-game-rules`). Ngưỡng cảnh
 * báo đặt thấp hơn để staff biết sớm. VD default 40/10/4 = cảnh báo khi gần chạm.
 */
export interface ComboSetsWarn {
  /** Ngưỡng cảnh báo số bộ pick8 (cap 50). Default 40. */
  pick8: number;
  /** Ngưỡng cảnh báo số bộ pick9 (cap 12). Default 10. */
  pick9: number;
  /** Ngưỡng cảnh báo số bộ pick10 (cap 5). Default 4. */
  pick10: number;
}

/**
 * Cấu hình ngưỡng alert vận hành (`ops.alerts`) — evaluator so ngưỡng này (p0-06).
 *
 * Tất cả ngưỡng cấu hình động; đổi có hiệu lực trong ~1 chu kỳ worker, không deploy.
 */
export interface OpsAlertsConfig {
  /** Ngưỡng cược lớn (VND) — entry.amount ≥ giá trị này → `large_bet`. Default 5.000.000. */
  largeBetAmount: number;
  /**
   * % cap `maxPerDraw` mà exposure worst-case chạm để cảnh báo `exposure_threshold`.
   * Đơn vị %: [0,100]. Default 60 = cảnh báo khi worst-case ≥ 60% cap kỳ.
   */
  exposureWarnPct: number;
  /**
   * % lệch tối đa 1 hướng side bet để cảnh báo `sidebet_skew`.
   * Đơn vị %: [0,100]. Default 70 = 1 hướng chiếm ≥ 70% tiền cặp side bet.
   */
  sidebetSkewPct: number;
  /** Ngưỡng số bộ cappable gần cap → `cap_sets_near`. Default 40/10/4. */
  comboSetsWarn: ComboSetsWarn;
  /**
   * Số account distinct cùng cược 1 combo để cảnh báo dồn cược `combo_concentration`.
   * Default 5 = ≥5 người cùng 1 bộ số → nghi syndicate.
   */
  comboAccountsWarn: number;
  /** Bật/tắt từng loại alert. Khoá tự đúng theo `KenoOpsAlertType` (type dẫn xuất). */
  enabled: Record<KenoOpsAlertType, boolean>;
}

/**
 * Section `ops` trong GlobalConfig — cấu hình vận hành & kiểm soát rủi ro (§3.9).
 *
 * KHÔNG expose cho player (allowlist DTO player không chứa `ops`).
 */
export interface OpsConfig {
  /** Ngưỡng alert (evaluator so — p0-06). */
  alerts: OpsAlertsConfig;
  /** Nhịp worker + top-K stats (`OpsStatsConfig` từ game-core). */
  stats: OpsStatsConfig;
}

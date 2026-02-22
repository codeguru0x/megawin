/**
 * Keno – Game Configuration
 *
 * Collection: kenoGameConfigs
 *
 * Keno Vietlott:
 * - Không có Jackpot tích luỹ (giải thưởng cố định theo bảng)
 * - Giải thưởng tối đa: 2 tỷ (pick10, trùng 10/10)
 * - Giới hạn trả thưởng cho bậc 8/9/10 không vượt 10 tỷ / kỳ
 */

import type {
  Currency,
  GameConfigScope,
  KenoProduct,
} from "./keno.enums";

// ─────────────────────────────────────────────
// Global Config
// ─────────────────────────────────────────────

export interface KenoGlobalConfigDoc {
  _id: unknown;

  product: KenoProduct;
  scope: typeof GameConfigScope.Global;
  tenantId: null;

  // ───── Financial Rates ─────

  rates: {
    defaultCommissionRate: number;
    minCommissionRate: number;
    companyRate: number;
  };

  // ───── Prize Configuration ─────

  /**
   * Bảng giải thưởng cách chơi cơ bản.
   * Key: "pick{N}" (N = 1-10)
   * Value: map từ số trùng (matchCount) → giá trị thưởng (VND).
   *
   * Ví dụ pick10:
   * { 10: 2_000_000_000, 9: 150_000_000, 8: 8_000_000, ... 0: 10_000 }
   */
  basicPrizes: Record<string, Record<number, number>>;

  /**
   * Bảng giải thưởng cách chơi bổ sung Lớn/Nhỏ.
   * Key: kết quả xác định, Value: giá trị thưởng.
   */
  bigSmallPrizes: {
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
  };

  /**
   * Bảng giải thưởng cách chơi bổ sung Chẵn/Lẻ.
   */
  evenOddPrizes: {
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
  };

  // ───── Payout Caps ─────

  /**
   * Giới hạn trả thưởng mỗi kỳ quay.
   * Keno có quy định không vượt 10 tỷ / kỳ cho bậc 8, 9, 10.
   */
  payoutCaps: {
    /** Bậc 8 trùng 8: ≤50 bộ → 200tr/bộ, >50 bộ → 10 tỷ chia đều. */
    pick8MaxPerDraw: number;
    pick8MaxSetsForFixed: number;

    /** Bậc 9 trùng 9: ≤12 bộ → 800tr/bộ, >12 bộ → 10 tỷ chia đều. */
    pick9MaxPerDraw: number;
    pick9MaxSetsForFixed: number;

    /** Bậc 10 trùng 10: ≤5 bộ → 2 tỷ/bộ, >5 bộ → 10 tỷ chia đều. */
    pick10MaxPerDraw: number;
    pick10MaxSetsForFixed: number;
  };

  // ───── Play Rules ─────

  play: {
    currency: Currency;

    /** Mệnh giá 1 lần tham gia (VND). Default: 10.000 */
    unitPrice: number;

    /** Số panel cơ bản tối đa trên 1 vé. Default: 2 (A, B) */
    maxBasicBoardsPerTicket: number;

    /** Số kỳ liên tiếp tối đa. Default: 20 */
    maxDrawCount: number;

    /** Đóng bán trước giờ quay bao nhiêu phút. Default: 5 */
    salesCloseBeforeMinutes: number;

    /**
     * Khoảng cách giữa các kỳ quay (phút). Default: 10
     * Keno quay mỗi 10 phút.
     */
    drawIntervalMinutes: number;

    /** Giờ bắt đầu quay trong ngày. Default: "06:00" */
    firstDrawTime: string;

    /** Giờ kết thúc quay trong ngày (kỳ cuối). Default: "21:55" */
    lastDrawTime: string;

    /** Timezone vận hành. Default: "Asia/Ho_Chi_Minh" */
    timezone: string;
  };

  // ───── Metadata ─────

  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// Per-Tenant Config
// ─────────────────────────────────────────────

export interface KenoTenantConfigDoc {
  _id: unknown;

  product: KenoProduct;
  scope: typeof GameConfigScope.Tenant;
  tenantId: string;

  commissionRate: number;
  isEnabled: boolean;

  /** Override giải thưởng riêng tenant (hiếm khi dùng). null = dùng global. */
  prizeOverrides: KenoGlobalConfigDoc["basicPrizes"] | null;

  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// Union Type
// ─────────────────────────────────────────────

export type KenoGameConfigDoc = KenoGlobalConfigDoc | KenoTenantConfigDoc;

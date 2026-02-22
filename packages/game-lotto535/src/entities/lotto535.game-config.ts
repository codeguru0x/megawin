/**
 * Lotto 5/35 – Game Configuration
 *
 * Collection: lotto535GameConfigs
 *
 * Lưu trữ cấu hình game, cho phép staff MegaWin chỉnh sửa trên backoffice UI.
 * 2 loại document:
 *   1. Global (scope = "global", tenantId = null): 1 document duy nhất,
 *      chứa tất cả default config cho game.
 *   2. Per-tenant (scope = "tenant", tenantId = "xxx"): override cho từng tenant.
 *
 * Pattern này áp dụng chung cho mọi game:
 *   {Game}GlobalConfigDoc   → cấu hình toàn cục
 *   {Game}TenantConfigDoc   → cấu hình riêng tenant
 *   {Game}GameConfigDoc     → union type
 */

import type {
  Currency,
  GameConfigScope,
  Lotto535Product,
} from "./lotto535.enums";
import type { Lotto535SplitRatios } from "./lotto535.types";

// ─────────────────────────────────────────────
// Global Config (1 document duy nhất)
// ─────────────────────────────────────────────

/**
 * Cấu hình game toàn cục – staff MegaWin quản lý trên backoffice.
 *
 * Mọi field đều editable qua UI trừ product và scope.
 */
export interface Lotto535GlobalConfigDoc {
  /** MongoDB ObjectId. */
  _id: unknown;

  /** Mã game. */
  product: Lotto535Product;

  /** Luôn = "global". */
  scope: typeof GameConfigScope.Global;

  /** Null – global không thuộc tenant nào. */
  tenantId: null;

  // ───── Jackpot Configuration ─────

  /**
   * Cấu hình Jackpot – hiển thị mục "Jackpot Settings" trên UI backoffice.
   * Staff MegaWin có thể chỉnh sửa tất cả field trong section này.
   */
  jackpot: {
    /** Số tiền khởi điểm khi mở kỳ Jackpot mới (VND). Default: 1.000.000.000 (1 tỷ). */
    seedAmount: number;

    /**
     * Ngưỡng kích hoạt chia Jackpot (VND). Default: 12.000.000.000 (12 tỷ).
     * Khi Jackpot >= threshold và không ai trúng → kỳ 21h hôm sau là kỳ chia giải.
     */
    splitThreshold: number;

    /**
     * Tỷ lệ chia Jackpot cho từng tier (tổng = 6 parts).
     * Default: { tier1: 2, tier2: 1, tier3: 1, tier4: 1, tier5: 1 }
     * → tier1 (Giải Nhất) nhận Jackpot/3, tier2-5 mỗi tier nhận Jackpot/6.
     * Giải Khuyến Khích KHÔNG tham gia chia.
     */
    splitRatios: Lotto535SplitRatios;

    /**
     * Đơn vị làm tròn giải thưởng khi chia (VND). Default: 5.000.
     * Theo quy định Vietlott: làm tròn xuống đến đơn vị 5.000 VND.
     * Phần dư cộng vào hạng giải cao nhất có người trúng.
     */
    splitRoundingUnit: number;
  };

  // ───── Financial Rates ─────

  /** Tỷ lệ tài chính – hiển thị mục "Cấu hình tài chính" trên UI. */
  rates: {
    /**
     * Hoa hồng đại lý mặc định (tỷ lệ trên doanh thu).
     * 0.20 = 20%. Áp dụng cho tenant nào chưa có override.
     */
    defaultCommissionRate: number;

    /**
     * Hoa hồng đại lý tối thiểu (sàn).
     * 0.10 = 10%. Tenant không thể cấu hình thấp hơn mức này.
     */
    minCommissionRate: number;

    /**
     * Tỷ lệ công ty thu về trên doanh thu.
     * 0.15 = 15%. Dùng để bù Jackpot + lợi nhuận.
     */
    companyRate: number;
  };

  // ───── Default Prize Amounts ─────

  /**
   * Giá trị giải thưởng cố định mặc định (VND).
   * Hiển thị mục "Cấu hình giải thưởng" trên UI backoffice.
   * Staff MegaWin có thể chỉnh sửa trực tiếp các giá trị này.
   *
   * Không bao gồm Jackpot (giá trị Jackpot là tích luỹ, tối thiểu = seedAmount).
   *
   * Khi hiển thị bảng giải thưởng cho người chơi:
   * - Giải trúng Jackpot (5 chính + ĐB): ghi "Jackpot" (giá trị tích luỹ)
   * - Các giải khác: ghi giá trị cố định từ config này
   * - Tại kỳ "Chia Giải Độc Đắc": ghi "Jackpot + {bonusPerWinner}" cho tier1-5
   * - Giải Khuyến Khích: luôn giá trị cố định, KHÔNG nhận bonus từ chia Jackpot
   *
   * Khi chơi BAO, giải thưởng = tổng tất cả line trúng (không config riêng).
   * Ví dụ BAO 15: trúng 5+ĐB → Jackpot + 320.02 triệu (tổng từ nhiều lines).
   */
  defaultPrizes: {
    /** Giải Nhất: 5 số chính. Default: 10.000.000 (*) */
    tier1: number;
    /** Giải Nhì: 4 chính + đặc biệt. Default: 5.000.000 (*) */
    tier2: number;
    /** Giải Ba: 4 chính. Default: 500.000 (*) */
    tier3: number;
    /** Giải Tư: 3 chính + đặc biệt. Default: 100.000 (*) */
    tier4: number;
    /** Giải Năm: 3 chính. Default: 30.000 (*) */
    tier5: number;
    /** Giải Khuyến Khích: chỉ đặc biệt. Default: 10.000 */
    consolation: number;
  };

  // ───── Play Rules ─────

  /** Quy tắc chơi – hiển thị mục "Cấu hình luật chơi" trên UI. */
  play: {
    /** Đơn vị tiền tệ. */
    currency: Currency;

    /** Giá 1 line (bộ số con) cho 1 kỳ (VND). Default: 10.000 */
    unitPrice: number;

    /** Số board tối đa trên 1 vé (A-E). Default: 5 */
    maxBoardsPerTicket: number;

    /** Số kỳ liên tiếp tối đa (KY). Default: 6 */
    maxDrawCount: number;

    /** Đóng bán trước giờ quay bao nhiêu phút. Default: 30 */
    salesCloseBeforeMinutes: number;

    /** Số kỳ quay mỗi ngày. Default: 2 */
    drawsPerDay: number;

    /**
     * Giờ quay trong ngày (HH:mm, theo timezone).
     * Default: ["13:00", "21:00"]
     */
    drawTimes: string[];

    /** Timezone vận hành. Default: "Asia/Ho_Chi_Minh" */
    timezone: string;
  };

  // ───── Metadata ─────

  /** Version config – tăng mỗi khi staff chỉnh sửa, dùng cho audit. */
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// Per-Tenant Config
// ─────────────────────────────────────────────

/**
 * Cấu hình game riêng cho từng tenant (đại lý).
 *
 * Chỉ chứa các field cần override.
 * Những gì không set sẽ fallback về global config.
 */
export interface Lotto535TenantConfigDoc {
  _id: unknown;

  product: Lotto535Product;

  /** Luôn = "tenant". */
  scope: typeof GameConfigScope.Tenant;

  /** ID của tenant/đại lý. */
  tenantId: string;

  /**
   * Hoa hồng đại lý cho tenant này (tỷ lệ trên doanh thu).
   * Override rates.defaultCommissionRate trong global config.
   * Phải >= rates.minCommissionRate.
   */
  commissionRate: number;

  /** Tenant có được phép chơi game này không. Default: true. */
  isEnabled: boolean;

  /**
   * Override giá trị giải thưởng riêng cho tenant (hiếm khi dùng).
   * null = dùng global defaultPrizes.
   */
  prizeOverrides: Lotto535GlobalConfigDoc["defaultPrizes"] | null;

  /** Version config – tăng mỗi khi staff chỉnh sửa. */
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// Union Type
// ─────────────────────────────────────────────

/** Union type cho collection lotto535GameConfigs. */
export type Lotto535GameConfigDoc =
  | Lotto535GlobalConfigDoc
  | Lotto535TenantConfigDoc;

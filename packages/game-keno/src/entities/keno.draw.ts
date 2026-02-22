/**
 * Keno – Draw Document
 *
 * Collection: kenoDraws
 *
 * 1 document = 1 kỳ quay Keno.
 * Keno quay mỗi 10 phút, ~288 kỳ/ngày (06:00-21:55).
 *
 * Kết quả: 20 số ngẫu nhiên từ 01-80.
 */

import type {
  DrawResultSource,
  KenoDrawStatus,
  KenoProduct,
} from "./keno.enums";
import type { ISODateString } from "./keno.types";

// ─────────────────────────────────────────────
// Draw Document
// ─────────────────────────────────────────────

export interface KenoDrawDoc {
  _id: unknown;

  /** Mã game. Luôn = "keno". */
  product: KenoProduct;

  /**
   * ID kỳ quay, unique + stable.
   * Format: "YYYY-MM-DD-NNN" (NNN = draw sequence 001-288).
   */
  drawId: string;

  /** Ngày quay "YYYY-MM-DD". */
  drawDate: ISODateString;

  /**
   * Số thứ tự kỳ quay trong ngày (1-288).
   * Kỳ 1 = 06:00, kỳ 2 = 06:10, ...
   */
  drawNo: number;

  /** Thời điểm quay chính xác. */
  drawTime: Date;

  /** Trạng thái vận hành kỳ quay. */
  status: KenoDrawStatus;

  // ───── Sales Window ─────

  sales: {
    openAt: Date;
    /**
     * Keno đóng bán 5 phút trước giờ quay (configurable).
     */
    closeAt: Date;
  };

  // ───── Vietlott Reference ─────

  vietlottRef?: {
    /** Mã kỳ quay Vietlott (ví dụ "123456"). */
    drawPeriod: string;
    drawDate: ISODateString;
    sourceUrl?: string;
  };

  // ───── Result ─────

  /**
   * Kết quả kỳ quay: 20 số từ 01-80.
   * Set khi status chuyển sang "published".
   */
  result?: {
    /** 20 số trúng thưởng, sorted tăng dần. */
    winningNumbers: number[];

    /** Thời điểm công bố. */
    publishedAt: Date;

    /** Nguồn kết quả. */
    source: DrawResultSource;

    checksum?: string;

    // ───── Derived stats từ 20 số quay ─────

    /** Số lượng số "lớn" (41-80) trong 20 số quay. */
    bigCount: number;

    /** Số lượng số "nhỏ" (1-40) trong 20 số quay. */
    smallCount: number;

    /** Số lượng số chẵn trong 20 số quay. */
    evenCount: number;

    /** Số lượng số lẻ trong 20 số quay. */
    oddCount: number;
  };

  // ───── Financial Breakdown (sau settle) ─────

  financial?: {
    totalRevenue: number;
    totalPrizes: number;
    totalAgentCommission: number;
    companyTake: number;
    tenantBreakdown?: KenoDrawTenantFinancial[];
  };

  // ───── Operational Stats ─────

  stats?: {
    /** Số entry tham gia kỳ này. */
    ticketEntryCount: number;
    /** Tổng doanh thu kỳ này. */
    totalSalesAmount: number;
    /** Tổng payout sau settle. */
    totalPayoutAmount?: number;
  };

  // ───── Timestamps ─────

  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

export interface KenoDrawTenantFinancial {
  tenantId: string;
  revenue: number;
  commission: number;
  commissionRate: number;
  entryCount: number;
}

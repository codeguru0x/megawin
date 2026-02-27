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

import type { DrawStatus } from "@megawin/game-core/entities";
import type { ISODateString } from "./types";

// ─────────────────────────────────────────────
// Draw Document
// ─────────────────────────────────────────────

export interface DrawDoc {
  _id: unknown;

  /**
   * ID kỳ quay, unique + stable.
   * Format: "YYYY-MM-DD.NNN" (NNN = draw sequence 001-288).
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
  status: DrawStatus;

  // ───── Sales Window ─────

  sales: {
    /** Thời điểm mở bán. Chỉ có sau khi staff nhấn "Mở bán". */
    openAt?: Date;
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
  };

  // ───── Financial Date ─────

  /**
   * Ngày tài chính "YYYY-MM-DD".
   * Tính từ drawTime theo rule: 11h sáng → 11h sáng hôm sau (giờ VN).
   * Set 1 lần duy nhất khi tạo draw. Ticket/entry lấy từ đây.
   */
  financialDate: ISODateString;

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

  // ───── Void Info ─────

  /** Thông tin khi kỳ quay bị huỷ. Chỉ có khi status = void. */
  voidInfo?: {
    reason: string;
    voidedBy?: string;
    voidedAt: Date;
  };

  /** Tổng kết void flow (entries refund). */
  voidSummary?: {
    totalVoidedEntries: number;
    totalOriginalAmount: number;
    totalRefundAmount: number;
    completedAt: Date;
  };

  // ───── Timestamps ─────

  createdAt: Date;
  updatedAt: Date;
}

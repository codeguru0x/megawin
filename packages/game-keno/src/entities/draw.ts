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
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Cửa sổ bán vé cho kỳ quay. */
export interface DrawSales {
  /** Thời điểm mở bán. Chỉ có sau khi staff nhấn "Mở bán". */
  openAt?: Date;
  /** Keno đóng bán 5 phút trước giờ quay (configurable). */
  closeAt: Date;
}

/** Tham chiếu kỳ quay Vietlott. */
export interface DrawVietlottRef {
  /** Mã kỳ quay Vietlott (ví dụ "123456"). */
  drawPeriod: string;
  drawDate: ISODateString;
}

/**
 * Kết quả kỳ quay: 20 số từ 01-80.
 * Set khi status chuyển sang "published".
 */
export interface DrawResult {
  /** 20 số trúng thưởng dạng string "01"-"80", giữ nguyên thứ tự quay. */
  winningNumbers: string[];
  /** Thời điểm công bố. */
  publishedAt: Date;
  /** Số lượng số "lớn" (41-80) trong 20 số quay. */
  bigCount: number;
  /** Số lượng số "nhỏ" (1-40) trong 20 số quay. */
  smallCount: number;
  /** Số lượng số chẵn trong 20 số quay. */
  evenCount: number;
  /** Số lượng số lẻ trong 20 số quay. */
  oddCount: number;
}

/** Phân tích tài chính kỳ quay, tính sau settle. */
export interface DrawFinancial {
  totalRevenue: number;
  totalPrizes: number;
  totalAgentCommission: number;
  companyTake: number;
}

/** Thống kê vận hành kỳ quay. */
export interface DrawStats {
  /** Số entry tham gia kỳ này. */
  ticketEntryCount: number;
  /** Tổng doanh thu kỳ này. */
  totalSalesAmount: number;
  /** Tổng payout sau settle. */
  totalPayoutAmount?: number;
}

/** Thông tin khi kỳ quay bị huỷ. Chỉ có khi status = void. */
export interface DrawVoidInfo {
  reason: string;
  voidedBy?: string;
  voidedAt: Date;
}

/** Tổng kết void flow (entries refund). */
export interface DrawVoidSummary {
  totalVoidedEntries: number;
  totalOriginalAmount: number;
  totalRefundAmount: number;
  completedAt: Date;
}

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

  sales: DrawSales;

  vietlottRef?: DrawVietlottRef;

  /**
   * Ngày tài chính "YYYY-MM-DD".
   * Tính từ drawTime theo rule: 11h sáng → 11h sáng hôm sau (giờ VN).
   * Set 1 lần duy nhất khi tạo draw. Ticket/entry lấy từ đây.
   */
  financialDate: ISODateString;

  /** Kết quả kỳ quay. */
  result?: DrawResult;

  /** Phân tích tài chính kỳ quay. */
  financial?: DrawFinancial;

  /** Thống kê vận hành. */
  stats?: DrawStats;

  /** Thông tin khi kỳ quay bị huỷ. */
  voidInfo?: DrawVoidInfo;

  /** Tổng kết void flow (entries refund). */
  voidSummary?: DrawVoidSummary;

  // ───── Timestamps ─────

  createdAt: Date;
  updatedAt: Date;
}

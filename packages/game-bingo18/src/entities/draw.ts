/**
 * Bingo 18 – Draw Document
 *
 * Collection: bingo18_draws
 *
 * 1 document = 1 kỳ quay Bingo 18.
 * Bingo 18 quay mỗi 6 phút, từ 06:00 đến 21:53.
 *
 * Kết quả: 3 số từ {1, 2, 3, 4, 5, 6}.
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type { ISODateString } from "./types";

// ─────────────────────────────────────────────
// Draw Document
// ─────────────────────────────────────────────

export interface DrawDoc {
  /** MongoDB document ID. */
  _id: unknown;

  /**
   * ID kỳ quay, unique + stable.
   * Format: "YYYY-MM-DD.NNN" (NNN = draw sequence).
   */
  drawId: string;

  /** Ngày quay theo lịch, format "YYYY-MM-DD". Dùng để phân vùng + truy vấn. */
  drawDate: ISODateString;

  /** Số thứ tự kỳ quay trong ngày (1-based). Kết hợp drawDate tạo ra drawId. */
  drawNo: number;

  /** Thời điểm quay chính xác. Xác định bởi lịch quay (06:00–21:53, mỗi 6 phút). */
  drawTime: Date;

  /**
   * Trạng thái vận hành kỳ quay.
   * Luồng: scheduled → sales_open → sales_closed → published → settled.
   */
  status: DrawStatus;

  // ───── Sales Window ─────

  /** Cửa sổ bán vé cho kỳ quay. */
  sales: {
    /** Thời điểm bắt đầu bán vé. undefined nếu chưa mở bán. */
    openAt?: Date;
    /** Thời điểm đóng bán = drawTime - salesCloseBeforeSeconds (từ global config). */
    closeAt: Date;
  };

  // ───── Vietlott Reference ─────

  /** Tham chiếu kỳ quay Vietlott tương ứng (nếu liên kết). */
  vietlottRef?: {
    /** Mã kỳ quay Vietlott. */
    drawPeriod: string;
    /** Ngày quay Vietlott, format "YYYY-MM-DD". */
    drawDate: ISODateString;
  };

  // ───── Financial Date ─────

  /** Ngày tài chính, dùng cho báo cáo. Thường = drawDate. */
  financialDate: ISODateString;

  // ───── Result ─────

  /**
   * Kết quả kỳ quay: 3 số từ {1,2,3,4,5,6}.
   * Set khi status chuyển sang "published".
   */
  result?: {
    /** 3 số kết quả (không sorted, giữ nguyên thứ tự quay). */
    numbers: number[];

    /** Tổng 3 số quay (3-18). Dùng để xác định side bet thắng/thua. */
    sum: number;

    /** Thời điểm công bố kết quả. Set bởi admin hoặc hệ thống tự động. */
    publishedAt: Date;
  };

  // ───── Financial Breakdown (sau settle) ─────

  /**
   * Phân tích tài chính kỳ quay. Set sau khi settle hoàn tất.
   * Tính bởi `calculateBingo18DrawFinancials()`.
   */
  financial?: {
    /** Tổng doanh thu = Σ(entry.amount) cho tất cả entries trong kỳ. */
    totalRevenue: number;
    /** Tổng tiền thưởng = Σ(entry.payout.winAmount) cho tất cả entries thắng. */
    totalPrizes: number;
    /** Hoa hồng đại lý = Σ(tenant.revenue × tenant.commissionRate). */
    totalAgentCommission: number;
    /** Phần công ty = totalRevenue × companyRate (từ global config). */
    companyTake: number;
  };

  // ───── Operational Stats ─────

  /** Thống kê vận hành kỳ quay. Cập nhật realtime khi có entry mới hoặc payout. */
  stats?: {
    /** Tổng entries tham gia kỳ quay. Mỗi ticket cho 1 entry per draw. */
    ticketEntryCount: number;
    /** Tổng doanh thu bán vé = Σ(entry.amount). Cập nhật khi entry được tạo. */
    totalSalesAmount: number;
    /** Tổng tiền đã trả = Σ(entry.payout.payoutAmount). Set sau dispatch payout. */
    totalPayoutAmount?: number;
  };

  // ───── Void Info ─────

  /**
   * Thông tin huỷ kỳ quay. Set khi admin huỷ kỳ quay (status → voided).
   * Khi void, tất cả entries sẽ được refund.
   */
  voidInfo?: {
    /** Lý do huỷ kỳ quay, do admin nhập. */
    reason: string;
    /** ID admin thực hiện void. undefined nếu void bởi hệ thống tự động. */
    voidedBy?: string;
    /** Thời điểm thực hiện void. */
    voidedAt: Date;
  };

  /**
   * Tổng hợp kết quả void sau khi refund toàn bộ entries hoàn tất.
   * Set sau khi tất cả refund đã dispatch thành công.
   */
  voidSummary?: {
    /** Tổng entries đã bị void trong kỳ. */
    totalVoidedEntries: number;
    /** Tổng tiền cược gốc của các entries bị void = Σ(entry.amount). */
    totalOriginalAmount: number;
    /** Tổng tiền đã hoàn trả = Σ(entry.voidInfo.refundAmount). Bingo 18 hoàn 100%. */
    totalRefundAmount: number;
    /** Thời điểm hoàn tất refund entry cuối cùng. */
    completedAt: Date;
  };

  // ───── Timestamps ─────

  /** Thời điểm tạo kỳ quay. Set 1 lần khi tạo document, không đổi. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. Tự động cập nhật mỗi khi document thay đổi. */
  updatedAt: Date;
}

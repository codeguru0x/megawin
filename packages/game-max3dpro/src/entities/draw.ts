/**
 * Max 3D Pro – Draw Document
 *
 * Collection: max3d_pro_draws
 *
 * 1 document = 1 kỳ quay thưởng.
 * Max 3D Pro quay 3 lần/tuần (T3, T5, T7) lúc 18h00.
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type { ISODateString, DrawNo } from "./types";
import type { Max3dproDrawResult } from "./draw-result";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Cửa sổ bán vé. */
export interface DrawSales {
  /** Thời điểm mở bán. undefined nếu chưa mở. */
  openAt?: Date;
  /** Thời điểm đóng bán = drawTime - salesCloseBeforeMinutes. */
  closeAt: Date;
}

/** Tham chiếu đến kỳ quay Vietlott tương ứng. */
export interface DrawVietlottRef {
  /** Mã kỳ quay Vietlott (ví dụ: "00123"). */
  drawPeriod: string;
  /** Ngày quay Vietlott "YYYY-MM-DD". */
  drawDate: ISODateString;
  /** Phiên quay trong ngày (thường = 1). */
  drawSession: number;
}

/** Dữ liệu tài chính kỳ quay, tính sau khi settle. */
export interface DrawFinancial {
  /** Tổng doanh thu = Σ(entry.amount) = totalLines × unitPrice. */
  totalRevenue: number;
  /** Tổng tiền thưởng cố định = Σ(entry.payout.winAmount). */
  totalFixedPrizes: number;
  /** Hoa hồng đại lý = Σ(tenant.revenue × tenant.commissionRate). */
  totalAgentCommission: number;
  /** = profit cho games không có Jackpot. */
  companyTake: number;
}

/** Thống kê tổng hợp kỳ quay. */
export interface DrawStats {
  /** Tổng entries tham gia. */
  ticketEntryCount: number;
  /** Tổng cặp (pairs) = Σ(entry.lineCount). Mỗi pair = 1 lần dự thưởng. */
  totalLineCount: number;
  /** Tổng doanh thu = totalLineCount × unitPrice. */
  totalSalesAmount: number;
  /** Tổng tiền đã trả. Set sau dispatch payout. */
  totalPayoutAmount?: number;
}

/** Thông tin huỷ kỳ quay (nếu bị void). */
export interface DrawVoidInfo {
  /** Lý do huỷ kỳ quay. */
  reason: string;
  /** Người thực hiện huỷ (admin userId). */
  voidedBy?: string;
  /** Thời điểm huỷ. */
  voidedAt: Date;
}

/** Tổng kết hoàn tiền sau khi void kỳ quay. */
export interface DrawVoidSummary {
  /** Tổng entries bị void. */
  totalVoidedEntries: number;
  /** Tổng tiền cược gốc của các entries bị void. */
  totalOriginalAmount: number;
  /** Tổng tiền hoàn trả cho người chơi. */
  totalRefundAmount: number;
  /** Thời điểm hoàn tất xử lý void. */
  completedAt: Date;
}

// ─────────────────────────────────────────────
// Draw Document
// ─────────────────────────────────────────────

export interface DrawDoc {
  _id: unknown;

  /** ID kỳ quay, unique. Format: "YYYY-MM-DD.NNN". */
  drawId: string;

  /** Ngày quay "YYYY-MM-DD". */
  drawDate: ISODateString;

  /** Ngày tài chính dùng cho báo cáo. Thường = drawDate. */
  financialDate: ISODateString;

  /** Số thứ tự kỳ quay trong ngày (luôn = 1 cho Max 3D Pro). */
  drawNo: DrawNo;

  /** Thời điểm quay chính xác (18h00 T3/T5/T7). */
  drawTime: Date;

  /** Trạng thái: scheduled → salesOpen → salesClosed → published → settling → settled. */
  status: DrawStatus;

  sales: DrawSales;

  vietlottRef?: DrawVietlottRef;

  /** Kết quả quay thưởng, có sau khi publish. */
  result?: Max3dproDrawResult & {
    /** Thời điểm công bố kết quả. */
    publishedAt: Date;
  };

  financial?: DrawFinancial;

  stats?: DrawStats;

  voidInfo?: DrawVoidInfo;

  voidSummary?: DrawVoidSummary;

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối. */
  updatedAt: Date;
}

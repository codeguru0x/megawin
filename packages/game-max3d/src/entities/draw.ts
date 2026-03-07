/**
 * Max 3D – Draw Document
 *
 * Collection: max3d_draws
 *
 * 1 document = 1 kỳ quay thưởng.
 * Max 3D quay 3 lần/tuần (T2, T4, T6) lúc 18h00.
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type { ISODateString, DrawNo } from "./types";
import type { Max3dDrawResult } from "./draw-result";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Cửa sổ bán vé. */
export interface DrawSales {
  /** Thời điểm mở bán. undefined nếu chưa mở. */
  openAt?: Date;
  /** Thời điểm đóng bán = drawTime − salesCloseBeforeMinutes. */
  closeAt: Date;
}

/** Tham chiếu kỳ quay Vietlott chính thức. */
export interface DrawVietlottRef {
  /** Mã kỳ quay Vietlott. */
  drawPeriod: string;
  /** Ngày quay theo Vietlott. */
  drawDate: ISODateString;
  /** Phiên quay (1 = duy nhất trong ngày). */
  drawSession: number;
}

/** Tổng hợp tài chính kỳ quay. Set khi settle. */
export interface DrawFinancial {
  /** Tổng doanh thu = Σ(entry.amount). */
  totalRevenue: number;
  /** Tổng tiền thưởng cố định = Σ(entry.payout.winAmount). */
  totalFixedPrizes: number;
  /** Hoa hồng đại lý = Σ(tenant.revenue × tenant.commissionRate). */
  totalAgentCommission: number;
  /**
   * Phần công ty thực tế = min(companyTakeMax, remaining after prizes & commission).
   * remaining = totalRevenue − totalFixedPrizes − totalAgentCommission.
   */
  companyTake: number;
  /** Tỷ lệ phần trăm công ty (snapshot từ config). */
  companyTakeRate: number;
  /** Giá trị tối đa company take = companyTakeRate × totalRevenue. */
  companyTakeMax: number;
}

/** Thống kê kỳ quay. Cập nhật realtime khi có entry mới. */
export interface DrawStats {
  /** Tổng entries tham gia kỳ quay. */
  ticketEntryCount: number;
  /** Tổng lines = Σ(entry.lineCount). Mỗi line = 1 lần dự thưởng. */
  totalLineCount: number;
  /** Tổng doanh thu = Σ(entry.amount). */
  totalSalesAmount: number;
  /** Tổng tiền đã trả. Set sau dispatch payout. */
  totalPayoutAmount?: number;
}

/** Thông tin huỷ kỳ quay. Set khi void draw. */
export interface DrawVoidInfo {
  /** Lý do huỷ kỳ quay. */
  reason: string;
  /** ID người thực hiện huỷ (admin). */
  voidedBy?: string;
  /** Thời điểm huỷ. */
  voidedAt: Date;
}

/** Tổng hợp sau khi hoàn tất void tất cả entries. */
export interface DrawVoidSummary {
  /** Tổng entries đã bị void. */
  totalVoidedEntries: number;
  /** Tổng tiền gốc của các entries bị void = Σ(entry.amount). */
  totalOriginalAmount: number;
  /** Tổng tiền hoàn trả = Σ(entry.voidInfo.refundAmount). */
  totalRefundAmount: number;
  /** Thời điểm hoàn tất void toàn bộ entries. */
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

  /** Ngày tài chính, dùng cho báo cáo. Thường = drawDate. */
  financialDate: ISODateString;

  /** Số thứ tự kỳ quay trong ngày (luôn = 1 cho Max 3D). */
  drawNo: DrawNo;

  /** Thời điểm quay chính xác (18h00 T2/T4/T6). */
  drawTime: Date;

  /** Trạng thái vận hành: scheduled → salesOpen → salesClosed → published → settling → settled. */
  status: DrawStatus;

  sales: DrawSales;

  vietlottRef?: DrawVietlottRef;

  /** Kết quả quay thưởng. Set khi publish result. */
  result?: Max3dDrawResult & {
    /** Thời điểm publish kết quả. */
    publishedAt: Date;
  };

  financial?: DrawFinancial;

  stats?: DrawStats;

  voidInfo?: DrawVoidInfo;

  voidSummary?: DrawVoidSummary;

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất. */
  updatedAt: Date;
}

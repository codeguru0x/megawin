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
}

/**
 * Kết quả kỳ quay đã công bố. Set khi publish result.
 *
 * Extends Max3dDrawResult với publishedAt timestamp.
 * Ghi vào DrawDoc.result khi staff publish kết quả trên backoffice.
 * Copy sang entry.result khi settle.
 */
export interface DrawResult extends Max3dDrawResult {
  /** Thời điểm công bố kết quả trên backoffice. */
  publishedAt: Date;
}

/** Tổng hợp tài chính kỳ quay. Set khi settle. */
export interface DrawFinancial {
  /** Tổng doanh thu = Σ(entry.amount). */
  totalRevenue: number;
  /** Tổng tiền thưởng cố định = Σ(entry.payout.winAmount). */
  totalFixedPrizes: number;
  /** Hoa hồng đại lý = Σ(entry.tenant.commissionAmount). */
  totalAgentCommission: number;
  /**
   * Lợi nhuận công ty thu về (VND).
   * Công thức: totalRevenue - totalFixedPrizes - totalAgentCommission.
   * Max 3D KHÔNG có Jackpot → công ty thu toàn bộ phần còn lại.
   * Có thể ÂM nếu giải thưởng vượt doanh thu kỳ đó.
   */
  companyTake: number;
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

/**
 * Chi tiết giải thưởng 1 hạng trong kỳ quay — denormalized cho API player.
 *
 * Ghi vào DrawDoc.settleSummary bởi CalculateFinancials khi settle hoàn tất.
 */
export interface DrawSettleSummaryTier {
  /** Hạng giải (giá trị từ BasicPrizeTier hoặc PlusPrizeTier). */
  tier: string;
  /** Tổng số lượt trúng hạng này (Σ hitCount từ tất cả entries). */
  winnerCount: number;
  /** Tổng tiền thưởng hạng này (VND). = Σ(entry.payout.tiers[tier].amount). */
  prizeAmount: number;
}

/**
 * Tổng kết bảng giải thưởng kỳ quay — denormalized cho API player.
 *
 * Ghi vào DrawDoc.settleSummary bởi CalculateFinancials (step 4 settle pipeline).
 * Tách riêng 2 bảng: basic (4 hạng) và plus (7 hạng) — tương ứng 2 tab hiển thị Vietlott.
 * BasicPrizeTier và PlusPrizeTier có 4 tier trùng tên nhưng giá trị giải thưởng khác nhau,
 * nên KHÔNG được gộp chung vào 1 mảng.
 * Mọi tier luôn có mặt kể cả winnerCount = 0 để API player luôn trả đủ bảng giải.
 */
export interface DrawSettleSummary {
  /** Bảng giải thưởng Max 3D Cơ Bản (4 hạng: special, first, second, third). */
  basicTiers: DrawSettleSummaryTier[];
  /** Bảng giải thưởng Max 3D+ (7 hạng: special, first, second, third, fourth, fifth, sixth). */
  plusTiers: DrawSettleSummaryTier[];
}

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
  result?: DrawResult;

  financial?: DrawFinancial;

  stats?: DrawStats;

  /**
   * Tổng kết bảng giải thưởng kỳ quay — denormalized cho API player.
   *
   * Ghi bởi CalculateFinancials (step 4 trong settle pipeline) sau khi tất cả entries settled.
   * Dùng bởi GetDrawResultPlayerUseCase để trả bảng giải thưởng — 1 DB call, không join entries.
   */
  settleSummary?: DrawSettleSummary;

  voidInfo?: DrawVoidInfo;

  voidSummary?: DrawVoidSummary;

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất. */
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface DrawEntity extends Omit<DrawDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}

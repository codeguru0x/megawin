/**
 * Max 3D Pro – Draw Document
 *
 * Collection: max3d_pro_draws
 *
 * 1 document = 1 kỳ quay thưởng.
 * Max 3D Pro quay 3 lần/tuần (T3, T5, T7) lúc 18h00.
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type { DrawSales, DrawVietlottRef } from "@megawin/game-core/types";
import type { ISODateString, DrawNo } from "./types";
import type { Max3dproDrawResult } from "./draw-result";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

export type { DrawSales, DrawVietlottRef };

/**
 * Kết quả kỳ quay đã công bố. Set khi publish result.
 *
 * Extends Max3dproDrawResult với publishedAt timestamp.
 * Thứ tự 2 bộ ĐB (special[0]/special[1]) có ý nghĩa:
 * phân biệt Giải ĐB (đúng thứ tự) và Giải phụ ĐB (ngược thứ tự).
 * Ghi vào DrawDoc.result khi staff publish kết quả trên backoffice.
 * Copy sang entry.result khi settle.
 */
export interface DrawResult extends Max3dproDrawResult {
  /** Thời điểm công bố kết quả trên backoffice. */
  publishedAt: Date;
}

/** Dữ liệu tài chính kỳ quay, tính sau khi settle. */
export interface DrawFinancial {
  /** Tổng doanh thu = Σ(entry.amount) = totalLines × unitPrice. */
  totalRevenue: number;
  /** Tổng tiền thưởng cố định = Σ(entry.payout.winAmount). */
  totalFixedPrizes: number;
  /** Hoa hồng đại lý = Σ(entry.tenant.commissionAmount). */
  totalAgentCommission: number;
  /**
   * Lợi nhuận công ty thu về (VND).
   * Công thức: totalRevenue - totalFixedPrizes - totalAgentCommission.
   * Max 3D Pro KHÔNG có Jackpot → công ty thu toàn bộ phần còn lại.
   * Có thể ÂM nếu giải thưởng vượt doanh thu kỳ đó.
   */
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

/**
 * Chi tiết giải thưởng 1 hạng trong kỳ quay — denormalized cho API player.
 *
 * Ghi vào DrawDoc.settleSummary bởi CalculateFinancials khi settle hoàn tất.
 */
export interface DrawSettleSummaryTier {
  /** Hạng giải (giá trị từ PrizeTier Max 3D Pro). */
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
 * Đủ 8 tiers (special → sixth) kể cả winnerCount = 0.
 */
export interface DrawSettleSummary {
  /** Bảng giải thưởng theo từng hạng. */
  tiers: DrawSettleSummaryTier[];
}

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

  /**
   * Thời điểm kết sổ thành công lần gần nhất (high-water mark).
   *
   * Dùng để phân biệt "Settle lần đầu" vs "Resettle":
   * - `null/undefined` → chưa từng settle. UI hiện nút "Kết sổ" (trigger-settle).
   * - `>= result.publishedAt` → đã settle, không có republish mới. Không hiện nút.
   * - `< result.publishedAt` → có republish mới sau lần settle gần nhất. UI hiện
   *   nút "Kết sổ lại" (trigger-resettle).
   *
   * Set bởi `FinalizeSettle` mỗi khi settle complete — overwrite cả lần đầu lẫn
   * resettle (luôn = thời điểm settle gần nhất).
   *
   * KHÔNG bị $unset khi `republishResultAfterSettled` — đây là high-water mark
   * lịch sử settle, dùng để phân biệt với draw chưa từng settle.
   */
  settledAt?: Date;

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối. */
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface DrawEntity extends Omit<DrawDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}

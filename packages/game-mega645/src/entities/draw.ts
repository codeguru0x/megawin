/**
 * Mega 6/45 – Draw Document
 *
 * Collection: mega645Draws
 *
 * 1 document = 1 kỳ mở thưởng.
 * Game quay 3 lần/tuần (Thứ 4, Thứ 6, Chủ nhật) lúc 18:00.
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type { DrawSales, DrawVietlottRef } from "@megawin/game-core/types";

import type { DrawNo, ISODateString } from "./types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

export type { DrawSales, DrawVietlottRef };

/**
 * Kết quả kỳ quay.
 * Mega 6/45: chỉ có 6 số chính, KHÔNG có bonus/special number.
 */
export interface DrawResult {
  /**
   * 6 số trúng thưởng theo thứ tự quay gốc (không sort).
   *
   * Thứ tự quay gốc phải được bảo toàn để hiển thị đúng với kết quả Vietlott công bố.
   * Lưu dạng string[] (zero-padded "01"-"45") — dùng trực tiếp từ MongoDB, tránh cast.
   */
  winningNumbers: string[];
  /** Thời điểm công bố kết quả. */
  publishedAt: Date;
}

/**
 * Snapshot Jackpot tại kỳ quay, được ghi khi settle.
 * Mega 6/45: Jackpot chỉ tích luỹ hoặc trao cho winner, không có split.
 */
export interface DrawJackpotSnapshot {
  /** Giá trị Jackpot đầu kỳ (VND). */
  openingAmount: number;
  /**
   * Giá trị quỹ Jackpot cuối kỳ (VND).
   * LUÔN = openingAmount + jackpotContribution, bất kể có winner hay không.
   * Khi trace chuỗi draws: closing kỳ này ≠ opening kỳ sau → có winner hoặc cycle reset.
   */
  closingAmount: number;
}

/** Bảng phân tích tài chính kỳ quay, được tính khi settle. */
export interface DrawFinancial {
  /**
   * Tổng doanh thu bán vé (VND).
   * Công thức: Σ(entry.amount) cho tất cả entry trong kỳ.
   */
  totalRevenue: number;
  /**
   * Tổng giải thưởng cố định đã trả (VND).
   * Bao gồm tier1 + tier2 + tier3 (không bao gồm Jackpot).
   */
  totalFixedPrizes: number;
  /**
   * Tổng hoa hồng đại lý (VND).
   * Công thức: Σ(entry.tenant.commissionAmount).
   */
  totalAgentCommission: number;
  /**
   * Phần thu nhập công ty trên lý thuyết (VND).
   * Công thức: round(totalRevenue × companyTakeRate).
   */
  companyTake: number;
  /** Tỷ lệ thu nhập công ty (ví dụ: 0.15 = 15%). */
  companyTakeRate: number;
  /**
   * Mức công ty thực thu (VND) — sau khi cap bởi số dư.
   * Công thức: min(companyTake, max(totalRevenue - totalFixedPrizes - totalAgentCommission, 0)).
   */
  actualCompanyTake: number;
  /**
   * Phần đóng góp vào quỹ Jackpot (VND).
   * Công thức: max(totalRevenue - totalFixedPrizes - totalAgentCommission - actualCompanyTake, 0).
   */
  jackpotContribution: number;
}

/** Thống kê kỳ quay. */
export interface DrawStats {
  /** Tổng số entry tham gia kỳ quay. */
  ticketEntryCount: number;
  /** Tổng số line (bao gồm cả lines từ bao). */
  totalLineCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalSalesAmount: number;
  /** Tổng tiền trả thưởng (VND). Chỉ có sau khi settle. */
  totalPayoutAmount?: number;
}

/** Thông tin huỷ kỳ quay (nếu bị void). */
export interface DrawVoidInfo {
  /** Lý do huỷ. */
  reason: string;
  /** Người thực hiện huỷ (user ID hoặc "system"). */
  voidedBy?: string;
  /** Thời điểm huỷ. */
  voidedAt: Date;
}

/**
 * Chi tiết giải thưởng 1 tier trong kỳ quay (denormalized cho player API).
 * Ghi vào DrawDoc.settleSummary.tiers khi settle hoàn tất.
 */
export interface DrawSettleSummaryTier {
  /**
   * Hạng giải: "jackpot" (6/6), "tier1" (5/6), "tier2" (4/6), "tier3" (3/6).
   * Dùng PrizeTier constants từ enums.ts.
   */
  tier: string;
  /** Số người trúng hạng này (winnerCount = tổng line trúng, không phải người). */
  winnerCount: number;
  /**
   * Tổng tiền thưởng tier này (VND).
   * Jackpot = 0 tại CalculateFinancials; FinalizeSettle patch lại sau khi biết pool.
   */
  prizeAmount: number;
}

/**
 * Tóm tắt kết quả settle kỳ quay — denormalized cho player API.
 *
 * Ghi vào DrawDoc.settleSummary bởi CalculateFinancials (step 3 settle pipeline).
 * FinalizeSettle cập nhật prizeAmount tier Jackpot sau khi biết pool chính xác.
 *
 * Dùng bởi GetDrawResultPlayerUseCase để trả bảng giải thưởng cho player —
 * 1 DB call duy nhất (không cần aggregate từ entries).
 */
export interface DrawSettleSummary {
  /**
   * Bảng giải thưởng chi tiết theo từng hạng.
   * Tất cả 4 tiers luôn có mặt (kể cả winnerCount = 0).
   */
  tiers: DrawSettleSummaryTier[];
}

/** Tổng kết xử lý hoàn tiền sau khi void kỳ quay. */
export interface DrawVoidSummary {
  /** Số lượng entry bị void. */
  totalVoidedEntries: number;
  /** Tổng số tiền gốc của các entry bị void (VND). */
  totalOriginalAmount: number;
  /** Tổng số tiền hoàn trả (VND). */
  totalRefundAmount: number;
  /** Thời điểm hoàn tất xử lý void. */
  completedAt: Date;
}

// ─────────────────────────────────────────────
// Draw Document
// ─────────────────────────────────────────────

export interface DrawDoc {
  /** MongoDB document ID. */
  _id: unknown;

  /**
   * ID kỳ quay, unique + stable.
   * Format: "YYYY-MM-DD.001" (Mega 6/45 chỉ quay 1 kỳ/ngày).
   */
  drawId: string;

  /** Ngày quay "YYYY-MM-DD". */
  drawDate: ISODateString;

  /** Ngày tài chính "YYYY-MM-DD". Dùng để gom kết quả tài chính theo ngày. */
  financialDate: ISODateString;

  /** Số thứ tự kỳ quay trong ngày (luôn = 1 cho Mega 6/45). */
  drawNo: DrawNo;

  /** Thời điểm quay chính xác. */
  drawTime: Date;

  /** Trạng thái vận hành. */
  status: DrawStatus;

  /** Cửa sổ bán vé cho kỳ quay. */
  sales: DrawSales;

  /** Thông tin tham chiếu kỳ quay Vietlott. */
  vietlottRef?: DrawVietlottRef;

  /** Kết quả kỳ quay. */
  result?: DrawResult;

  /** Snapshot Jackpot tại kỳ quay, ghi khi settle. */
  jackpot?: DrawJackpotSnapshot;

  /** Bảng phân tích tài chính kỳ quay. */
  financial?: DrawFinancial;

  /** Thống kê kỳ quay. */
  stats?: DrawStats;

  /**
   * Tóm tắt kết quả settle — denormalized cho player API.
   * Ghi bởi CalculateFinancials, patch Jackpot bởi FinalizeSettle.
   * Giúp player API chỉ cần 1 DB call, không aggregate từ entries.
   */
  settleSummary?: DrawSettleSummary;

  /** Thông tin huỷ kỳ quay (nếu bị void). */
  voidInfo?: DrawVoidInfo;

  /** Tổng kết xử lý hoàn tiền sau khi void. */
  voidSummary?: DrawVoidSummary;

  /**
   * Thời điểm kết sổ thành công (high-water mark).
   *
   * Set bởi `FinalizeSettle` khi settle complete. Đánh dấu kỳ đã được kết sổ —
   * dùng để chặn gọi `trigger-settle` lặp lại trên kỳ đã settle. Với resettle:
   * `$unset` trong `republishResultAfterSettled` (đưa kỳ về Published để settle
   * lại), re-set khi settle lại thành công.
   */
  settledAt?: Date;

  // ───── Timestamps ─────

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. */
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface DrawEntity extends Omit<DrawDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}

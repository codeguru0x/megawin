/**
 * Power 6/55 – Draw Entity (Kỳ quay mở thưởng)
 *
 * Mỗi document đại diện cho 1 kỳ quay số mở thưởng Power 6/55.
 * Quay vào thứ 3, thứ 5, thứ 7 hàng tuần, bắt đầu từ 18h00.
 * Mỗi ngày quay chỉ có 1 kỳ (drawNo = 1).
 *
 * Lifecycle (DrawStatus từ game-core):
 *   scheduled → salesOpen ⇄ salesClosed → published → settling → settled
 *      ↘ void      ↘ void      ↘ void       ↘ void
 *
 * Kết quả quay: 6 số chính (01-55) + 1 bonus number (từ 49 còn lại).
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type { DrawTenantFinancial } from "@megawin/game-core/types";
import type { MainTuple, BonusNumber, ISODateString, DrawNo } from "./types";

/**
 * Kết quả kỳ quay.
 * Ghi nhận sau khi staff nhập kết quả hoặc import từ Vietlott.
 */
export interface DrawResult {
  /** 6 số chính trúng thưởng, sorted ascending. */
  winningMain: MainTuple;
  /** Số đặc biệt (bonus number) – quay từ 49 quả bóng còn lại sau khi rút 6. */
  bonusNumber: BonusNumber;
  /** Thời điểm công bố kết quả. */
  publishedAt: Date;
}

/**
 * Thời gian mở/đóng bán vé cho kỳ quay.
 * closeAt thường = drawTime - salesCloseBeforeMinutes (15 phút).
 */
export interface DrawSales {
  /** Thời điểm bắt đầu mở bán. Staff nhấn "Mở bán" để chuyển sang salesOpen. */
  openAt: Date;
  /** Thời điểm đóng bán. Tự động hoặc staff nhấn "Đóng bán". */
  closeAt: Date;
}

/**
 * Snapshot Jackpot tại kỳ quay này.
 * Ghi nhận sau khi settle xong – dùng cho báo cáo và audit.
 */
export interface DrawJackpot {
  /** Giá trị JP1 đầu kỳ (trước khi cộng tích luỹ kỳ này). */
  openingJackpot1: number;
  /** Giá trị JP1 cuối kỳ. LUÔN = openingJackpot1 + jackpot1Contribution. */
  closingJackpot1: number;
  /** Giá trị JP2 đầu kỳ. */
  openingJackpot2: number;
  /** Giá trị JP2 cuối kỳ. LUÔN = openingJackpot2 + jackpot2Contribution. */
  closingJackpot2: number;
}

/**
 * Tổng kết tài chính kỳ quay.
 *
 * Công thức (tương tự Lotto 5/35):
 *   Tích luỹ = Revenue(100%) - FixedPrizes - Commission(20%) - Company(15%)
 *   JP1 += tích luỹ × 90%
 *   JP2 += tích luỹ × 10%
 *   Overflow: phần JP1 vượt 300 tỷ → chuyển sang JP2.
 */
export interface DrawFinancial {
  /** Tổng doanh thu bán vé (100% tiền cược). */
  totalRevenue: number;
  /** Tổng tiền giải cố định phải trả (Nhất + Nhì + Ba). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (~ 20% revenue). */
  totalAgentCommission: number;
  /** Công ty thu về dự kiến (15% × revenue). */
  companyTake: number;
  /** Công ty thu về thực tế (≤ companyTake, giới hạn bởi số dư). */
  actualCompanyTake: number;
  /** Tiền tích luỹ cộng vào Jackpot 1 (sau overflow). */
  jackpot1Contribution: number;
  /** Tiền tích luỹ cộng vào Jackpot 2 (bao gồm phần overflow từ JP1). */
  jackpot2Contribution: number;
  /** Phần JP1 vượt ngưỡng (300 tỷ) chuyển sang JP2 (0 nếu không overflow). */
  jp1Overflow: number;
  /** Chi tiết tài chính theo từng tenant/đại lý. */
  tenantBreakdown: DrawTenantFinancial[];
}

/**
 * Thống kê kỳ quay sau settle.
 * Dùng cho dashboard và báo cáo.
 */
export interface DrawStats {
  /** Tổng số entry tham gia kỳ quay. */
  ticketEntryCount: number;
  /** Tổng số line (bộ số) đã expand và match. */
  totalLineCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalSalesAmount: number;
  /** Tổng tiền thưởng phải trả (cố định + jackpot) (VND). Chỉ có sau khi settle. */
  totalPayoutAmount?: number;
}

/**
 * Thông tin kỳ quay bị huỷ (void).
 * Ghi nhận khi admin void kỳ quay – entries được hoàn tiền.
 */
export interface DrawVoidSummary {
  /** Lý do huỷ kỳ quay. */
  reason: string;
  /** Người thực hiện void (admin ID). */
  voidedBy?: string;
  /** Thời điểm void. */
  voidedAt: Date;
  /** Tổng entries bị void. */
  totalEntriesVoided: number;
  /** Tổng tiền cần hoàn. */
  totalRefundAmount: number;
  /** Số entries đã gửi lệnh hoàn thành công. */
  totalRefundDispatched: number;
  /** Số entries gửi lệnh hoàn thất bại. */
  totalRefundFailed: number;
}

/**
 * Tham chiếu đến kỳ quay Vietlott chính thức.
 * Dùng để đối soát kết quả và audit.
 */
export interface DrawVietlottRef {
  /** Mã kỳ quay Vietlott (VD: "00123"). */
  drawPeriod: string;
  /** Ngày quay Vietlott "YYYY-MM-DD". */
  drawDate: ISODateString;
}

/**
 * Chi tiết giải thưởng 1 hạng trong kỳ quay.
 *
 * Ghi vào DrawDoc.settleSummary.tiers khi settle hoàn tất.
 * Power 6/55 có 5 hạng: jackpot1 (6/6), jackpot2 (5/6+bonus),
 * tier1 (5/6), tier2 (4/6), tier3 (3/6).
 */
export interface DrawSettleSummaryTier {
  /**
   * Hạng giải — giá trị từ PrizeTier enum.
   * "jackpot1" | "jackpot2" | "tier1" | "tier2" | "tier3"
   */
  tier: string;
  /** Số lượt trúng hạng này (tổng hit count từ tất cả entries, không phải số người). */
  winnerCount: number;
  /**
   * Tổng tiền thưởng hạng này (VND).
   * jackpot1/jackpot2: = 0 tại CalculateFinancials, FinalizeSettle patch sau khi biết pool.
   * tier1/tier2/tier3: = Σ(entry.payout.tiers[tier].amount) aggregate từ entries.
   */
  prizeAmount: number;
}

/**
 * Tổng kết bảng giải thưởng kỳ quay — denormalized cho API player.
 *
 * Ghi vào DrawDoc.settleSummary bởi CalculateFinancials (step 3 settle pipeline).
 * FinalizeSettle patch prizeAmount cho jackpot1/jackpot2 sau khi biết pool chính xác.
 *
 * Dùng bởi GetDrawResultPlayerUseCase để trả bảng giải thưởng —
 * 1 DB call duy nhất, không cần aggregate từ entries.
 */
export interface DrawSettleSummary {
  /**
   * Bảng giải thưởng chi tiết theo từng hạng.
   * Tất cả 5 tiers luôn có mặt (kể cả winnerCount = 0).
   * Thứ tự: jackpot1, jackpot2, tier1, tier2, tier3.
   */
  tiers: DrawSettleSummaryTier[];
}

/**
 * MongoDB document cho kỳ quay Power 6/55.
 * Collection: power655_draws.
 */
export interface DrawDoc {
  /** MongoDB ObjectId – khóa chính nội bộ. Không dùng trong business logic. */
  _id: unknown;
  /** Mã kỳ quay unique. Format: "YYYY-MM-DD.001". Join key với entries. */
  drawId: string;
  /** Ngày quay format "YYYY-MM-DD" (timezone VN). */
  drawDate: ISODateString;
  /**
   * Ngày tài chính "YYYY-MM-DD".
   * Dùng để gom kết quả tài chính theo ngày.
   * Business rule: ngày tài chính tính từ 11h sáng → 11h sáng hôm sau.
   */
  financialDate: ISODateString;
  /** Số thứ tự kỳ trong ngày. Power 6/55 luôn = 1 (Single). */
  drawNo: DrawNo;
  /** Thời điểm quay chính xác (UTC). */
  drawTime: Date;
  /** Trạng thái lifecycle kỳ quay. Xem DrawStatus từ game-core. */
  status: DrawStatus;
  /** Khung giờ mở/đóng bán vé. */
  sales: DrawSales;
  /** Kết quả quay (chỉ có sau khi published). */
  result?: DrawResult;
  /** Snapshot jackpot (ghi sau settle). */
  jackpot?: DrawJackpot;
  /** Tổng kết tài chính (ghi sau settle). */
  financial?: DrawFinancial;
  /** Thống kê settle (ghi sau settle). */
  stats?: DrawStats;
  /** Tổng kết bảng giải thưởng (ghi sau settle, dùng cho API player). */
  settleSummary?: DrawSettleSummary;
  /** Thông tin void (chỉ có khi status = void). */
  voidSummary?: DrawVoidSummary;
  /** Tham chiếu Vietlott chính thức. */
  vietlottRef?: DrawVietlottRef;
  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất. */
  updatedAt: Date;
}

/** Application layer entity (thay _id bằng string id). */
export interface DrawEntity extends Omit<DrawDoc, "_id"> {
  /** ObjectId dạng hex string – khóa chính dùng trong application layer. */
  id: string;
}

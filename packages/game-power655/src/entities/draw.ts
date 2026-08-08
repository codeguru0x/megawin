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
import type { DrawSales, DrawVietlottRef } from "@megawin/game-core/types";

import type { DrawNo, ISODateString } from "./types";

export type { DrawSales, DrawVietlottRef };

/**
 * Kết quả kỳ quay.
 *
 * Ghi nhận sau khi staff nhập kết quả hoặc import từ Vietlott.
 * Số lưu dạng string zero-padded ("01"-"55"), giữ nguyên thứ tự quay gốc.
 * Không sort ascending — thứ tự quay gốc có giá trị hiển thị cho người chơi.
 */
export interface DrawResult {
  /**
   * 6 số chính trúng thưởng (string zero-padded "01"-"55").
   * Thứ tự quay gốc — không sort ascending.
   * Match engine dùng Set intersection nên không phụ thuộc thứ tự.
   */
  winningMain: string[];
  /**
   * Số bonus — quay từ 49 quả bóng còn lại sau khi rút 6 số chính.
   * Luôn khác tất cả 6 số trong winningMain.
   */
  bonusNumber: string;

  /** Thời điểm công bố kết quả. */
  publishedAt: Date;
}

/**
 * Snapshot Jackpot tại kỳ quay này.
 * Ghi nhận sau khi settle xong — dùng cho báo cáo và audit.
 *
 * closingJackpot1/2 = openingJackpot1/2 + jackpot1/2Contribution.
 * jackpot1Contribution đã trừ jp1Overflow nếu overflow kích hoạt (JP1 cap tại threshold).
 * jackpot2Contribution đã cộng jp1Overflow nếu overflow kích hoạt VÀ có JP2 winner kỳ đó.
 */
export interface DrawJackpot {
  /** Giá trị JP1 đầu kỳ (trước khi cộng tích luỹ kỳ này). */
  openingJackpot1: number;
  /**
   * Giá trị JP1 cuối kỳ = openingJackpot1 + jackpot1Contribution.
   * Nếu JP1 winner: = tổng pool JP1 winner nhận.
   * Nếu overflow (!JP1 winner, có JP2 winner, JP1 > threshold): = threshold (đã cap).
   * Nếu không ai trúng: = opening + contribution đầy đủ (JP1 vượt threshold bình thường).
   */
  closingJackpot1: number;

  /** Giá trị JP2 đầu kỳ (trước khi cộng tích luỹ kỳ này). */
  openingJackpot2: number;

  /**
   * Giá trị JP2 cuối kỳ = openingJackpot2 + jackpot2Contribution.
   * Nếu overflow kích hoạt VÀ JP2 winner: jackpot2Contribution bao gồm jp1Overflow
   *   → closingJackpot2 = tổng pool JP2 winner nhận (opening + rawJp2 + overflow).
   * Nếu roll-over hoặc không có JP2 winner: = opening + rawJp2 bình thường.
   */
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
  /** Công ty thu về dự kiến (round(revenue × companyTakeRate)). */
  companyTake: number;
  /** Tỷ lệ thu nhập công ty theo config (ví dụ: 0.15 = 15%). */
  companyTakeRate: number;
  /** Công ty thu về thực tế (= min(companyTake, max(remain, 0))). */
  actualCompanyTake: number;
  /**
   * Tiền tích luỹ cộng vào Jackpot 1 kỳ này (VND).
   * = round(totalJackpotContribution × jp1Ratio) - jp1Overflow (khi overflow kích hoạt).
   * Nếu có JP1 winner: overflow không kích hoạt; = round(total × jp1Ratio) đầy đủ.
   */
  jackpot1Contribution: number;
  /**
   * Tiền tích luỹ cộng vào Jackpot 2 kỳ này (VND).
   * = totalJackpotContribution - jackpot1Contribution.
   * + jp1Overflow nếu overflow kích hoạt VÀ có JP2 winner (overflow chuyển sang JP2).
   * KHÔNG cộng jp1Overflow nếu overflow kích hoạt nhưng không có JP2 winner.
   */
  jackpot2Contribution: number;
  /**
   * Lượng tiền vượt ngưỡng JP1 (VND) kỳ này.
   * = max(0, jp1CurrentAmount + rawJp1 - jp1OverflowThreshold).
   * Hướng xử lý phụ thuộc vào hasJackpot2Winner lúc settle:
   *   true  → đã cộng vào jackpot2Contribution (trao cho JP2 winner kỳ này).
   *   false → CHƯA cộng vào JP2; FinalizeSettle hoàn về JP1 kỳ tiếp.
   * jp1Overflow = 0 nếu không overflow hoặc có JP1 winner.
   */
  jp1Overflow: number;
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
 * Thông tin huỷ kỳ quay.
 * Ghi nhận khi admin void kỳ quay (status → voiding) – entries sẽ được hoàn tiền.
 */
export interface DrawVoidInfo {
  /** Lý do huỷ kỳ quay, do admin nhập. */
  reason: string;
  /** ID admin thực hiện void. undefined nếu void bởi hệ thống tự động. */
  voidedBy?: string;
  /** Thời điểm thực hiện void. */
  voidedAt: Date;
}

/**
 * Tổng kết hoàn tiền sau khi void kỳ quay hoàn tất.
 * Ghi sau khi FinalizeVoid hoàn tất toàn bộ entries.
 */
export interface DrawVoidSummary {
  /** Tổng entries đã bị void. */
  totalVoidedEntries: number;
  /** Tổng tiền cược gốc của các entries bị void (VND) = Σ(entry.amount). */
  totalOriginalAmount: number;
  /** Tổng tiền hoàn trả cho người chơi (VND) = Σ(entry.voidInfo.refundAmount). */
  totalRefundAmount: number;
  /** Thời điểm hoàn tất xử lý void. */
  completedAt: Date;
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
  /** Thông tin void (ghi khi admin void, chỉ có khi status = voiding/void). */
  voidInfo?: DrawVoidInfo;
  /** Tổng kết void flow (entries refund). Ghi sau FinalizeVoid hoàn tất. */
  voidSummary?: DrawVoidSummary;
  /** Tham chiếu Vietlott chính thức. */
  vietlottRef?: DrawVietlottRef;
  /**
   * Thời điểm kết sổ thành công (high-water mark). Set bởi FinalizeSettle khi
   * settle complete. Đánh dấu kỳ đã được kết sổ — dùng để chặn gọi trigger-settle
   * lặp lại trên kỳ đã settle. Với resettle: $unset trong `republishResultAfterSettled`,
   * re-set khi settle lại thành công.
   */
  settledAt?: Date;
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

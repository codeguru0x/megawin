/**
 * Mega 6/45 – Draw Document
 *
 * Collection: mega645Draws
 *
 * 1 document = 1 kỳ mở thưởng.
 * Game quay 3 lần/tuần (Thứ 4, Thứ 6, Chủ nhật) lúc 18:00.
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type { ISODateString, DrawNo, MainTuple, SplitRatios } from "./types";

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

  // ───── Sales Window ─────

  /** Cửa sổ bán vé cho kỳ quay. */
  sales: {
    /** Thời điểm mở bán (nếu mở thủ công). */
    openAt?: Date;
    /** Thời điểm đóng bán. Thường = drawTime - salesCloseBeforeMinutes. */
    closeAt: Date;
  };

  // ───── Vietlott Reference ─────

  /** Thông tin tham chiếu kỳ quay Vietlott chính thức (dùng để đối soát). */
  vietlottRef?: {
    /** Kỳ quay Vietlott (mã kỳ chính thức). */
    drawPeriod: string;
    /** Ngày quay Vietlott "YYYY-MM-DD". */
    drawDate: ISODateString;
  };

  // ───── Result ─────

  /**
   * Kết quả kỳ quay.
   * Mega 6/45: chỉ có 6 số chính, KHÔNG có bonus/special number.
   */
  result?: {
    /** 6 số trúng thưởng, sorted tăng dần. */
    winningMain: MainTuple;

    /** Thời điểm công bố kết quả. */
    publishedAt: Date;
  };

  // ───── Jackpot (snapshot – ghi khi settle) ─────

  /** Snapshot Jackpot tại kỳ quay, được ghi khi settle. */
  jackpot?: {
    /** Giá trị Jackpot đầu kỳ (VND). */
    openingAmount: number;
    /**
     * Giá trị Jackpot cuối kỳ (VND).
     * Công thức: nếu có người trúng Jackpot → seedAmount + jackpotContribution;
     *            nếu không → openingAmount + jackpotContribution.
     */
    closingAmount: number;
    /** True nếu kỳ này kích hoạt cơ chế chia Jackpot (split cycle). */
    isSplitCycle?: boolean;
    /** Chi tiết chia Jackpot (chỉ có khi isSplitCycle = true). */
    split?: DrawSplit;
  };

  // ───── Financial Breakdown ─────

  /** Bảng phân tích tài chính kỳ quay, được tính khi settle. */
  financial?: {
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
     * Công thức: totalRevenue × companyTakeRate.
     */
    companyTake: number;
    /** Tỷ lệ thu nhập công ty (ví dụ: 0.15 = 15%). */
    companyTakeRate: number;
    /**
     * Mức trần thu nhập công ty (VND).
     * Công thức: min(companyTake, max(totalRevenue - totalFixedPrizes - totalAgentCommission, 0)).
     */
    companyTakeMax: number;
    /**
     * Phần đóng góp vào quỹ Jackpot (VND).
     * Công thức: max(totalRevenue - totalFixedPrizes - totalAgentCommission - actualCompanyTake, 0).
     */
    jackpotContribution: number;
  };

  // ───── Stats ─────

  /** Thống kê kỳ quay. */
  stats?: {
    /** Tổng số entry tham gia kỳ quay. */
    ticketEntryCount: number;
    /** Tổng số line (bao gồm cả lines từ bao). */
    totalLineCount: number;
    /** Tổng doanh thu bán vé (VND). */
    totalSalesAmount: number;
    /** Tổng tiền trả thưởng (VND). Chỉ có sau khi settle. */
    totalPayoutAmount?: number;
  };

  // ───── Void Info ─────

  /** Thông tin huỷ kỳ quay (nếu bị void). */
  voidInfo?: {
    /** Lý do huỷ. */
    reason: string;
    /** Người thực hiện huỷ (user ID hoặc "system"). */
    voidedBy?: string;
    /** Thời điểm huỷ. */
    voidedAt: Date;
  };

  /** Tổng kết xử lý hoàn tiền sau khi void kỳ quay. */
  voidSummary?: {
    /** Số lượng entry bị void. */
    totalVoidedEntries: number;
    /** Tổng số tiền gốc của các entry bị void (VND). */
    totalOriginalAmount: number;
    /** Tổng số tiền hoàn trả (VND). */
    totalRefundAmount: number;
    /** Thời điểm hoàn tất xử lý void. */
    completedAt: Date;
  };

  // ───── Timestamps ─────

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. */
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

/** Chi tiết chia Jackpot khi split cycle được kích hoạt. */
export interface DrawSplit {
  /** Ngưỡng kích hoạt chia Jackpot (VND). Khi Jackpot >= giá trị này → split. */
  thresholdAmount: number;
  /** Tỷ lệ chia cho từng tier (tier1: 2, tier2: 2, tier3: 1 → tổng = 5). */
  splitRatios: SplitRatios;
  /** Tổng số tiền Jackpot được chia (VND). */
  splitAmount: number;
  /**
   * Chi tiết phân bổ cho từng tier.
   * Key = PrizeTier ("tier1" | "tier2" | "tier3").
   * Tier nào không có người trúng sẽ được phân bổ lại cho các tier có người trúng.
   */
  tierAllocations?: Record<
    string,
    {
      /** Số tiền phân bổ ban đầu theo tỷ lệ (VND). Công thức: jackpotAmount × parts / totalParts. */
      initialAmount: number;
      /** Số tiền nhận thêm từ các tier không có người trúng (VND). */
      redistributedAmount: number;
      /** Tổng tiền cho tier (VND). Công thức: initialAmount + redistributedAmount. */
      totalAmount: number;
      /** Số người trúng tier này. */
      winnerCount: number;
      /** Tiền thưởng bonus cho mỗi người trúng (VND). Công thức: totalAmount / winnerCount (làm tròn). */
      bonusPerWinner: number;
    }
  >;
  /** Số tiền dư sau khi làm tròn (VND). Chuyển vào Jackpot kỳ sau. */
  roundingRemainder?: number;
  /** Phiên bản quy tắc chia đã áp dụng. */
  splitRuleVersion?: string;
  /** Ghi chú mô tả ngắn về kỳ split (dùng hiển thị cho admin). */
  hintText?: string;
}

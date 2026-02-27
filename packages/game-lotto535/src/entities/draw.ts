/**
 * Lotto 5/35 – Draw Document
 *
 * Collection: lotto535Draws
 *
 * 1 document = 1 kỳ mở thưởng (draw).
 * Game quay 2 lần/ngày (13h + 21h), tức 2 draws/ngày.
 *
 * Chức năng:
 * - Quản lý lịch (open/close bán vé)
 * - Lưu kết quả quay + Vietlott reference
 * - Tính toán tài chính: jackpot accumulation, commission, company take
 * - Cung cấp jackpot info cho UI người chơi
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type {
  ISODateString,
  DrawNo,
  MainTuple,
  Special,
  SplitRatios,
} from "./types";

// ─────────────────────────────────────────────
// Draw Document
// ─────────────────────────────────────────────

export interface DrawDoc {
  _id: unknown;

  /**
   * ID kỳ quay, unique + stable.
   * Format: "YYYY-MM-DD.NNN" (NNN = draw number 001 hoặc 002).
   * Ví dụ: "2026-02-22.001" (kỳ 13h), "2026-02-22.002" (kỳ 21h).
   */
  drawId: string;

  /** Ngày quay theo timezone vận hành, format "YYYY-MM-DD". */
  drawDate: ISODateString;

  /**
   * Ngày tài chính "YYYY-MM-DD".
   * Tính từ drawTime theo rule: 11h sáng → 11h sáng hôm sau (giờ VN).
   * Set 1 lần duy nhất khi tạo draw. Ticket/entry lấy từ đây.
   */
  financialDate: ISODateString;

  /**
   * Số thứ tự kỳ quay trong ngày (1 = 13h, 2 = 21h).
   * Dùng cho UI hiển thị "Kỳ 1 / Kỳ 2".
   */
  drawNo: DrawNo;

  /** Thời điểm quay chính xác (Date). */
  drawTime: Date;

  /** Trạng thái vận hành kỳ quay. */
  status: DrawStatus;

  // ───── Sales Window ─────

  /** Cửa sổ bán vé. */
  sales: {
    /** Thời điểm mở bán. Chỉ có sau khi staff nhấn "Mở bán". */
    openAt?: Date;

    /**
     * Thời điểm đóng bán.
     * Thường = drawTime - 30 phút (cấu hình trong gameConfig.play.salesCloseBeforeMinutes).
     * Backend reject mua vé cho draw này sau closeAt.
     */
    closeAt: Date;
  };

  // ───── Vietlott Reference (kết nối kết quả thực) ─────

  /**
   * Tham chiếu kỳ quay Vietlott chính thức.
   * Cho phép khách hàng biết kết quả kỳ nào của Vietlott được sử dụng.
   * Staff nhập trên backoffice khi import kết quả.
   */
  vietlottRef?: {
    /**
     * Mã kỳ quay Vietlott (ví dụ "00123").
     * Lấy từ website/hệ thống Vietlott.
     */
    drawPeriod: string;

    /** Ngày quay Vietlott. */
    drawDate: ISODateString;

    /** Phiên quay: 1 = 13h, 2 = 21h. */
    drawSession: number;
  };

  // ───── Result ─────

  /** Kết quả kỳ quay. Set khi status chuyển sang "published". */
  result?: {
    /** 5 số chính trúng thưởng, sorted tăng dần. */
    winningMain: MainTuple;

    /** 1 số đặc biệt trúng thưởng. */
    winningSpecial: Special;

    /** Thời điểm công bố. */
    publishedAt: Date;
  };

  // ───── Jackpot ─────

  /**
   * Thông tin Jackpot cho kỳ quay.
   * UI người chơi đọc từ đây để hiển thị giá trị Jackpot hiện tại.
   */
  jackpot: {
    /**
     * Jackpot đầu kỳ (VND).
     * = Jackpot cuối kỳ trước + tích luỹ từ kỳ trước (nếu có).
     * Kỳ đầu tiên = gameConfig.jackpot.seedAmount.
     */
    openingAmount: number;

    /**
     * Jackpot cuối kỳ (VND).
     * Sau settle: closingAmount = openingAmount + jackpotContribution (nếu không ai trúng)
     *                           = seedAmount (nếu có người trúng Jackpot)
     */
    closingAmount?: number;

    /** Phần rollover từ kỳ trước (nếu có). */
    rolloverAmount?: number;

    /**
     * Đánh dấu kỳ này là kỳ chia giải (split cycle).
     * true khi Jackpot >= splitThreshold và chưa có người trúng,
     * và đây là kỳ 21h ngày hôm sau.
     */
    isSplitCycle?: boolean;

    /** Chi tiết chia giải nếu isSplitCycle = true. */
    split?: DrawSplit;
  };

  // ───── Financial Breakdown (sau settle) ─────

  /**
   * Tổng kết tài chính kỳ quay.
   * Populate sau khi settle xong.
   *
   * Công thức:
   *   jackpotContribution = totalRevenue - totalFixedPrizes - totalAgentCommission - companyTake
   */
  financial?: {
    /** Tổng doanh thu tiền cược (100% revenue). */
    totalRevenue: number;

    /** Tổng tiền trả giải cố định (tier1 → consolation). */
    totalFixedPrizes: number;

    /** Tổng hoa hồng đại lý (sum across all tenants). */
    totalAgentCommission: number;

    /** Công ty thu về (sau cap). */
    companyTake: number;

    /** Tỷ lệ company take theo config. */
    companyTakeRate: number;

    /** Company take tối đa trước cap. */
    companyTakeMax: number;

    /**
     * Tiền tích luỹ vào Jackpot kỳ tiếp theo.
     * = totalRevenue - totalFixedPrizes - totalAgentCommission - companyTake
     * Có thể âm nếu trả thưởng nhiều hơn doanh thu (company bù).
     */
    jackpotContribution: number;
  };

  // ───── Operational Stats ─────

  /** Thống kê vận hành (cập nhật khi salesClosed + sau settle). */
  stats?: {
    /** Số entry tham gia kỳ này. */
    ticketEntryCount: number;

    /** Tổng lines tất cả entries (dự báo tải settle). */
    totalLineCount: number;

    /** Tổng doanh thu kỳ này. */
    totalSalesAmount: number;

    /** Tổng payout sau settle. */
    totalPayoutAmount?: number;
  };

  // ───── Void Info ─────

  /** Thông tin khi kỳ quay bị huỷ. Chỉ có khi status = void. */
  voidInfo?: {
    reason: string;
    voidedBy?: string;
    voidedAt: Date;
  };

  /** Tổng kết void flow (entries refund). Ghi sau khi void step function hoàn tất. */
  voidSummary?: {
    totalVoidedEntries: number;
    totalOriginalAmount: number;
    totalRefundAmount: number;
    completedAt: Date;
  };

  // ───── Timestamps ─────

  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

/** Chi tiết chia giải khi kỳ là split cycle. */
export interface DrawSplit {
  /**
   * Ngưỡng kích hoạt chia (VND).
   * Snapshot từ gameConfig.jackpot.splitThreshold tại thời điểm xác định split.
   */
  thresholdAmount: number;

  /** Tỷ lệ chia (snapshot từ config). */
  splitRatios: SplitRatios;

  /**
   * Giá trị Jackpot được chia (VND).
   * Chính là jackpot.openingAmount tại kỳ chia.
   */
  splitAmount: number;

  /**
   * Chi tiết phân bổ chia cho từng tier (sau redistribute + rounding).
   * Chỉ bao gồm tier có người trúng. Key = tier name.
   */
  tierAllocations?: Record<
    string,
    {
      /** Phần chia ban đầu theo ratio (trước redistribute). */
      initialAmount: number;
      /** Phần bổ sung nhận từ tier không có người trúng. */
      redistributedAmount: number;
      /** Tổng = initialAmount + redistributedAmount. */
      totalAmount: number;
      /** Số lượng giải trúng. */
      winnerCount: number;
      /** Bonus mỗi giải trúng (đã làm tròn xuống 1 VND). */
      bonusPerWinner: number;
    }
  >;

  /**
   * Phần dư do làm tròn (VND), đã cộng vào hạng giải cao nhất.
   * Lưu cho mục đích audit.
   */
  roundingRemainder?: number;

  /** Version rule chia để audit (ví dụ "v1-2026-02"). */
  splitRuleVersion?: string;

  /** Hint text cho UI (optional). Ví dụ: "Kỳ chia giải Jackpot". */
  hintText?: string;
}

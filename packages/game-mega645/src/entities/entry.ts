/**
 * Mega 6/45 – Ticket Entry Document
 *
 * Collection: mega645TicketEntries
 *
 * 1 document = 1 ticket tham gia 1 kỳ quay cụ thể.
 */

import type { PlayType, PrizeTier, PayoutStatus, RefundStatus } from "./enums";
import type { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import type { ISODateString, MainTuple } from "./types";
import type { Long } from "@megawin/game-core/types";

// ─────────────────────────────────────────────
// Entry Document
// ─────────────────────────────────────────────

export interface TicketEntryDoc {
  /** MongoDB document ID. */
  _id: unknown;

  /** ID đại lý (tenant) bán vé. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Tên đăng nhập người chơi. */
  username: string;
  /** Tham chiếu đến vé gốc (mega645Tickets._id). */
  ticketId: string;

  /** ID kỳ quay mà entry này tham gia. Format: "YYYY-MM-DD.001". */
  drawId: string;
  /** Thời điểm quay thưởng. */
  drawTime: Date;
  /** Ngày quay "YYYY-MM-DD". */
  drawDate: ISODateString;
  /** Ngày tài chính "YYYY-MM-DD". */
  financialDate: ISODateString;

  /** Snapshot thông tin đại lý tại thời điểm tạo entry. */
  tenant: {
    /** Tỷ lệ hoa hồng đại lý. Ví dụ: 0.2 = 20%. */
    commissionRate: number;
    /**
     * Số tiền hoa hồng đại lý (VND).
     * Công thức: amount × commissionRate.
     */
    commissionAmount: number;
  };

  /** Trạng thái entry (pending → active → settled / voided). */
  status: EntryStatus;

  /**
   * Tổng số line của entry (bao gồm cả lines từ bao).
   * Công thức: Σ(boards[].expandedLines).
   */
  lineCount: number;
  /**
   * Tổng số tiền đặt cược (VND).
   * Công thức: lineCount × unitPrice.
   */
  amount: number;
  /** Đơn giá 1 line (VND). Snapshot từ config tại thời điểm đặt vé. */
  unitPrice: number;

  /** Tóm tắt nội dung entry (dùng cho hiển thị, truy vấn nhanh). */
  entrySummary: {
    /** Số vé (mã hiển thị cho người chơi). */
    ticketNo: string;
    /** Snapshot các board từ vé gốc. */
    boards: EntryBoardSnapshot[];
  };

  /** Kết quả kỳ quay (ghi lại khi publish result). */
  result?: {
    /** 6 số trúng thưởng, sorted tăng dần. */
    winningMain: MainTuple;
    /** Thời điểm công bố kết quả. */
    publishedAt: Date;
  };

  /** Kết quả đối soát (win / lose). Chỉ có sau khi settle. */
  outcome?: EntryOutcome;

  /** Thông tin trả thưởng (chỉ có khi trúng giải). */
  payout?: {
    /**
     * Tổng tiền trúng thưởng (VND).
     * Công thức: Σ(tiers[].amount).
     */
    winAmount: number;
    /** Tổng tiền thực trả cho người chơi (VND). Thường = winAmount. */
    payoutAmount: number;
    /** Chi tiết trúng thưởng theo từng hạng giải. */
    tiers: EntryPayoutTier[];
    /** Thời điểm settle (tính toán kết quả). */
    settledAt: Date;
    /** Trạng thái gửi tiền trả thưởng cho tenant. */
    payoutStatus?: PayoutStatus;
    /** Thời điểm gửi lệnh chuyển tiền trả thưởng. */
    payoutDispatchedAt?: Date;
    /** Số lần retry gửi tiền trả thưởng (khi gặp lỗi). */
    payoutRetryCount?: number;
    /** Lỗi cuối cùng khi gửi tiền trả thưởng. */
    payoutLastError?: string;
  };

  /** Thông tin huỷ entry (khi kỳ quay bị void). */
  voidInfo?: {
    /** Số tiền gốc của entry (VND). */
    originalAmount: number;
    /** Số tiền hoàn trả (VND). Thường = originalAmount. */
    refundAmount: number;
    /** Trạng thái hoàn tiền. */
    refundStatus: RefundStatus;
    /** Thời điểm huỷ. */
    voidedAt: Date;
    /** Thời điểm hoàn tiền thành công. */
    refundedAt?: Date;
  };

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. */
  updatedAt: Date;
  /** Số phiên bản document (optimistic locking). */
  version: Long;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

/** Snapshot board trong entry (ghi lại từ vé gốc). */
export interface EntryBoardSnapshot {
  /** Ký hiệu board ("A".."F"). */
  boardNo: string;
  /** True nếu board này đã bị void (ví dụ: đại lý huỷ 1 board). */
  isVoid?: boolean;
  /** Kiểu chơi (standard / bao5 / bao7-18 / quickPick). */
  playType: PlayType;
  /** Danh sách số chính người chơi đã chọn ("01"-"45"). */
  mainNumbers: string[];
  /**
   * Số line sau khi expand từ board.
   * - standard / quickPick: 1
   * - bao5: 40
   * - bao7-18: C(N, 6)
   */
  expandedLines: number;
}

/** Chi tiết trúng thưởng 1 hạng giải trong entry. */
export interface EntryPayoutTier {
  /** Hạng giải (jackpot / tier1 / tier2 / tier3). */
  tier: PrizeTier;
  /** Số line trúng hạng giải này. */
  hitCount: number;
  /** Tiền thưởng cho 1 line (VND). Với Jackpot = giá trị Jackpot hiện tại. */
  unitAmount: number;
  /**
   * Tổng tiền thưởng hạng giải này (VND).
   * Công thức: hitCount × unitAmount.
   */
  amount: number;
  /** True nếu tiền thưởng bao gồm bonus từ split cycle. */
  isSplitBonus?: boolean;
}

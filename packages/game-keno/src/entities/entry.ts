/**
 * Keno – Ticket Entry Document
 *
 * Collection: kenoTicketEntries
 *
 * 1 document = 1 ticket tham gia 1 kỳ quay Keno cụ thể.
 * Đơn vị vận hành chính cho settle + report.
 *
 * Số lưu dạng string "01"-"80" trong entrySummary.boards.
 * Kết quả quay (result.winningNumbers) cũng dùng string[] "01"-"80".
 */

import type {
  KenoBigSmallBet,
  KenoEvenOddBet,
  KenoPlayType,
  PayoutStatus,
  RefundStatus,
} from "./enums";
import type { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import type { ISODateString } from "./types";
import type { Long } from "@megawin/game-core/types";

/**
 * Các bậc chơi (pickCount) mà giải thưởng cao nhất có giới hạn trả thưởng mỗi kỳ.
 *
 * Quy tắc Vietlott Keno:
 *   - Bậc 8 trùng 8: ≤50 bộ → 200tr/bộ (cố định), >50 bộ → 10 tỷ chia đều
 *   - Bậc 9 trùng 9: ≤12 bộ → 800tr/bộ (cố định), >12 bộ → 10 tỷ chia đều
 *   - Bậc 10 trùng 10: ≤5 bộ → 2 tỷ/bộ (cố định), >5 bộ → 10 tỷ chia đều
 *
 * Dùng bởi SettleEntries (gắn flag) và ApplyPayoutCaps (query nhanh).
 */
export const CAPPABLE_PICK_COUNTS: ReadonlySet<number> = new Set([8, 9, 10]);

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Snapshot thông tin đại lý tại thời điểm tạo entry. */
export interface EntryTenantSnapshot {
  /** Tỷ lệ hoa hồng đại lý. Ví dụ: 0.20 = 20%. */
  commissionRate: number;
  /** Tiền hoa hồng = Math.round(amount × commissionRate). Tính sẵn lúc place-bet. */
  commissionAmount: number;
}

/** Tóm tắt nội dung entry, snapshot từ ticket. */
export interface EntrySummary {
  ticketNo: string;
  boards: EntryBoardSnapshot[];
  sideBets: EntrySideBetSnapshot[];
}

/** Snapshot kết quả kỳ quay. Copy từ draw khi settle. */
export interface EntryResult {
  winningNumbers: string[];
  publishedAt: Date;
  bigCount: number;
  smallCount: number;
  evenCount: number;
  oddCount: number;
}

/** Chi tiết thanh toán. Set sau khi settle. */
export interface EntryPayout {
  /** Tổng tiền thắng = Σ(boardPayouts[].winAmount) + Σ(sideBetPayouts[].winAmount). */
  winAmount: number;
  /** Tiền trả cho player. Thường = winAmount. Sau ApplyPayoutCaps có thể giảm. */
  payoutAmount: number;
  /** Chi tiết thắng/thua từng board cách chơi cơ bản. */
  boardPayouts: EntryBoardPayout[];
  /** Chi tiết thắng/thua từng side bet (Lớn/Nhỏ, Chẵn/Lẻ). */
  sideBetPayouts: EntrySideBetPayout[];
  /** Thời điểm settle. */
  settledAt: Date;
  payoutStatus?: PayoutStatus;
  payoutDispatchedAt?: Date;
  payoutRetryCount?: number;
  payoutLastError?: string;
}

/**
 * Thông tin huỷ cược + hoàn tiền.
 * Chỉ có khi entry bị void (draw void / admin void).
 */
export interface EntryVoidInfo {
  /** Tiền cược gốc của entry này (= amount). */
  originalAmount: number;
  /** Tiền hoàn trả cho player. */
  refundAmount: number;
  /** Trạng thái hoàn tiền. */
  refundStatus: RefundStatus;
  /** Thời điểm huỷ. */
  voidedAt: Date;
  /** Thời điểm hoàn tiền. */
  refundedAt?: Date;
}

// ─────────────────────────────────────────────
// Entry Document
// ─────────────────────────────────────────────

export interface TicketEntryDoc {
  _id: unknown;

  // ───── Partition / Ownership ─────

  tenantId: string;
  accountId: string;
  username: string;
  ticketId: unknown;

  // ───── Draw Snapshot ─────

  drawId: string;
  drawDate: ISODateString;
  financialDate: ISODateString;

  // ───── Tenant (snapshot đại lý lúc đặt cược) ─────

  tenant: EntryTenantSnapshot;

  // ───── Entry Status ─────

  status: EntryStatus;

  // ───── Stake ─────

  betCount: number;
  amount: number;
  unitPrice: number;

  // ───── Entry Summary ─────

  entrySummary: EntrySummary;

  // ───── Result Snapshot ─────

  result?: EntryResult;

  // ───── Outcome ─────

  outcome?: EntryOutcome;

  // ───── Payout ─────

  payout?: EntryPayout;

  // ───── Payout Cap Flag ─────

  /**
   * Flag đánh dấu entry có board trúng giải cao nhất ở bậc 8/9/10.
   *
   * Được gắn bởi SettleEntries khi entry có ít nhất 1 board mà:
   *   pickCount ∈ {8, 9, 10} VÀ matchCount === pickCount (trúng hết)
   *
   * Mục đích: tối ưu query cho step ApplyPayoutCaps.
   * Thay vì phải $unwind + $expr trên toàn bộ entries, chỉ cần
   * filter { hasCappablePrize: true } → nhanh và index-friendly.
   *
   * Quy tắc Vietlott: khi tổng số bộ trúng top prize vượt ngưỡng
   * cấu hình (maxSetsForFixed), giải thưởng phải chia đều từ maxPerDraw.
   *
   * Chỉ có khi entry đã settled và có board trúng top prize.
   * Undefined/false cho các entry khác.
   */
  hasCappablePrize?: boolean;

  // ───── Void / Refund (khi draw bị huỷ) ─────

  /**
   * Thông tin huỷ cược + hoàn tiền.
   * Chỉ có khi entry bị void (draw void / admin void).
   */
  voidInfo?: EntryVoidInfo;

  // ───── Timestamps ─────

  createdAt: Date;
  updatedAt: Date;
  version: Long;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

export interface EntryBoardSnapshot {
  /** Mã board: "A", "B". */
  boardNo: string;
  /** Loại chơi: "pick1" – "pick10". */
  playType: KenoPlayType;
  /** Số dạng string "01"-"80". */
  numbers: string[];
}

export interface EntrySideBetSnapshot {
  /** Loại side bet: "bigSmall" hoặc "evenOdd". */
  playType: KenoPlayType;
  /** Lựa chọn cụ thể: "big"/"small"/"bigSmallDraw"/... */
  bet: KenoBigSmallBet | KenoEvenOddBet;
}

export interface EntryBoardPayout {
  /** Mã board: "A", "B". */
  boardNo: string;
  /** Loại chơi: "pick1" – "pick10". */
  playType: KenoPlayType;
  /** Số trùng với kết quả quay. */
  matchCount: number;
  /** Số lượng số người chơi đã chọn (= numbers.length). */
  pickCount: number;
  /** Tiền thắng cho board này (VND). 0 nếu không trúng. */
  winAmount: number;
}

export interface EntrySideBetPayout {
  /** Loại side bet: "bigSmall" hoặc "evenOdd". */
  playType: KenoPlayType;
  /** Lựa chọn cụ thể: "big"/"small"/"bigSmallDraw"/... */
  bet: KenoBigSmallBet | KenoEvenOddBet;
  /** Kết quả: "big13Plus", "draw", "even1314"... */
  outcome: string;
  /** true nếu trúng. */
  isWin: boolean;
  /** Tiền thắng (VND). 0 nếu không trúng. */
  winAmount: number;
}

/**
 * Keno – Ticket Entry Document
 *
 * Collection: kenoTicketEntries
 *
 * 1 document = 1 ticket tham gia 1 kỳ quay Keno cụ thể.
 * Đơn vị vận hành chính cho settle + report.
 */

import type {
  KenoBigSmallBet,
  KenoEvenOddBet,
  KenoPlayType,
} from "./enums";
import type { EntryStatus } from "@megawin/game-core/entities";
import type { ISODateString } from "./types";
import type { Long } from "@megawin/game-core/types";

// ─────────────────────────────────────────────
// Entry Document
// ─────────────────────────────────────────────

export interface TicketEntryDoc {
  _id: unknown;

  // ───── Partition / Ownership ─────

  tenantId: string;
  playerId: string;
  ticketId: unknown;

  // ───── Draw Snapshot ─────

  drawId: string;
  drawTime: Date;
  drawDate: ISODateString;

  // ───── Entry Status ─────

  status: EntryStatus;

  // ───── Stake ─────

  /** Số bets trên vé. */
  betCount: number;

  /** Tiền cược kỳ này (VND). */
  amount: number;

  /** Giá 1 bet (snapshot). */
  unitPrice: number;

  // ───── Entry Summary ─────

  entrySummary: {
    ticketNo: string;
    ticketVersion: number;

    /** Snapshot boards cơ bản. */
    boards: EntryBoardSnapshot[];

    /** Snapshot side bets. */
    sideBets: EntrySideBetSnapshot[];
  };

  // ───── Result Snapshot ─────

  result?: {
    /** 20 số trúng thưởng, sorted tăng dần. */
    winningNumbers: number[];
    publishedAt: Date;
    bigCount: number;
    smallCount: number;
    evenCount: number;
    oddCount: number;
  };

  // ───── Payout ─────

  payout?: {
    /** Tổng tiền thắng kỳ này. */
    winAmount: number;

    /**
     * Tiền trả thưởng thực tế cho khách (sau thuế/phí nếu có).
     * Hiện tại = winAmount (chưa có thuế).
     */
    payoutAmount: number;

    /** Chi tiết trả thưởng cho boards cơ bản. */
    boardPayouts: EntryBoardPayout[];

    /** Chi tiết trả thưởng cho side bets. */
    sideBetPayouts: EntrySideBetPayout[];

    settledAt: Date;
  };

  // ───── Timestamps ─────

  createdAt: Date;
  updatedAt: Date;

  // ───── Change Tracking ─────

  /**
   * Global change sequence (BSON Long / Int64).
   * Gán từ entryChangeSeq mỗi khi entry được insert hoặc update.
   * Worker dùng field này để detect thay đổi: version > lastProcessedVersion.
   * Khi trả về qua API phải convert sang string (Long.toString()).
   */
  version: Long;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

export interface EntryBoardSnapshot {
  boardNo: string;
  isVoid?: boolean;
  playType: KenoPlayType;
  numbers: number[];
}

export interface EntrySideBetSnapshot {
  isVoid?: boolean;
  playType: KenoPlayType;
  bet: KenoBigSmallBet | KenoEvenOddBet;
}

/** Chi tiết trả thưởng cho 1 board cơ bản. */
export interface EntryBoardPayout {
  boardNo: string;
  playType: KenoPlayType;

  /** Số lượng số trùng (hits). */
  matchCount: number;

  /** Tổng số số đã chọn trên board. */
  pickCount: number;

  /** Tiền thưởng board này. */
  winAmount: number;
}

/** Chi tiết trả thưởng cho 1 side bet. */
export interface EntrySideBetPayout {
  playType: KenoPlayType;
  bet: KenoBigSmallBet | KenoEvenOddBet;

  /** Kết quả xác định (ví dụ: "big", "even"). */
  outcome: string;

  /** Có trúng không. */
  isWin: boolean;

  /** Tiền thưởng. */
  winAmount: number;
}

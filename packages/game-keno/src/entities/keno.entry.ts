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
  KenoEntryStatus,
  KenoEvenOddBet,
  KenoPlayType,
} from "./keno.enums";
import type { ISODateString } from "./keno.types";

// ─────────────────────────────────────────────
// Entry Document
// ─────────────────────────────────────────────

export interface KenoTicketEntryDoc {
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

  status: KenoEntryStatus;

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
    boards: KenoEntryBoardSnapshot[];

    /** Snapshot side bets. */
    sideBets: KenoEntrySideBetSnapshot[];
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

    /** Chi tiết trả thưởng cho boards cơ bản. */
    boardPayouts: KenoEntryBoardPayout[];

    /** Chi tiết trả thưởng cho side bets. */
    sideBetPayouts: KenoEntrySideBetPayout[];

    settledAt: Date;
  };

  // ───── Timestamps ─────

  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

export interface KenoEntryBoardSnapshot {
  boardNo: string;
  isVoid?: boolean;
  playType: KenoPlayType;
  numbers: number[];
}

export interface KenoEntrySideBetSnapshot {
  isVoid?: boolean;
  playType: KenoPlayType;
  bet: KenoBigSmallBet | KenoEvenOddBet;
}

/** Chi tiết trả thưởng cho 1 board cơ bản. */
export interface KenoEntryBoardPayout {
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
export interface KenoEntrySideBetPayout {
  playType: KenoPlayType;
  bet: KenoBigSmallBet | KenoEvenOddBet;

  /** Kết quả xác định (ví dụ: "big", "even"). */
  outcome: string;

  /** Có trúng không. */
  isWin: boolean;

  /** Tiền thưởng. */
  winAmount: number;
}

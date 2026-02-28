/**
 * Keno – Ticket Entry Document
 *
 * Collection: kenoTicketEntries
 *
 * 1 document = 1 ticket tham gia 1 kỳ quay Keno cụ thể.
 * Đơn vị vận hành chính cho settle + report.
 *
 * Số lưu dạng string "01"-"80" trong entrySummary.boards.
 * Kết quả quay (result.winningNumbers) dùng number[] (server-side chỉ tính toán).
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

  tenant: {
    /** Tỷ lệ hoa hồng đại lý. Ví dụ: 0.20 = 20%. */
    commissionRate: number;
    /** Tiền hoa hồng = Math.round(amount × commissionRate). Tính sẵn lúc place-bet. */
    commissionAmount: number;
  };

  // ───── Entry Status ─────

  status: EntryStatus;

  // ───── Stake ─────

  betCount: number;
  amount: number;
  unitPrice: number;

  // ───── Entry Summary ─────

  entrySummary: {
    ticketNo: string;
    boards: EntryBoardSnapshot[];
    sideBets: EntrySideBetSnapshot[];
  };

  // ───── Result Snapshot ─────

  result?: {
    winningNumbers: number[];
    publishedAt: Date;
    bigCount: number;
    smallCount: number;
    evenCount: number;
    oddCount: number;
  };

  // ───── Outcome ─────

  outcome?: EntryOutcome;

  // ───── Payout ─────

  payout?: {
    winAmount: number;
    payoutAmount: number;
    boardPayouts: EntryBoardPayout[];
    sideBetPayouts: EntrySideBetPayout[];
    settledAt: Date;
    payoutStatus?: PayoutStatus;
    payoutDispatchedAt?: Date;
    payoutRetryCount?: number;
    payoutLastError?: string;
  };

  // ───── Void / Refund (khi draw bị huỷ) ─────

  /**
   * Thông tin huỷ cược + hoàn tiền.
   * Chỉ có khi entry bị void (draw void / admin void).
   */
  voidInfo?: {
    /** Lý do huỷ. */
    reason: string;

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

    /** Ai/hệ thống nào thực hiện void. */
    voidedBy?: string;
  };

  // ───── Timestamps ─────

  createdAt: Date;
  updatedAt: Date;
  version: Long;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

export interface EntryBoardSnapshot {
  boardNo: string;
  isVoid?: boolean;
  playType: KenoPlayType;
  /** Số dạng string "01"-"80". */
  numbers: string[];
}

export interface EntrySideBetSnapshot {
  isVoid?: boolean;
  playType: KenoPlayType;
  bet: KenoBigSmallBet | KenoEvenOddBet;
}

export interface EntryBoardPayout {
  boardNo: string;
  playType: KenoPlayType;
  matchCount: number;
  pickCount: number;
  winAmount: number;
}

export interface EntrySideBetPayout {
  playType: KenoPlayType;
  bet: KenoBigSmallBet | KenoEvenOddBet;
  outcome: string;
  isWin: boolean;
  winAmount: number;
}

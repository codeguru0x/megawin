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
  _id: unknown;

  tenantId: string;
  accountId: string;
  username: string;
  ticketId: unknown;

  drawId: string;
  drawTime: Date;
  drawDate: ISODateString;
  financialDate: ISODateString;

  tenant: {
    commissionRate: number;
    commissionAmount: number;
  };

  status: EntryStatus;

  lineCount: number;
  amount: number;
  unitPrice: number;

  entrySummary: {
    ticketNo: string;
    boards: EntryBoardSnapshot[];
  };

  result?: {
    winningMain: MainTuple;
    publishedAt: Date;
  };

  outcome?: EntryOutcome;

  payout?: {
    winAmount: number;
    payoutAmount: number;
    tiers: EntryPayoutTier[];
    settledAt: Date;
    payoutStatus?: PayoutStatus;
    payoutDispatchedAt?: Date;
    payoutRetryCount?: number;
    payoutLastError?: string;
  };

  voidInfo?: {
    reason: string;
    originalAmount: number;
    refundAmount: number;
    refundStatus: RefundStatus;
    voidedAt: Date;
    refundedAt?: Date;
    voidedBy?: string;
  };

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
  playType: PlayType;
  mainNumbers: number[];
  expandedLines: number;
}

export interface EntryPayoutTier {
  tier: PrizeTier;
  hitCount: number;
  unitAmount: number;
  amount: number;
  isSplitBonus?: boolean;
}

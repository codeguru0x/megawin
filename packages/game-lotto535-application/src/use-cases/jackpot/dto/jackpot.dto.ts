/**
 * Lotto 5/35 – Jackpot DTOs
 *
 * Tách riêng DTO cho các use case jackpot.
 * Dùng cho cả API response và client-side type.
 */

import type {
  JackpotCycleStatus,
  JackpotCycleCloseReason,
} from "@megawin/game-lotto535/entities";

// ─────────────────────────────────────────────
// GetJackpotCurrent
// ─────────────────────────────────────────────

export interface GetJackpotCurrentOutput {
  cycle: {
    cycleNo: number;
    status: JackpotCycleStatus;
    seedAmount: number;
    currentAmount: number;
    peakAmount: number;
    totalContribution: number;
    drawCount: number;
    startDrawId: string;
    startedAt: string;
    lastSettledDrawId?: string;
  };
  config: {
    splitThreshold: number;
    splitRatios: {
      tier1: number;
      tier2: number;
      tier3: number;
      tier4: number;
      tier5: number;
    };
  };
  progress: {
    current: number;
    threshold: number;
    percentage: number;
    remaining: number;
  };
  nextDraw?: {
    drawId: string;
    drawNo: number;
    drawTime: string;
    splitCycleIntent: boolean;
  };
}

// ─────────────────────────────────────────────
// ListJackpotHistory (draw-by-draw)
// ─────────────────────────────────────────────

export interface ListJackpotHistoryInput {
  page?: number;
  size?: number;
}

export interface JackpotHistoryItem {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  openingAmount: number;
  contribution: number;
  closingAmount: number;
  hasWinner: boolean;
  isSplitCycle: boolean;
  ticketEntryCount: number;
  totalRevenue: number;
}

export interface ListJackpotHistoryOutput {
  draws: JackpotHistoryItem[];
  page: number;
  size: number;
}

// ─────────────────────────────────────────────
// ListJackpotCycles (chia / trúng)
// ─────────────────────────────────────────────

export interface ListJackpotCyclesInput {
  page?: number;
  size?: number;
}

export interface JackpotWinnerSummary {
  accountId: string;
  username?: string;
  tenantId: string;
  tenantName?: string;
  prizeAmount: number;
  entryId: string;
  drawId: string;
}

export interface JackpotCycleSummary {
  id: string;
  cycleNo: number;
  status: JackpotCycleStatus;
  startDrawId: string;
  startedAt: string;
  endDrawId?: string;
  closedAt?: string;
  closeReason?: JackpotCycleCloseReason;
  seedAmount: number;
  currentAmount: number;
  peakAmount: number;
  totalContribution: number;
  drawCount: number;
  splitDetail?: {
    splitAmount: number;
    totalWinners: number;
    totalPaid: number;
    tierAllocations: Record<
      string,
      { winnerCount: number; bonusPerWinner: number; totalAmount: number }
    >;
  };
  winners?: JackpotWinnerSummary[];
}

export interface ListJackpotCyclesOutput {
  cycles: JackpotCycleSummary[];
  page: number;
  size: number;
  total: number;
}

/**
 * Power 6/55 – Jackpot DTOs
 *
 * Tách riêng DTO cho các use case jackpot.
 * Hỗ trợ dual jackpot: JP1 (trùng 6/6) + JP2 (trùng 5/6 + bonus).
 */

import type { JackpotCycleClosedReason } from "@megawin/game-power655/entities";

// ─── GetJackpotCurrent ───

export interface GetJackpotCurrentOutput {
  cycle: {
    cycleNo: number;
    status: string;
    jackpot1Current: number;
    jackpot2Current: number;
    jackpot1Opening: number;
    jackpot2Opening: number;
    drawCount: number;
    startDrawId: string;
    startedAt: string;
  };
  config: {
    splitThreshold: number;
    splitRatios: { tier1: number; tier2: number; tier3: number };
  };
  jackpot1Progress: {
    current: number;
    seed: number;
  };
  jackpot2Progress: {
    current: number;
    seed: number;
  };
  totalJackpotProgress: {
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

// ─── ListJackpotHistory (draw-by-draw) ───

export interface ListJackpotHistoryInput {
  page?: number;
  size?: number;
}

export interface JackpotHistoryItem {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  openingJackpot1: number;
  openingJackpot2: number;
  closingJackpot1: number;
  closingJackpot2: number;
  jackpot1Contribution: number;
  jackpot2Contribution: number;
  hasJackpot1Winner: boolean;
  hasJackpot2Winner: boolean;
  isSplitCycle: boolean;
  totalEntries: number;
  totalRevenue: number;
}

export interface ListJackpotHistoryOutput {
  draws: JackpotHistoryItem[];
  page: number;
  size: number;
}

// ─── ListJackpotCycles ───

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
  jackpotType: string;
}

export interface JackpotCycleSummary {
  id: string;
  cycleNo: number;
  status: string;
  startDrawId: string;
  startedAt: string;
  endDrawId?: string;
  closedAt?: string;
  closedReason?: JackpotCycleClosedReason;
  jackpot1Opening: number;
  jackpot1Current: number;
  jackpot2Opening: number;
  jackpot2Current: number;
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

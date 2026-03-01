/**
 * Power 6/55 – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần — loại bỏ dữ liệu vận hành/công ty.
 *
 * Khác biệt so với Lotto 5/35:
 *   - Dual jackpot: jackpot1CurrentAmount + jackpot2CurrentAmount
 *   - Lines không có special number
 *   - matchResult có bonusMatched thay vì specialMatched
 */

// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  currentDraw: PlayerDrawInfo | null;
  activeDraws: PlayerDrawInfo[];
  jackpot1CurrentAmount: number;
  jackpot2CurrentAmount: number;
  lastResult: {
    drawId: string;
    drawDate: string;
    drawNo: number;
    winningMain: number[];
    bonusNumber: number;
    publishedAt: string;
  } | null;
}

export interface PlayerDrawInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  status: string;
  sales: {
    openAt?: string;
    closeAt: string;
  };
  jackpot1CurrentAmount: number;
  jackpot2CurrentAmount: number;
}

// ─── Get Jackpot (Player) ───

export interface PlayerGetJackpotOutput {
  jackpot1Amount: number;
  jackpot2Amount: number;
  jp1SeedAmount: number;
  jp2SeedAmount: number;
  progress: {
    totalCurrent: number;
    threshold: number;
    percentage: number;
  };
  nextDraw?: {
    drawId: string;
    drawTime: string;
  };
}

// ─── List Tickets (Player) ───

export type TicketSortBy = "betDate" | "drawDate";

export const TICKET_SORT_BY_VALUES: readonly TicketSortBy[] = [
  "betDate",
  "drawDate",
];

export interface PlayerListPendingTicketsInput {
  tenantId: string;
  accountId: string;
  size: number;
  cursor?: string;
}

export interface PlayerListCompletedTicketsInput {
  tenantId: string;
  accountId: string;
  size: number;
  sortBy: TicketSortBy;
  from?: string;
  to?: string;
  cursor?: string;
}

export interface PlayerTicketSummary {
  id: string;
  ticketNo: string;
  status: string;
  drawPlan: {
    drawIds: string[];
    drawCount: number;
  };
  pricing: {
    unitPrice: number;
    linesPerDraw: number;
    stakePerDraw: number;
    totalStake: number;
  };
  boards: Array<{
    boardNo: string;
    playType: string;
    selection: {
      mainNumbers: number[];
    };
    lineCount: number;
  }>;
  progress: {
    settledDrawCount: number;
    voidDrawCount: number;
  };
  settlement?: {
    totalWinAmount: number;
  };
  createdAt: string;
}

export interface PlayerListTicketsOutput {
  tickets: PlayerTicketSummary[];
  nextCursor: string | null;
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  tenantId: string;
  accountId: string;
  ticketId: string;
}

export interface PlayerEntryInfo {
  id: string;
  drawId: string;
  drawDate: string;
  drawTime: string;
  status: string;
  stakeAmount: number;
  lineCount: number;
  entrySummary: {
    totalLines: number;
  };
  result?: {
    winningMain: number[];
    bonusNumber: number;
    publishedAt: string;
  };
  outcome?: string;
  payout?: {
    winAmount: number;
    payoutAmount: number;
    tiers: Array<{
      tier: string;
      matchCount: number;
      prizePerLine: number;
      totalPrize: number;
    }>;
  };
}

export interface PlayerGetTicketEntriesOutput {
  ticket: PlayerTicketSummary;
  entries: PlayerEntryInfo[];
}

// ─── Get Entry Lines (Player) ───

export interface PlayerGetEntryLinesInput {
  tenantId: string;
  accountId: string;
  entryId: string;
  page: number;
  size: number;
}

export interface PlayerLineInfo {
  boardNo: string;
  lineIndex: number;
  main: number[];
  matchResult: {
    mainMatchCount: number;
    bonusMatched: boolean;
    tier: string | null;
    prizeAmount: number;
  };
}

export interface PlayerGetEntryLinesOutput {
  entryId: string;
  drawId: string;
  lines: PlayerLineInfo[];
  total: number;
  page: number;
  size: number;
}

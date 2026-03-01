/**
 * Mega 6/45 – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Mega 6/45 không có số đặc biệt — chỉ mainNumbers.
 */

// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  currentDraw: PlayerDrawInfo | null;
  activeDraws: PlayerDrawInfo[];
  jackpotCurrentAmount: number;
  lastResult: {
    drawId: string;
    drawDate: string;
    drawNo: number;
    winningMain: number[];
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
  jackpotCurrentAmount: number;
}

// ─── Get Jackpot (Player) ───

export interface PlayerGetJackpotOutput {
  currentAmount: number;
  seedAmount: number;
  progress: {
    current: number;
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
    amountPerDraw: number;
    totalAmount: number;
  };
  boards: Array<{
    boardNo: string;
    playType: string;
    selection: {
      mainNumbers: number[];
    };
    expandedLines: number;
  }>;
  progress: {
    totalDraws: number;
    settledDraws: number;
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
  amount: number;
  lineCount: number;
  entrySummary: {
    ticketNo: string;
    boards: Array<{
      boardNo: string;
      playType: string;
      mainNumbers: number[];
      expandedLines: number;
    }>;
  };
  result?: {
    winningMain: number[];
    publishedAt: string;
  };
  outcome?: string;
  payout?: {
    winAmount: number;
    payoutAmount: number;
    tiers: Array<{
      tier: string;
      hitCount: number;
      unitAmount: number;
      amount: number;
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
    tier: string | null;
    winAmount: number;
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

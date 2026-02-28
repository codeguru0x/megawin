/**
 * Lotto 5/35 – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần — loại bỏ dữ liệu vận hành/công ty.
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
    winningSpecial: number;
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

export interface PlayerListTicketsInput {
  tenantId: string;
  accountId: string;
  page: number;
  size: number;
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
      specialNumbers: number[];
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
  page: number;
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
      specialNumbers: number[];
      expandedLines: number;
    }>;
  };
  result?: {
    winningMain: number[];
    winningSpecial: number;
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

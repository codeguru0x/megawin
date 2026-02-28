/**
 * Keno – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần — loại bỏ dữ liệu vận hành/công ty.
 */

// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  currentDraw: PlayerDrawInfo | null;
  activeDraws: PlayerDrawInfo[];
  lastResult: {
    drawId: string;
    drawDate: string;
    drawNo: number;
    winningNumbers: number[];
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
    betsPerDraw: number;
    amountPerDraw: number;
    totalAmount: number;
  };
  boards: Array<{
    boardNo: string;
    playType: string;
    numbers: string[];
  }>;
  sideBets: Array<{
    playType: string;
    bet: string;
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
  betCount: number;
  entrySummary: {
    ticketNo: string;
    boards: Array<{
      boardNo: string;
      playType: string;
      numbers: string[];
    }>;
    sideBets: Array<{
      playType: string;
      bet: string;
    }>;
  };
  result?: {
    winningNumbers: number[];
    publishedAt: string;
    bigCount: number;
    smallCount: number;
    evenCount: number;
    oddCount: number;
  };
  outcome?: string;
  payout?: {
    winAmount: number;
    payoutAmount: number;
    boardPayouts: Array<{
      boardNo: string;
      playType: string;
      matchCount: number;
      pickCount: number;
      winAmount: number;
    }>;
    sideBetPayouts: Array<{
      playType: string;
      bet: string;
      outcome: string;
      isWin: boolean;
      winAmount: number;
    }>;
  };
}

export interface PlayerGetTicketEntriesOutput {
  ticket: PlayerTicketSummary;
  entries: PlayerEntryInfo[];
}

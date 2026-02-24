import type { KenoPlayType, KenoBigSmallBet, KenoEvenOddBet } from "@megawin/game-keno/entities";
import type { TicketChannel } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// PlaceBet Input
// ─────────────────────────────────────────────

export interface PlaceBetBasicBoardInput {
  boardNo: string;
  /** Số dạng string "01"-"80". */
  numbers: string[];
}

export interface PlaceBetSideBetInput {
  playType: typeof KenoPlayType.BigSmall | typeof KenoPlayType.EvenOdd;
  bet: KenoBigSmallBet | KenoEvenOddBet;
}

export interface PlaceBetInput {
  tenantId: string;
  playerId: string;
  appId?: string;
  accountId?: string;
  channel: TicketChannel;
  startDrawId: string;
  drawCount: number;
  boards: PlaceBetBasicBoardInput[];
  sideBets: PlaceBetSideBetInput[];
}

// ─────────────────────────────────────────────
// PlaceBet Output
// ─────────────────────────────────────────────

export interface PlaceBetOutput {
  ticketId: string;
  ticketNo: string;
  status: string;
  drawPlan: {
    startDrawId: string;
    drawCount: number;
    enrolledDrawIds: string[];
  };
  pricing: {
    unitPrice: number;
    betsPerDraw: number;
    amountPerDraw: number;
    totalAmount: number;
  };
  boardCount: number;
  sideBetCount: number;
  entryCount: number;
}

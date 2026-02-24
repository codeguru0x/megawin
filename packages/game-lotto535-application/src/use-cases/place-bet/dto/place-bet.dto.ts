import type { PlayType } from "@megawin/game-lotto535/entities";
import type { BoardSelection } from "@megawin/game-lotto535/entities";
import type { TicketChannel } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// PlaceBet Input (từ player)
// ─────────────────────────────────────────────

export interface PlaceBetBoardInput {
  boardNo: string;
  playType: PlayType;
  selection: BoardSelection;
}

export interface PlaceBetInput {
  tenantId: string;
  playerId: string;
  appId?: string;
  accountId?: string;
  channel: TicketChannel;
  startDrawId: string;
  drawCount: number;
  boards: PlaceBetBoardInput[];
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
    drawIds: string[];
  };
  pricing: {
    unitPrice: number;
    linesPerDraw: number;
    amountPerDraw: number;
    totalAmount: number;
  };
  boardCount: number;
  entryCount: number;
}

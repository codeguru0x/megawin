import type { PlayType } from "@megawin/game-mega645/entities";
import type { BoardSelection } from "@megawin/game-mega645/entities";
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
  accountId: string;
  username: string;
  channel: TicketChannel;

  drawIds: string[];

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
    drawIds: string[];
    drawCount: number;
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

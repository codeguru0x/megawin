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
  /** DrawId kỳ hiện tại đang mở bán – player phải gửi đúng kỳ đang mở. */
  drawId: string;
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
    enrolledDrawIds: string[];
    enrolledDraws: number;
    remainingDraws: number;
    fullyEnrolled: boolean;
  };
  pricing: {
    unitPrice: number;
    linesPerDraw: number;
    amountPerDraw: number;
    totalAmount: number;
  };
  boardCount: number;
  /** Số entries đã tạo ngay (luôn = 1: chỉ kỳ hiện tại). */
  entryCount: number;
}

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
  accountId: string;
  username: string;
  channel: TicketChannel;
  /** IP address của player lúc đặt cược. Lấy từ CF-Connecting-IP hoặc X-Forwarded-For. */
  ipAddress?: string;

  /**
   * Danh sách drawIds mà player muốn cược.
   * All-or-nothing: 1 draw không hợp lệ → reject toàn bộ.
   */
  drawIds: string[];

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
    drawIds: string[];
    drawCount: number;
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

import type { KenoPlayType, KenoBigSmallBet, KenoEvenOddBet } from "@megawin/game-keno/entities";
import type { TicketChannel } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// PlaceBet Input
// ─────────────────────────────────────────────

/**
 * Input cho 1 board — unified cho cả cơ bản và bổ sung.
 *
 * - Cơ bản (pick1-pick10): numbers bắt buộc, bet = undefined.
 * - Bổ sung (bigSmall/evenOdd): bet bắt buộc, numbers = undefined.
 *
 * playType đã được validate ở Zod handler nên luôn consistent với fields.
 */
export interface PlaceBetBoardInput {
  boardNo: string;
  playType: KenoPlayType;
  /** Số dạng string "01"-"80". Bắt buộc cho cơ bản (pick1-pick10). */
  numbers?: string[];
  /** Lựa chọn side bet. Bắt buộc cho bổ sung (bigSmall/evenOdd). */
  bet?: KenoBigSmallBet | KenoEvenOddBet;
  /** Số lần cược nhân bội cho board (≥ minBetCount). Default 1. */
  betCount: number;
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

  /** Danh sách boards — cả cơ bản (pick) và bổ sung (bigSmall/evenOdd). */
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
    selectionsPerDraw: number;
    betUnitsPerDraw: number;
    amountPerDraw: number;
    totalAmount: number;
  };
  boardCount: number;
  entryCount: number;
}

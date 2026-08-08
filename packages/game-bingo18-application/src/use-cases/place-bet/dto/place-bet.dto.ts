import type { Bingo18PlayType, Bingo18BigSmallBet, Bingo18TripleKind } from "@megawin/game-bingo18/entities";
import type { TicketChannel } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// PlaceBet Input
// ─────────────────────────────────────────────

/**
 * Input cho 1 board — unified cho cả cơ bản và bổ sung.
 *
 * - singleNum: number bắt buộc.
 * - doubleMatch: number bắt buộc.
 * - tripleMatch: tripleKind bắt buộc, number nếu specific.
 * - sumTotal: sum bắt buộc.
 * - bigSmallDraw: bet bắt buộc.
 *
 * playType đã được validate ở Zod handler nên luôn consistent với fields.
 */
export interface PlaceBetBoardInput {
  boardNo: string;
  playType: Bingo18PlayType;
  /** Số đã chọn (1-6). Cho singleNum, doubleMatch, tripleMatch specific. */
  number?: number;
  /** Phân loại triple: "specific" | "any". Chỉ cho tripleMatch. */
  tripleKind?: Bingo18TripleKind;
  /** Tổng cụ thể (3-18). Chỉ cho sumTotal. */
  sum?: number;
  /** Cược lớn/hoà/nhỏ. Chỉ cho bigSmallDraw. */
  bet?: Bingo18BigSmallBet;
  /** Số lần tham gia dự thưởng (≥ minBetCount, ≤ maxBetCount). */
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

  /** Danh sách boards — cả cơ bản và bổ sung. */
  boards: PlaceBetBoardInput[];
}

// ─────────────────────────────────────────────
// PlaceBet Output
// ─────────────────────────────────────────────

export interface PlaceBetOutput {
  ticketId: string;
  ticketNo: string;
  status: string;
  /** Số dư ví player sau khi trừ tiền cược (VND). Từ response tenant. */
  balance: number;
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

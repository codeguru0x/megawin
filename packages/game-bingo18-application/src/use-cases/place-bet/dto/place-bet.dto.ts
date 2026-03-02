import type {
  Bingo18PlayType,
  Bingo18SideBetPlayType,
  Bingo18BigSmallBet,
  Bingo18TripleKind,
} from "@megawin/game-bingo18/entities";
import type { TicketChannel } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// PlaceBet Input
// ─────────────────────────────────────────────

/**
 * Board cơ bản: Một số / Hai số trùng / Ba số trùng.
 */
export interface PlaceBetBasicBoardInput {
  boardNo: string;
  playType: typeof Bingo18PlayType.SingleNum
    | typeof Bingo18PlayType.DoubleMatch
    | typeof Bingo18PlayType.TripleMatch;
  /** Số đã chọn (1-6). Bắt buộc cho singleNum/doubleMatch, optional cho tripleMatch "any". */
  number?: number;
  /** Chỉ dùng cho tripleMatch: "specific" hoặc "any". */
  tripleKind?: Bingo18TripleKind;
}

/**
 * Side bet: Cộng tổng / Lớn Hòa Nhỏ.
 */
export interface PlaceBetSideBetInput {
  playType: Bingo18SideBetPlayType;
  /** Tổng cụ thể (3-18) cho sumTotal. */
  sum?: number;
  /** big/draw/small cho bigSmallDraw. */
  bet?: Bingo18BigSmallBet;
}

export interface PlaceBetInput {
  tenantId: string;
  accountId: string;
  username: string;
  channel: TicketChannel;

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

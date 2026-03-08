/**
 * Bingo 18 SDK – Public Types
 * @module
 */

import type { Bingo18PlayType, Bingo18TripleKind, Bingo18BigSmallBet } from "./enums";

// ─────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────

export interface Bingo18BasicBoard {
  playType: "singleNum" | "doubleMatch" | "tripleMatch";
  number?: number;
  kind?: Bingo18TripleKind;
}

export interface Bingo18SideBet {
  playType: "sumTotal" | "bigSmallDraw";
  sum?: number;
  bet?: Bingo18BigSmallBet;
}

export interface Bingo18TicketPurchaseInput {
  drawIds: string[];
  boards: Bingo18BasicBoard[];
  sideBets: Bingo18SideBet[];
}

// ─────────────────────────────────────────────
// Response Types — Game Config
// ─────────────────────────────────────────────

export interface Bingo18GameRules {
  unitPrice: number;
  maxBasicBoardsPerTicket: number;
  maxDrawCount: number;
  drawIntervalMinutes: number;
  firstDrawTime: string;
  lastDrawTime: string;
  timezone: string;
}

export interface Bingo18SingleNumPrizesConfig {
  match1: number;
  match2: number;
  match3: number;
}

export interface Bingo18DoubleMatchPrizesConfig {
  win: number;
}

export interface Bingo18TripleMatchPrizesConfig {
  specific: number;
  any: number;
}

/** Key: tổng (3-18) → tiền thưởng (VND). */
export type Bingo18SumTotalPrizesConfig = Record<number, number>;

export interface Bingo18BigSmallDrawPrizesConfig {
  big: number;
  draw: number;
  small: number;
}

export interface Bingo18PrizesConfig {
  singleNum: Bingo18SingleNumPrizesConfig;
  doubleMatch: Bingo18DoubleMatchPrizesConfig;
  tripleMatch: Bingo18TripleMatchPrizesConfig;
  sumTotal: Bingo18SumTotalPrizesConfig;
  bigSmallDraw: Bingo18BigSmallDrawPrizesConfig;
}

export interface Bingo18TenantConfig {
  isEnabled: boolean;
}

/**
 * Response từ `GET /games/bingo18/config`.
 */
export interface Bingo18GameConfigResponse {
  game: Bingo18GameRules;
  prizes: Bingo18PrizesConfig;
  tenant: Bingo18TenantConfig;
}

// ─────────────────────────────────────────────
// Response Types — Draw / Ticket
// ─────────────────────────────────────────────

export interface Bingo18DrawInfo {
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

/**
 * Tóm tắt vé Bingo 18 cho UI.
 *
 * @example
 * ```ts
 * const { tickets } = await client.bingo18.listPendingTickets();
 * for (const ticket of tickets) {
 *   const voided = ticket.voidSummary?.voidedDrawCount ?? 0;
 *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ (${voided} void)`);
 *   if (ticket.voidSummary) {
 *     console.log(`Đã hoàn: ${ticket.voidSummary.totalRefundedAmount} VND`);
 *   }
 * }
 * ```
 */
export interface Bingo18TicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. VD: `"B18-20260307-00007"`. */
  ticketNo: string;
  /** Trạng thái vé. */
  status: string;
  /** Kế hoạch kỳ quay. */
  drawPlan: {
    drawIds: string[];
    drawCount: number;
  };
  /** Thông tin giá cược. */
  pricing: {
    unitPrice: number;
    betsPerDraw: number;
    amountPerDraw: number;
    totalAmount: number;
  };
  /** Danh sách boards chơi cơ bản. */
  boards: Array<{
    boardNo: string;
    playType: string;
    number?: number;
    tripleKind?: string;
  }>;
  /** Danh sách side bets. */
  sideBets: Array<{
    playType: string;
    sum?: number;
    bet?: string;
  }>;
  /**
   * Tiến độ settle.
   * settledDraws = số kỳ đã xử lý xong (settled + voided).
   */
  progress: {
    totalDraws: number;
    settledDraws: number;
  };
  /** Tổng kết trả thưởng. `undefined` nếu chưa có kỳ nào settle. */
  settlement?: {
    totalWinAmount: number;
    lastSettledAt?: string;
  };
  /**
   * Tóm tắt huỷ cược. `undefined` nếu không có kỳ nào bị void.
   */
  voidSummary?: {
    totalVoidedAmount: number;
    totalRefundedAmount: number;
    voidedDrawCount: number;
    voidedDrawIds: string[];
    lastVoidedAt?: string;
  };
  /** Thời điểm mua vé (ISO 8601). */
  createdAt: string;
}

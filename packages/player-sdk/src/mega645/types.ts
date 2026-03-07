/**
 * Mega 6/45 SDK – Public Types
 *
 * @module
 */

import type { Mega645PlayType, Mega645PrizeTier } from "./enums";

// ─────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────

export interface Mega645SelectionInput {
  mainNumbers: string[];
}

export interface Mega645BoardInput {
  boardNo: string;
  playType: Mega645PlayType;
  selection: Mega645SelectionInput;
}

export interface Mega645TicketPurchaseInput {
  drawId: string;
  drawCount: number;
  boards: Mega645BoardInput[];
}

// ─────────────────────────────────────────────
// Response Types — Game Config
// ─────────────────────────────────────────────

export interface Mega645GameRules {
  unitPrice: number;
  maxBoardsPerTicket: number;
  maxDrawCount: number;
  drawsPerWeek: number;
  /** Ngày quay trong tuần (0=CN, 3=T4, 5=T6). */
  drawDaysOfWeek: number[];
  /** Giờ quay. VD: "18:00". */
  drawTime: string;
}

export interface Mega645PrizeAmounts {
  tier1: number;
  tier2: number;
  tier3: number;
}

export interface Mega645JackpotConfigInfo {
  seedAmount: number;
  splitThreshold: number;
}

export interface Mega645TenantConfig {
  isEnabled: boolean;
}

/**
 * Response từ `GET /games/mega645/config`.
 */
export interface Mega645GameConfigResponse {
  game: Mega645GameRules;
  prizes: Mega645PrizeAmounts;
  jackpot: Mega645JackpotConfigInfo;
  tenant: Mega645TenantConfig;
}

// ─────────────────────────────────────────────
// Response Types — Draw / Ticket / Entry
// ─────────────────────────────────────────────

export interface Mega645DrawInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  status: string;
  sales: {
    openAt?: string;
    closeAt: string;
  };
  jackpotCurrentAmount: number;
  isSplitCycle?: boolean;
}

/**
 * Tóm tắt vé Mega 6/45 cho UI.
 *
 * @example
 * ```ts
 * const { tickets } = await client.mega645.listPendingTickets();
 * for (const ticket of tickets) {
 *   const voided = ticket.voidSummary?.voidedDrawCount ?? 0;
 *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ (${voided} void)`);
 *   if (ticket.voidSummary) {
 *     console.log(`Đã hoàn: ${ticket.voidSummary.totalRefundedAmount} VND`);
 *   }
 * }
 * ```
 */
export interface Mega645TicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. */
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
    linesPerDraw: number;
    amountPerDraw: number;
    totalAmount: number;
  };
  /** Danh sách boards trong vé. */
  boards: Array<{
    boardNo: string;
    playType: Mega645PlayType;
    selection: {
      mainNumbers: string[];
    };
    expandedLines: number;
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

export interface Mega645EntryResult {
  drawId: string;
  drawDate: string;
  status: string;
  amount: number;
  result?: { winningMain: number[]; publishedAt: string };
  payout?: {
    winAmount: number;
    tiers: Array<{
      tier: Mega645PrizeTier;
      label: string;
      hitCount: number;
      amount: number;
      splitBonus?: number;
    }>;
  };
}

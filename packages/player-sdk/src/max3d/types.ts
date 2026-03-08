/**
 * Max 3D SDK – Public Types
 * @module
 */

import type { Max3dPlayMode, Max3dPlayType } from "./enums";

// ─────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────

export interface Max3dBoardInput {
  boardNo: string;
  playMode: Max3dPlayMode;
  playType: Max3dPlayType;
  /** 1 bộ ba số cho basic, 2 bộ ba số cho plus. */
  triplets: string[];
}

export interface Max3dTicketPurchaseInput {
  drawId: string;
  drawCount: number;
  boards: Max3dBoardInput[];
}

// ─────────────────────────────────────────────
// Response Types — Game Config
// ─────────────────────────────────────────────

export interface Max3dGameRules {
  unitPrice: number;
  maxBoardsPerTicket: number;
  maxDrawCount: number;
  drawsPerDay: number;
  drawTimes: string[];
  /** Ngày quay trong tuần (0=CN, 1=T2, 3=T4, 5=T6). */
  drawDaysOfWeek: number[];
}

export interface Max3dBasicPrizeAmounts {
  special: number;
  first: number;
  second: number;
  third: number;
}

export interface Max3dComboPrizeAmounts {
  combo3: Max3dBasicPrizeAmounts;
  combo6: Max3dBasicPrizeAmounts;
}

export interface Max3dPlusPrizeAmounts {
  special: number;
  first: number;
  second: number;
  third: number;
  fourth: number;
  fifth: number;
  sixth: number;
}

export interface Max3dPrizesConfig {
  basic: Max3dBasicPrizeAmounts;
  combo: Max3dComboPrizeAmounts;
  plus: Max3dPlusPrizeAmounts;
}

export interface Max3dTenantConfig {
  isEnabled: boolean;
}

/**
 * Response từ `GET /games/max3d/config`.
 */
export interface Max3dGameConfigResponse {
  game: Max3dGameRules;
  prizes: Max3dPrizesConfig;
  tenant: Max3dTenantConfig;
}

// ─────────────────────────────────────────────
// Response Types — Draw / Ticket
// ─────────────────────────────────────────────

export interface Max3dDrawInfo {
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
 * Tóm tắt vé Max 3D cho UI.
 *
 * @example
 * ```ts
 * const { tickets } = await client.max3d.listPendingTickets();
 * for (const ticket of tickets) {
 *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ`);
 *   if (ticket.voidSummary) {
 *     const type = ticket.voidSummary.isFullVoid ? "full void" : "partial void";
 *     console.log(`[${type}] boards: ${ticket.voidSummary.voidedBoards.join(", ")}, hoàn: ${ticket.voidSummary.refundAmount} VND`);
 *   }
 * }
 * ```
 */
export interface Max3dTicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. VD: `"M3D-20260307-00005"`. */
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
    playMode: string;
    playType: string;
    triplets: string[];
    lineCount: number;
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
   * Tóm tắt huỷ cược. `undefined` nếu không có void.
   * Max3D void theo board (không phải theo draw).
   */
  voidSummary?: {
    /** True nếu toàn bộ vé bị void. */
    isFullVoid: boolean;
    /** Danh sách boardNo bị void. */
    voidedBoards: string[];
    /** Tiền cược gốc trước khi void (VND). */
    originalAmount: number;
    /** Tiền đã hoàn trả cho player (VND). */
    refundAmount: number;
    /** Thời điểm void (ISO 8601). */
    voidedAt: string;
  };
  /** Thời điểm mua vé (ISO 8601). */
  createdAt: string;
}

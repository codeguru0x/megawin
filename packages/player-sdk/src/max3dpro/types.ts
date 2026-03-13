/**
 * Max 3D Pro SDK – Public Types
 * @module
 */

import type { Max3dproPlayMode } from "./enums";

// ─────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────

export interface Max3dproMultiNumberInput {
  playMode: "multiNumber";
  triplets: string[];
}

export interface Max3dproMultiDigitInput {
  playMode: "multiDigit";
  frontDigits: number[];
  backDigits: number[];
}

export interface Max3dproBoardInput {
  boardNo: string;
  playMode: Max3dproPlayMode;
  triplets?: string[];
  frontDigits?: number[];
  backDigits?: number[];
}

export interface Max3dproTicketPurchaseInput {
  drawId: string;
  drawCount: number;
  boards: Max3dproBoardInput[];
}

// ─────────────────────────────────────────────
// Response Types — Game Config
// ─────────────────────────────────────────────

export interface Max3dproGameRules {
  unitPrice: number;
  maxBoardsPerTicket: number;
  maxDrawCount: number;
  drawsPerDay: number;
  drawTimes: string[];
  /** Ngày quay trong tuần (0=CN, 2=T3, 4=T5, 6=T7). */
  drawDaysOfWeek: number[];
  /** Số bộ ba số tối thiểu cho multiNumber mode. */
  multiNumberMin: number;
  /** Số bộ ba số tối đa cho multiNumber mode. */
  multiNumberMax: number;
}

export interface Max3dproPrizeAmounts {
  /** Giải Đặc Biệt: đúng thứ tự quay (VND). */
  special: number;
  /** Giải phụ Đặc Biệt: ngược thứ tự quay (VND). */
  specialSub: number;
  first: number;
  second: number;
  third: number;
  fourth: number;
  fifth: number;
  sixth: number;
}

export interface Max3dproTenantConfig {
  isEnabled: boolean;
}

/**
 * Response từ `GET /games/max3dpro/config`.
 */
export interface Max3dproGameConfigResponse {
  game: Max3dproGameRules;
  prizes: Max3dproPrizeAmounts;
  tenant: Max3dproTenantConfig;
}

// ─────────────────────────────────────────────
// Response Types — Draw / Ticket
// ─────────────────────────────────────────────

export interface Max3dproDrawInfo {
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
 * Tóm tắt vé Max 3D Pro cho UI.
 *
 * @example
 * ```ts
 * const { tickets } = await client.max3dpro.listPendingTickets();
 * for (const ticket of tickets) {
 *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ`);
 *   if (ticket.voidSummary) {
 *     const type = ticket.voidSummary.isFullVoid ? "full void" : "partial void";
 *     console.log(`[${type}] boards: ${ticket.voidSummary.voidedBoards.join(", ")}, hoàn: ${ticket.voidSummary.refundAmount} VND`);
 *   }
 * }
 * ```
 */
export interface Max3dproTicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. VD: `"M3DP-20260307-00004"`. */
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
    /** Danh sách bộ ba số (dùng cho multiNumber). */
    triplets: string[];
    /** Các chữ số đầu (dùng cho multiDigit). */
    frontDigits?: number[];
    /** Các chữ số cuối (dùng cho multiDigit). */
    backDigits?: number[];
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
   * Max3D Pro void theo board (không phải theo draw).
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

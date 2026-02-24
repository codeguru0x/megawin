/**
 * Keno – Ticket Document
 *
 * Collection: kenoTickets
 *
 * 1 document = 1 vé Keno (purchase intent).
 * Mỗi vé có thể chứa cả lựa chọn cơ bản (panels A, B) và bổ sung (panel C).
 *
 * Keno cho phép:
 * - Panel A, B: chọn 1-10 số từ "01"-"80" (cách chơi cơ bản)
 * - Panel C: đặt cược Lớn/Nhỏ hoặc Chẵn/Lẻ (cách chơi bổ sung)
 * - Mệnh giá: 10.000đ mỗi lần tham gia
 * - Chơi nhiều kỳ liên tiếp (multi-draw, lazy enrollment)
 */

import type {
  KenoBigSmallBet,
  KenoEvenOddBet,
  KenoPlayType,
} from "./enums";
import type { TicketChannel, TicketStatus, GameProduct } from "@megawin/game-core/entities";
import type { ISODateString } from "./types";

// ─────────────────────────────────────────────
// Board – Cách chơi cơ bản (Panel A/B)
// ─────────────────────────────────────────────

/**
 * 1 board cách chơi cơ bản trên vé Keno.
 * Số lưu dạng string "01"-"80" (zero-padded 2 chữ số).
 */
export interface BasicBoard {
  boardNo: string;
  isVoid?: boolean;
  playType: KenoPlayType;
  /** Danh sách số đã chọn ("01"-"80"), unique, sorted tăng dần. */
  numbers: string[];
}

// ─────────────────────────────────────────────
// Side Bet – Cách chơi bổ sung (Panel C)
// ─────────────────────────────────────────────

export interface SideBet {
  isVoid?: boolean;
  playType: typeof import("./enums").KenoPlayType.BigSmall | typeof import("./enums").KenoPlayType.EvenOdd;
  bet: KenoBigSmallBet | KenoEvenOddBet;
}

// ─────────────────────────────────────────────
// Ticket Document
// ─────────────────────────────────────────────

export interface TicketDoc {
  _id: unknown;

  // ───── Ownership / Multi-tenant ─────

  tenantId: string;
  playerId: string;
  appId?: string;
  accountId?: string;

  // ───── Ticket Identity ─────

  product: typeof GameProduct.Keno;
  ticketNo: string;
  channel: TicketChannel;

  // ───── Draw Plan (lazy enrollment) ─────

  drawPlan: {
    startDrawId: string;
    drawCount: number;
    /** drawIds đã enroll (chỉ kỳ đầu khi tạo, worker bổ sung sau). */
    enrolledDrawIds: string[];
    enrolledDraws: number;
    remainingDraws: number;
    fullyEnrolled: boolean;
    startDate?: ISODateString;
    endDate?: ISODateString;
  };

  // ───── Pricing ─────

  pricing: {
    unitPrice: number;
    betsPerDraw: number;
    amountPerDraw: number;
    totalAmount: number;
  };

  // ───── Tenant Snapshot ─────

  tenantSnapshot: {
    commissionRate: number;
  };

  // ───── Boards cơ bản (Panel A/B) ─────

  boards: BasicBoard[];

  // ───── Side Bets (Panel C) ─────

  sideBets: SideBet[];

  // ───── Immutability / Audit ─────

  audit: {
    version: number;
    immutableAt?: Date;
  };

  // ───── Progress ─────

  progress: {
    totalDraws: number;
    settledDraws: number;
    pendingDraws: number;
    nextDrawId?: string;
  };

  // ───── Settlement Summary ─────

  settlement?: {
    totalWinAmount: number;
    lastSettledAt?: Date;
  };

  // ───── Void / Refund Summary ─────

  /**
   * Tóm tắt huỷ cược trên ticket.
   * Multi-draw: 1+ kỳ void → partial refund.
   * Single-draw: kỳ duy nhất void → full refund, status = refunded.
   */
  voidSummary?: {
    totalVoidedAmount: number;
    totalRefundedAmount: number;
    voidedDrawCount: number;
    voidedDrawIds: string[];
    lastVoidedAt?: Date;
  };

  // ───── Status & Timestamps ─────

  status: TicketStatus;

  createdAt: Date;
  updatedAt: Date;
}

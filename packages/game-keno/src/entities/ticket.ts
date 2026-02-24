/**
 * Keno – Ticket Document
 *
 * Collection: kenoTickets
 *
 * 1 document = 1 vé Keno (purchase intent).
 * Mỗi vé có thể chứa cả lựa chọn cơ bản (panels A, B) và bổ sung (panel C).
 *
 * Keno cho phép:
 * - Panel A, B: chọn 1-10 số từ 01-80 (cách chơi cơ bản)
 * - Panel C: đặt cược Lớn/Nhỏ hoặc Chẵn/Lẻ (cách chơi bổ sung)
 * - Mệnh giá: 10.000đ mỗi lần tham gia
 * - Chơi nhiều kỳ liên tiếp (multi-draw)
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
 * Mỗi board chọn 1-10 số, tương ứng 1 play type (pick1-pick10).
 */
export interface BasicBoard {
  /**
   * Mã board: "A", "B".
   */
  boardNo: string;

  isVoid?: boolean;

  /**
   * Kiểu chơi: pick1-pick10.
   * Xác định bởi số lượng số đã chọn.
   */
  playType: KenoPlayType;

  /** Danh sách số đã chọn (1-80), unique, sorted. */
  numbers: number[];
}

// ─────────────────────────────────────────────
// Side Bet – Cách chơi bổ sung (Panel C)
// ─────────────────────────────────────────────

/**
 * Cược bổ sung trên vé Keno.
 * Người chơi có thể chọn 1 trong các cách chơi bổ sung.
 * Chỉ được chọn 1 loại cược bổ sung (Lớn/Nhỏ HOẶC Chẵn/Lẻ) trên Panel C.
 */
export interface SideBet {
  isVoid?: boolean;

  /**
   * Loại cược bổ sung.
   * - "bigSmall": Lớn/Nhỏ
   * - "evenOdd": Chẵn/Lẻ
   */
  playType: typeof import("./enums").KenoPlayType.BigSmall | typeof import("./enums").KenoPlayType.EvenOdd;

  /**
   * Lựa chọn cược cụ thể.
   * Khi playType = "bigSmall": big | bigSmallDraw | small
   * Khi playType = "evenOdd": even | even1112 | evenOddDraw | odd1112 | odd
   */
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

  // ───── Draw Plan ─────

  drawPlan: {
    startDrawId: string;
    drawCount: number;
    drawIds: string[];
    startDate?: ISODateString;
    endDate?: ISODateString;
  };

  // ───── Pricing ─────

  pricing: {
    /** Mệnh giá 1 lần tham gia (VND). Keno = 10.000đ. */
    unitPrice: number;

    /**
     * Số lượng "bets" trên vé cho 1 kỳ.
     * = số boards cơ bản + số side bets.
     * Mỗi bet = 1 × unitPrice.
     */
    betsPerDraw: number;

    /** Tiền cược mỗi kỳ = unitPrice × betsPerDraw. */
    amountPerDraw: number;

    /** Tổng tiền vé = amountPerDraw × drawCount. */
    totalAmount: number;
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
    remainingDraws: number;
    nextDrawId?: string;
  };

  // ───── Settlement Summary ─────

  settlement?: {
    totalWinAmount: number;
    lastSettledAt?: Date;
  };

  // ───── Status & Timestamps ─────

  status: TicketStatus;

  createdAt: Date;
  updatedAt: Date;
}

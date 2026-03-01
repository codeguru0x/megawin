/**
 * Mega 6/45 – Ticket Document
 *
 * Collection: mega645Tickets
 *
 * 1 document = 1 vé mua.
 * Mỗi vé có tối đa 6 boards (A-F).
 */

import type { PlayType } from "./enums";
import type { TicketChannel, TicketStatus } from "@megawin/game-core/entities";
import type { ISODateString, BoardSelection } from "./types";

// ─────────────────────────────────────────────
// Board
// ─────────────────────────────────────────────

export interface Board {
  boardNo: string;
  isVoid?: boolean;
  playType: PlayType;
  selection: BoardSelection;
  derived: {
    expandedLines: number;
    /** Kích thước bao (chỉ khi bao5, bao7-18). */
    baoSize?: number;
  };
}

// ─────────────────────────────────────────────
// Ticket Document
// ─────────────────────────────────────────────

export interface TicketDoc {
  _id: unknown;

  tenantId: string;
  accountId: string;
  username: string;

  ticketNo: string;
  channel: TicketChannel;

  drawPlan: {
    drawIds: string[];
    drawCount: number;
  };

  pricing: {
    unitPrice: number;
    linesPerDraw: number;
    amountPerDraw: number;
    totalAmount: number;
  };

  boards: Board[];
  lineCount: number;

  progress: {
    totalDraws: number;
    settledDraws: number;
  };

  settlement?: {
    totalWinAmount: number;
    lastSettledAt?: Date;
  };

  voidSummary?: {
    totalVoidedAmount: number;
    totalRefundedAmount: number;
    voidedDrawCount: number;
    voidedDrawIds: string[];
    lastVoidedAt?: Date;
  };

  status: TicketStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

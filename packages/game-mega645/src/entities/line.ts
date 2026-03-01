/**
 * Mega 6/45 – Ticket Line Document
 *
 * Collection: mega645TicketLines
 *
 * 1 document = 1 line con (bộ 6 số) thuộc về 1 entry.
 * Lines tạo khi settle, immutable sau insert.
 */

import type { PrizeTier } from "./enums";
import type { MainTuple } from "./types";

// ─────────────────────────────────────────────
// Line Match Result
// ─────────────────────────────────────────────

export interface LineMatchResult {
  /** Số lượng số chính trùng (0-6). */
  mainMatchCount: number;
  tier: PrizeTier | null;
  winAmount: number;
}

// ─────────────────────────────────────────────
// Line Document
// ─────────────────────────────────────────────

export interface TicketLineDoc {
  _id: unknown;

  tenantId: string;
  accountId: string;
  username: string;

  ticketId: unknown;
  entryId: unknown;
  drawId: string;

  boardNo: string;
  lineIndex: number;

  /** 6 số chính, sorted tăng dần. */
  main: MainTuple;

  matchResult: LineMatchResult;

  createdAt: Date;
}

/**
 * Max 3D Pro – Ticket Line Document
 *
 * Collection: max3d_pro_ticket_lines
 *
 * 1 document = 1 cặp hai bộ ba số trong 1 entry.
 * Tạo khi settle, immutable sau insert.
 */

import type { PrizeTier, PlayMode, PlayType } from "./enums";
import type { Triplet, ISODateString } from "./types";

// ─────────────────────────────────────────────
// Line Match Result
// ─────────────────────────────────────────────

export interface LineMatchResult {
  /** Hạng giải trúng (null = không trúng). */
  tier: PrizeTier | null;
  /** Tiền thưởng cho line này. */
  winAmount: number;
  /** Chi tiết matching. */
  matchDetails?: string;
}

// ─────────────────────────────────────────────
// Ticket Line Document
// ─────────────────────────────────────────────

export interface TicketLineDoc {
  _id: unknown;
  tenantId: string;
  accountId: string;
  ticketId: string;
  entryId: string;
  drawId: string;
  drawDate: ISODateString;

  boardNo: string;
  lineIndex: number;

  playMode: PlayMode;
  playType: PlayType;

  /** Cặp hai bộ ba số (first, second). */
  triplets: Triplet[];

  matchResult: LineMatchResult;

  createdAt: Date;
}

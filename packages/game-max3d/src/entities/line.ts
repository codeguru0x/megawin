/**
 * Max 3D – Ticket Line Document
 *
 * Collection: max3d_ticket_lines
 *
 * 1 document = 1 bộ ba số (hoặc 1 cặp bộ ba số cho Max 3D+) trong 1 entry.
 * Tạo khi settle, immutable sau insert.
 */

import type {
  BasicPrizeTier,
  PlusPrizeTier,
  PlayMode,
  PlayType,
} from "./enums";
import type { Triplet, ISODateString } from "./types";

// ─────────────────────────────────────────────
// Line Match Result
// ─────────────────────────────────────────────

export interface LineMatchResult {
  /** Hạng giải trúng (null = không trúng). */
  tier: BasicPrizeTier | PlusPrizeTier | null;
  /** Tiền thưởng cho line này. */
  winAmount: number;
  /** Chi tiết matching (tier nào, hit count). */
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

  /** Bộ ba số (1 cho basic, 2 cho plus). */
  triplets: Triplet[];

  matchResult: LineMatchResult;

  createdAt: Date;
}

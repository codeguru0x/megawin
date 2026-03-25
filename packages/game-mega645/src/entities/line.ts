/**
 * Mega 6/45 – Ticket Line Document
 *
 * Collection: mega645TicketLines
 *
 * 1 document = 1 line con (bộ 6 số) thuộc về 1 entry.
 * Lines tạo khi settle, immutable sau insert.
 */

import type { PrizeTier } from "./enums";
import type { ISODateString } from "./types";

// ─────────────────────────────────────────────
// Line Match Result
// ─────────────────────────────────────────────

/** Kết quả so khớp 1 line với kết quả quay. */
export interface LineMatchResult {
  /** Số lượng số trùng (0-6). */
  matchCount: number;
  /** Hạng giải trúng (null nếu < 3 số trùng → không trúng). */
  tier: PrizeTier | null;
  /** Tiền thưởng cho line này (VND). 0 nếu không trúng. */
  winAmount: number;
}

// ─────────────────────────────────────────────
// Line Document
// ─────────────────────────────────────────────

export interface TicketLineDoc {
  /** MongoDB document ID. */
  _id: unknown;

  /** ID đại lý (tenant). */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Tên đăng nhập người chơi. */
  username: string;

  /** Tham chiếu đến vé gốc (mega645Tickets._id). */
  ticketId: string;
  /** Tham chiếu đến entry (mega645TicketEntries._id). */
  entryId: string;
  /** ID kỳ quay. Format: "YYYY-MM-DD.001". */
  drawId: string;

  /** Ngày tài chính "YYYY-MM-DD". */
  financialDate: ISODateString;

  /** Ký hiệu board chứa line ("A".."F"). */
  boardNo: string;
  /** Chỉ số line trong board (0-based). Với standard luôn = 0. */
  lineIndex: number;

  /** 6 số, sorted tăng dần. */
  numbers: string[];

  /** Số lần cược nhân bội cho board chứa line này. */
  betCount: number;

  /** Kết quả so khớp line với kết quả quay. */
  matchResult: LineMatchResult;

  /** Thời điểm tạo document (= thời điểm settle). */
  createdAt: Date;
}

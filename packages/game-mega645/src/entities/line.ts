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

/** Kết quả so khớp 1 line với kết quả quay. */
export interface LineMatchResult {
  /** Số lượng số chính trùng (0-6). */
  mainMatchCount: number;
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
  ticketId: unknown;
  /** Tham chiếu đến entry (mega645TicketEntries._id). */
  entryId: unknown;
  /** ID kỳ quay. Format: "YYYY-MM-DD.001". */
  drawId: string;

  /** Ký hiệu board chứa line ("A".."F"). */
  boardNo: string;
  /** Chỉ số line trong board (0-based). Với standard/quickPick luôn = 0. */
  lineIndex: number;

  /** 6 số chính, sorted tăng dần. */
  main: MainTuple;

  /** Kết quả so khớp line với kết quả quay. */
  matchResult: LineMatchResult;

  /** Thời điểm tạo document (= thời điểm settle). */
  createdAt: Date;
}

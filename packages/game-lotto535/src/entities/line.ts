/**
 * Lotto 5/35 – Ticket Line Document
 *
 * Collection: lotto535TicketLines
 *
 * 1 document = 1 line con (bộ số con) thuộc về 1 entry (1 ticket × 1 draw).
 * Line là kết quả expand từ board selection:
 *   - standard:     1 line
 *   - mainCover4:   31 lines
 *   - mainCover N:  C(N,5) lines (ví dụ bao 15 → 3003 lines)
 *   - specialCover: K lines
 *
 * Lines được tạo tại thời điểm settle, gắn kết quả match ngay khi tạo.
 * Mỗi doc là IMMUTABLE sau khi insert — không bao giờ update.
 *
 * Kỳ void: KHÔNG tạo lines (không có draw result để match).
 *
 * Pattern naming: {Game}TicketLineDoc – áp dụng cho mọi game.
 */

import type { PrizeTier } from "./enums";
import type { ISODateString } from "./types";

// ─────────────────────────────────────────────
// Line Match Result
// ─────────────────────────────────────────────

/** Kết quả match 1 line với draw result — ghi ngay khi settle. */
export interface LineMatchResult {
  /** Số lượng số chính trùng (0-5). */
  mainMatchCount: number;

  /** Số đặc biệt có trùng không. */
  specialMatched: boolean;

  /** Hạng giải trúng (null nếu không trúng). */
  tier: PrizeTier | null;

  /** Tiền thưởng line này (0 nếu không trúng). */
  winAmount: number;
}

// ─────────────────────────────────────────────
// Line Document
// ─────────────────────────────────────────────

export interface TicketLineDoc {
  /** MongoDB ObjectId. */
  _id: unknown;

  // ───── Ownership ─────

  /** Tenant sở hữu – dùng cho access control. */
  tenantId: string;

  /** ID tài khoản người chơi. */
  accountId: string;

  /** Username hiển thị. */
  username: string;

  // ───── References ─────

  /** Tham chiếu ticket gốc (ObjectId). */
  ticketId: unknown;

  /** Tham chiếu entry (ObjectId) — 1 entry = 1 ticket × 1 draw. */
  entryId: unknown;

  /** ID kỳ quay mà line thuộc về. */
  drawId: string;

  // ───── Timing ─────

  /**
   * Ngày tài chính "YYYY-MM-DD" — ngày dùng cho báo cáo doanh thu.
   * Tính từ 11h sáng → 11h sáng hôm sau (Asia/Ho_Chi_Minh).
   * Có thể khác drawDate nếu kỳ quay qua đêm.
   */
  financialDate: ISODateString;

  // ───── Line Data ─────

  /** Board mà line này thuộc về ("A", "B", ...). */
  boardNo: string;

  /**
   * Index line trong entry (0-based, global across all boards).
   * Dùng để paginate ổn định khi hiển thị danh sách lines.
   * Cặp (entryId, lineIndex) là unique — dùng làm dedup key khi upsert.
   */
  lineIndex: number;

  /** 5 số chính của line, sorted tăng dần (canonical). */
  main: string[];

  /** 1 số đặc biệt của line. */
  special: string;

  // ───── Match Result ─────

  /** Kết quả match với draw result — gắn ngay khi tạo (settle time). */
  matchResult: LineMatchResult;

  /** Thời điểm tạo line document (= thời điểm settle). Immutable sau insert. */
  createdAt: Date;
}

/**
 * Max 3D – Ticket Line Document
 *
 * Collection: max3d_ticket_lines
 *
 * 1 document = 1 bộ ba số (hoặc 1 cặp bộ ba số cho Max 3D+) trong 1 entry.
 * Tạo khi settle, immutable sau insert.
 */

import type { BasicPrizeTier, PlusPrizeTier, PlayMode, PlayType } from "./enums";
import type { Triplet, ISODateString } from "./types";

// ─────────────────────────────────────────────
// Line Match Result
// ─────────────────────────────────────────────

export interface LineMatchResult {
  /** Hạng giải trúng (null = không trúng). */
  tier: BasicPrizeTier | PlusPrizeTier | null;

  /** Tiền thưởng thực tế = unitWinAmount × betCount (VND). */
  winAmount: number;

  /** Chi tiết matching (tier nào, hit count). */
  matchDetails?: string;
}

// ─────────────────────────────────────────────
// Ticket Line Document
// ─────────────────────────────────────────────

export interface TicketLineDoc {
  _id: unknown;

  // ───── Ownership ─────

  /** ID tenant (denormalized cho access control). */
  tenantId: string;

  /** ID tài khoản player (denormalized cho query). */
  accountId: string;

  /** Username hiển thị của player (denormalized, snapshot lúc place-bet). */
  username: string;

  // ───── References ─────

  /** Reference đến ticket gốc (ObjectId as string). */
  ticketId: string;

  /** Reference đến entry (ObjectId as string). */
  entryId: string;

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

  /** Bảng gốc: "A", "B", "C", "D". Cho biết line thuộc bảng nào. */
  boardNo: string;

  /**
   * Thứ tự line trong toàn bộ entry (0-based, global across all boards).
   * Cặp (entryId, lineIndex) là unique — dùng làm dedup key khi upsert.
   */
  lineIndex: number;

  /** Chế độ chơi: "basic" (1 bộ ba) hoặc "plus" (2 bộ ba). */
  playMode: PlayMode;

  /** Kiểu chơi: "straight", "combo3", "combo6". */
  playType: PlayType;

  /** Bộ ba số (1 cho basic, 2 cho plus). */
  triplets: Triplet[];

  /** Số lần cược nhân bội của board chứa line này. Giải thích tại sao winAmount > giá trị 1 unit. */
  betCount: number;

  // ───── Match Result ─────

  /** Kết quả match với draw result — gắn ngay khi tạo (settle time). */
  matchResult: LineMatchResult;

  /** Thời điểm tạo document (= thời điểm settle). Immutable sau insert. */
  createdAt: Date;
}

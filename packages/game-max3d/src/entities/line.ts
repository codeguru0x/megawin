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

/**
 * 1 giải trúng trong kết quả gộp giải của 1 line.
 * Theo luật Vietlott Max 3D: 1 bộ ba / 1 cặp / 1 hoán vị có thể trúng nhiều giải đồng thời.
 */
export interface LineWonTier {
  /** Hạng giải trúng. Basic: special/first/second/third. Plus: special–sixth. */
  tier: BasicPrizeTier | PlusPrizeTier;
  /**
   * Tiền thưởng hạng giải này (VND).
   * Đã nhân betCount tại settle layer.
   */
  winAmount: number;
}

export interface LineMatchResult {
  /**
   * Danh sách các giải trúng (gộp giải theo luật Vietlott Max 3D).
   * Mảng rỗng nếu không trúng giải nào.
   * Basic: 1 triplet có thể trùng nhiều pool ĐB/Nhất/Nhì/Ba → trúng nhiều giải.
   * Plus: gộp giải Nhất→Sáu + giải đơn Năm/Sáu.
   * Combo: mỗi hoán vị cũng có thể trúng nhiều hạng.
   */
  tiers: LineWonTier[];
  /**
   * Tổng tiền thưởng thực tế = Σ(tiers[].winAmount) (VND).
   * 0 nếu không trúng. Đã nhân betCount tại settle layer.
   * Giữ ở root level để MongoDB aggregate $sum hoạt động trực tiếp.
   */
  winAmount: number;
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

  /** Kết quả match với draw result — gắn ngay khi tạo (settle time). */
  matchResult: LineMatchResult;

  /** Thời điểm tạo document (= thời điểm settle). Immutable sau insert. */
  createdAt: Date;
}

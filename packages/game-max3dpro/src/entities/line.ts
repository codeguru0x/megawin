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

/**
 * 1 giải trúng trong kết quả gộp giải của 1 line.
 * Theo luật Vietlott Max 3D Pro: 1 cặp số có thể trúng nhiều giải đồng thời.
 */
export interface LineWonTier {
  /** Hạng giải trúng (special → sixth). */
  tier: PrizeTier;
  /**
   * Tiền thưởng hạng giải này (VND).
   * Đã nhân betCount tại settle layer.
   */
  winAmount: number;
}

export interface LineMatchResult {
  /**
   * Danh sách các giải trúng (gộp giải theo luật Vietlott Max 3D Pro).
   * Mảng rỗng nếu không trúng giải nào.
   * 1 cặp số có thể trúng nhiều giải đồng thời (ví dụ: Tư + Năm + Sáu).
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

  /** Chế độ chơi: "multiNumber" (bao nhiều bộ) hoặc "multiDigit" (bao hoán vị chữ số). */
  playMode: PlayMode;

  /** Kiểu chơi: "straight". */
  playType: PlayType;

  /** Cặp hai bộ ba số (first, second) — đơn vị tính thưởng của Max 3D Pro. */
  triplets: Triplet[];

  /**
   * Số lần cược nhân bội của board chứa line này (≥ 1).
   * Audit trail: giải thích tại sao matchResult.winAmount > giá trị 1 unit.
   * winAmount = Σ(prizeConfig[tier] × betCount) qua tất cả tiers trúng.
   */
  betCount: number;

  // ───── Match Result ─────

  /** Kết quả match với draw result — gắn ngay khi tạo (settle time). */
  matchResult: LineMatchResult;

  /** Thời điểm tạo document (= thời điểm settle). Immutable sau insert. */
  createdAt: Date;
}

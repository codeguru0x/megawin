/**
 * Power 6/55 – Ticket Line Entity (Dòng kết quả match)
 *
 * 1 Line = 1 bộ 6 số chính, expand từ boards lúc settle.
 * Mỗi line được match với kết quả quay để xác định hạng giải.
 *
 * Tạo bởi settle-entries worker:
 *   boards → expandAllBoards() → lines → matchLine() → TicketLineDoc
 *
 * Idempotent: upsert bằng unique key (entryId + lineIndex).
 * Dùng cho: player xem chi tiết kết quả từng dòng, audit, verify.
 *
 * Collection: power655TicketLines.
 */

import type { PrizeTier } from "./enums";
import type { MainTuple, ISODateString } from "./types";

/**
 * MongoDB document cho 1 line (1 bộ 6 số).
 */
export interface TicketLineDoc {
  /** MongoDB ObjectId – khóa chính nội bộ. Không dùng trong business logic. */
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

  /** Mã kỳ quay. */
  drawId: string;

  // ───── Timing ─────

  /** Ngày quay "YYYY-MM-DD". */
  drawDate: ISODateString;

  /**
   * Ngày tài chính "YYYY-MM-DD" — ngày dùng cho báo cáo doanh thu.
   * Tính từ 11h sáng → 11h sáng hôm sau (Asia/Ho_Chi_Minh).
   * Có thể khác drawDate nếu kỳ quay qua đêm.
   */
  financialDate: ISODateString;

  // ───── Line Data ─────

  /** Bảng gốc: "A", "B", "C", "D", "E". Cho biết line thuộc bảng nào. */
  boardNo: string;

  /**
   * Thứ tự line trong toàn bộ entry (0-based, global across all boards).
   * Cặp (entryId, lineIndex) là unique — dùng làm dedup key khi upsert.
   */
  lineIndex: number;

  /** 6 số chính đã sort ascending. Đây là bộ số player chọn (hoặc expand từ Bao). */
  main: MainTuple;

  // ───── Match Result ─────

  /** Số lượng số chính trùng với kết quả (0-6). */
  mainMatchCount: number;

  /** Bonus number có nằm trong 6 số này không. Chỉ ảnh hưởng JP2 (5/6 + bonus). */
  bonusMatched: boolean;

  /** Hạng giải trúng. null = không trúng giải nào. */
  tier: PrizeTier | null;

  /** Tiền thưởng cho line này (VND). Giải cố định: tier1/tier2/tier3. JP1/JP2 = 0 ở đây, FinalizeSettle điền sau. */
  prizeAmount: number;

  /** Thời điểm tạo document (= thời điểm settle line). Immutable sau insert. */
  createdAt: Date;
}

/** Application layer entity. */
export interface TicketLineEntity extends Omit<TicketLineDoc, "_id"> {
  /** ObjectId dạng hex string – khóa chính dùng trong application layer. */
  id: string;
}

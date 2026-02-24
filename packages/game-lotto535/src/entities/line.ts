/**
 * Lotto 5/35 – Ticket Line Document
 *
 * Collection: lotto535TicketLines
 *
 * 1 document = 1 line con (bộ số con) thuộc về 1 ticket.
 * Line là kết quả expand từ board selection:
 *   - standard:     1 line
 *   - mainCover4:   31 lines
 *   - mainCover N:  C(N,5) lines (ví dụ bao 15 → 3003 lines)
 *   - specialCover: K lines
 *
 * KHI NÀO TẠO LINES:
 * - expansion.mode = "onWrite": tạo ngay khi ticket paid (cho bao lớn).
 * - expansion.mode = "onSettle": tạo lazy lần đầu settle.
 * - expansion.mode = "none": KHÔNG tạo, expand on-the-fly (cho standard/bao nhỏ).
 *
 * Lines không tạo theo từng draw (vì lines giống nhau cho mọi kỳ).
 *
 * Pattern naming: {Game}TicketLineDoc – áp dụng cho mọi game.
 */

import type {
  MainTuple,
  Special,
} from "./types";

// ─────────────────────────────────────────────
// Line Document
// ─────────────────────────────────────────────

export interface TicketLineDoc {
  _id: unknown;

  /** Tenant sở hữu – dùng cho access control. */
  tenantId: string;

  /** Tham chiếu ticket gốc (ObjectId). */
  ticketId: unknown;

  /** Board mà line này thuộc về ("A", "B", ...). */
  boardNo: string;

  /**
   * Index line trong ticket (0-based, global).
   * Dùng để paginate ổn định khi hiển thị danh sách lines.
   */
  lineIndex: number;

  /** 5 số chính của line, sorted tăng dần (canonical). */
  main: MainTuple;

  /** 1 số đặc biệt của line. */
  special: Special;

  /**
   * Kết quả match per draw (optional).
   * Chỉ populate khi cần hiển thị chi tiết từng line cho user,
   * hoặc khi cần audit/dispute.
   * Thông thường KHÔNG cần – settle tính aggregate ở entry level.
   */
  results?: LineResult[];

  createdAt: Date;
}

/** Kết quả match 1 line với 1 draw – dùng cho audit chi tiết. */
export interface LineResult {
  drawId: string;

  /** Hạng giải trúng (null nếu không trúng). */
  tier?: string;

  /** Tiền thưởng line này trong draw (0 nếu không trúng). */
  winAmount?: number;
}

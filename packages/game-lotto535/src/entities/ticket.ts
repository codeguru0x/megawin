/**
 * Lotto 5/35 – Ticket Document
 *
 * Collection: lotto535Tickets
 *
 * 1 document = 1 vé mua (purchase intent).
 * Chứa boards (lựa chọn của người chơi) + danh sách kỳ đã mua.
 *
 * Vòng đời:
 *   draft → paid (immutable) → completed
 *                            → refunded / void (trường hợp ngoại lệ)
 *
 * LƯU Ý:
 * - Sau khi paid, ticket IMMUTABLE – không cho sửa boards/plan/pricing.
 * - Hệ thống KHÔNG cho phép huỷ vé (không có "cancelled").
 * - Entries được tạo ngay khi paid cho TẤT CẢ drawIds đã chọn.
 * - Không còn cơ chế auto-enroll: tất cả entries vào ngay khi đặt cược.
 *
 * Pattern naming: {Game}TicketDoc, {Game}Board – áp dụng cho mọi game.
 */

import type { PlayType } from "./enums";
import type { TicketChannel, TicketStatus } from "@megawin/game-core/entities";
import type { ISODateString, BoardSelection } from "./types";

// ─────────────────────────────────────────────
// Board (lựa chọn trên 1 board A-E)
// ─────────────────────────────────────────────

/**
 * 1 board trên ticket.
 *
 * Mỗi vé có tối đa 5 boards (A-E), mỗi board là 1 lựa chọn độc lập.
 * Board chứa selection (user input) + derived (thông tin tính toán).
 */
export interface Board {
  /**
   * Mã board: "A", "B", "C", "D", "E".
   * Dùng để tham chiếu khi hiển thị kết quả.
   */
  boardNo: string;

  /** Đánh dấu board bị void (admin void), vẫn giữ lịch sử. */
  isVoid?: boolean;

  /** Kiểu chơi của board. */
  playType: PlayType;

  /** Lựa chọn số của người chơi. */
  selection: BoardSelection;

  /** Thông tin suy ra từ selection – dùng để tính tiền và hiển thị. */
  derived: {
    /**
     * Số lượng line con sinh ra từ board.
     * Ví dụ: mainCover 6 số → C(6,5) = 6 lines.
     * Dùng để tính pricing.linesPerDraw.
     */
    expandedLines: number;

    /**
     * Kích thước bao số chính (chỉ khi mainCover / mainCover4).
     * mainCover4: 4, mainCover: 6-15.
     */
    mainCoverSize?: number;

    /**
     * Kích thước bao số đặc biệt (chỉ khi specialCover).
     * Giá trị 2-12.
     */
    specialCoverSize?: number;
  };
}

// ─────────────────────────────────────────────
// Ticket Document
// ─────────────────────────────────────────────

export interface TicketDoc {
  /** MongoDB ObjectId. */
  _id: unknown;

  // ───── Ownership / Multi-tenant ─────

  /**
   * ID tenant/đại lý sở hữu.
   * Dùng làm partition key cho query + báo cáo.
   */
  tenantId: string;

  /** ID tài khoản chung (hệ thống account service). */
  accountId: string;

  /** Username hiển thị. */
  username: string;

  // ───── Ticket Identity ─────

  /**
   * Mã vé hiển thị cho khách.
   * Unique trên toàn hệ thống, format do business quyết định.
   */
  ticketNo: string;

  /** Kênh mua vé. */
  channel: TicketChannel;

  // ───── Draw Plan ─────

  drawPlan: {
    /** Danh sách drawIds mà player đặt cược (tất cả enroll ngay khi paid). */
    drawIds: string[];

    /** Số kỳ tham gia (= drawIds.length). */
    drawCount: number;
  };

  // ───── Pricing ─────

  pricing: {
    /** Giá 1 line cho 1 kỳ (VND). Snapshot tại thời điểm mua. */
    unitPrice: number;

    /**
     * Tổng line của ticket cho 1 kỳ.
     * = sum(boards[].derived.expandedLines).
     */
    linesPerDraw: number;

    /** Tiền cược mỗi kỳ = unitPrice × linesPerDraw. */
    amountPerDraw: number;

    /** Tổng tiền vé = amountPerDraw × drawCount. */
    totalAmount: number;
  };

  // ───── Boards ─────

  /** Danh sách boards (A-E), tối đa 5. */
  boards: Board[];

  // ───── Line Count ─────

  /**
   * Tổng line count cho 1 kỳ (= sum boards[].derived.expandedLines).
   * Lines được materialize vào lotto535_ticket_lines khi settle.
   */
  lineCount: number;

  // ───── Progress ─────

  /** Tiến trình xử lý kỳ – dùng cho UI hiển thị "2/5 kỳ". */
  progress: {
    /** Tổng số kỳ = drawPlan.drawCount. */
    totalDraws: number;

    /** Số kỳ đã settled. */
    settledDraws: number;
  };

  // ───── Settlement Summary ─────

  /** Tóm tắt trả thưởng tổng (across all entries/draws). */
  settlement?: {
    /** Tổng tiền thắng từ tất cả entries. */
    totalWinAmount: number;

    /** Thời điểm settle gần nhất. */
    lastSettledAt?: Date;
  };

  // ───── Void / Refund Summary ─────

  /**
   * Tóm tắt huỷ cược trên ticket (across all voided entries/draws).
   *
   * Multi-draw ticket: 1 hoặc nhiều kỳ bị void → partial refund.
   * Single-draw ticket: kỳ duy nhất void → full refund, ticket status = refunded.
   */
  voidSummary?: {
    /** Tổng tiền cược đã bị huỷ. */
    totalVoidedAmount: number;

    /** Tổng tiền đã hoàn trả. */
    totalRefundedAmount: number;

    /** Số kỳ bị void. */
    voidedDrawCount: number;

    /** Danh sách drawIds bị void. */
    voidedDrawIds: string[];

    /** Thời điểm void gần nhất. */
    lastVoidedAt?: Date;
  };

  // ───── Status & Timestamps ─────

  status: TicketStatus;

  /**
   * Monotonic counter – incremented by SyncTicketSummaries.
   * Dùng cho audit trail, ETag/cache invalidation, change detection.
   */
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

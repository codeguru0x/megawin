/**
 * Lotto 5/35 – Ticket Document
 *
 * Collection: lotto535Tickets
 *
 * 1 document = 1 vé mua (purchase intent).
 * Chứa boards (lựa chọn của người chơi) + kế hoạch tham gia nhiều kỳ (KY).
 *
 * Vòng đời:
 *   draft → paid (immutable) → completed
 *                            → refunded / void (trường hợp ngoại lệ)
 *
 * LƯU Ý:
 * - Sau khi paid, ticket IMMUTABLE – không cho sửa boards/plan/pricing.
 * - Hệ thống KHÔNG cho phép huỷ vé (không có "cancelled").
 * - Entries được tạo ngay khi paid (pre-create cho mỗi drawId).
 *
 * Pattern naming: {Game}TicketDoc, {Game}Board – áp dụng cho mọi game.
 */

import type {
  ExpansionMode,
  PlayType,
} from "./enums";
import type { TicketChannel, TicketStatus, GameProduct } from "@megawin/game-core/entities";
import type {
  ISODateString,
  BoardSelection,
} from "./types";

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

  /** ID người chơi. */
  playerId: string;

  /** AppId nếu 1 tenant có nhiều ứng dụng con (optional). */
  appId?: string;

  /** AccountId hệ thống tài khoản chung (optional). */
  accountId?: string;

  // ───── Ticket Identity ─────

  /** Mã sản phẩm game. Luôn = "lotto535". */
  product: typeof GameProduct.Lotto535;

  /**
   * Mã vé hiển thị cho khách.
   * Unique trên toàn hệ thống, format do business quyết định.
   */
  ticketNo: string;

  /** Kênh mua vé. */
  channel: TicketChannel;

  // ───── Draw Plan: tham gia nhiều kỳ (KY 1-6) ─────

  drawPlan: {
    /**
     * DrawId kỳ đầu tiên mà player đặt cược.
     * Entry cho kỳ này được tạo ngay khi place-bet.
     */
    startDrawId: string;

    /** Số kỳ tham gia liên tiếp (1-6). */
    drawCount: number;

    /**
     * Danh sách drawId đã thực sự được enroll (có entry).
     * Grow over time: ban đầu chỉ có [startDrawId],
     * worker auto-enroll thêm khi mỗi kỳ mới mở bán.
     */
    enrolledDrawIds: string[];

    /** Số kỳ đã enroll (= enrolledDrawIds.length). */
    enrolledDraws: number;

    /** Số kỳ còn lại chưa enroll. */
    remainingDraws: number;

    /**
     * true khi tất cả kỳ đã được enroll (enrolledDraws === drawCount).
     * Index flag để worker biết ticket nào cần enroll tiếp.
     */
    fullyEnrolled: boolean;
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

  // ───── Expansion Strategy ─────

  expansion: {
    /**
     * Chiến lược lưu lines:
     * - "none": không lưu, expand on-the-fly khi settle (line count nhỏ)
     * - "onWrite": lưu lines ngay khi paid (bao lớn, vd 3003 lines)
     * - "onSettle": lazy – lưu lần đầu khi settle
     */
    mode: ExpansionMode;

    /** Lines đã được materialize vào collection lotto535TicketLines chưa. */
    linesStored: boolean;

    /** Tổng line count (= pricing.linesPerDraw). */
    lineCount: number;

    /**
     * Hash canonical của toàn bộ selection.
     * Entry snapshot hash phải khớp ticket hash (audit integrity).
     */
    selectionHash: string;
  };

  // ───── Immutability / Audit ─────

  audit: {
    /**
     * Version ticket data. Freeze = 1 khi paid.
     * Nếu có migration nội bộ, tăng version + ghi notes.
     */
    version: number;

    /**
     * Thời điểm ticket bị khoá (paid).
     * Backend reject mọi update boards/pricing/drawPlan sau mốc này.
     */
    immutableAt?: Date;
  };

  // ───── Progress ─────

  /** Tiến trình xử lý kỳ – dùng cho UI hiển thị "2/5 kỳ". */
  progress: {
    /** Tổng số kỳ = drawPlan.drawCount. */
    totalDraws: number;

    /** Số kỳ đã settled. */
    settledDraws: number;

    /** Số kỳ đã enroll nhưng chưa settle. */
    pendingDraws: number;

    /** DrawId kế tiếp chưa settle – UI hiển thị countdown. */
    nextDrawId?: string;
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

  createdAt: Date;
  updatedAt: Date;
}

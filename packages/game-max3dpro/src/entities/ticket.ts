/**
 * Max 3D Pro – Ticket Document
 *
 * Collection: max3d_pro_tickets
 *
 * 1 document = 1 vé mua (1 lần đặt cược).
 * Mỗi vé có tối đa 4 boards (A, B, C, D).
 * Mỗi board tạo ra nhiều cặp (pairs) hai bộ ba số.
 */

import type { TicketStatus, TicketChannel } from "@megawin/game-core/entities";
import type { PlayMode, PlayType } from "./enums";
import type { BoardSelection, ISODateString } from "./types";

// ─────────────────────────────────────────────
// Board
// ─────────────────────────────────────────────

export interface Board {
  /** Ký hiệu board: A, B, C, D. */
  boardNo: string;
  /** Board bị huỷ (khi void 1 phần). */
  isVoid?: boolean;
  /** Cách chơi: multiNumber / multiDigit. */
  playMode: PlayMode;
  /** Kiểu chơi: straight / quickPick. */
  playType: PlayType;
  /** Lựa chọn số của người chơi. */
  selection: BoardSelection;
  /** Dữ liệu dẫn xuất từ selection. */
  derived: {
    /**
     * Số cặp (pairs) hai bộ ba số = số lần tham gia dự thưởng.
     * - multiNumber: C(n,2) cặp, n = số bộ ba số chọn (3-20)
     * - multiDigit: tuỳ vào loại chữ số đầu × sau
     */
    lineCount: number;
  };
}

// ─────────────────────────────────────────────
// Ticket Document
// ─────────────────────────────────────────────

export interface TicketDoc {
  _id: unknown;

  /** ID đại lý (tenant). */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Tên đăng nhập người chơi. */
  username: string;
  /** Số vé hiển thị (unique per tenant). */
  ticketNo: string;
  /** Kênh mua vé: web / app / pos. */
  channel: TicketChannel;

  /** Kế hoạch tham gia các kỳ quay. */
  drawPlan: {
    /** Danh sách drawId các kỳ quay tham gia. */
    drawIds: string[];
    /** Số kỳ quay tham gia = drawIds.length. */
    drawCount: number;
  };

  /** Thông tin giá vé. */
  pricing: {
    /** Mệnh giá 1 pair (VND). Snapshot từ global config. */
    unitPrice: number;
    /** Tổng cặp (pairs) mỗi kỳ = Σ(boards[].derived.lineCount). */
    linesPerDraw: number;
    /** Tiền cược mỗi kỳ = linesPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền vé = amountPerDraw × drawCount. */
    totalAmount: number;
  };

  /** Danh sách boards (tối đa 4: A, B, C, D). */
  boards: Board[];

  /** Tiến độ đối soát kỳ quay. */
  progress: {
    /** Tổng kỳ quay cần đối soát = drawPlan.drawCount. */
    totalDraws: number;
    /** Số kỳ quay đã đối soát xong. */
    settledDraws: number;
  };

  /** Tổng kết thắng thua sau đối soát. */
  settlement?: {
    /** Tổng tiền thắng tích luỹ = Σ(entry.payout.winAmount) qua tất cả kỳ. */
    totalWinAmount: number;
    /** Thời điểm settle kỳ gần nhất. */
    lastSettledAt?: Date;
  };

  /** Tổng kết khi vé bị void (toàn bộ hoặc một phần). */
  voidSummary?: {
    /** True nếu toàn bộ vé bị void (không partial). */
    isFullVoid: boolean;
    /** Danh sách boardNo bị void. */
    voidedBoards: string[];
    /** Tiền cược gốc trước void. */
    originalAmount: number;
    /** Tiền hoàn trả. */
    refundAmount: number;
    /** Thời điểm void. */
    voidedAt: Date;
  };

  /** Trạng thái vé: pending → active → completed / voided. */
  status: TicketStatus;
  /** Phiên bản optimistic locking. */
  version: number;

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối. */
  updatedAt: Date;
}

/**
 * Max 3D – Ticket Document
 *
 * Collection: max3d_tickets
 *
 * 1 document = 1 vé mua (1 lần đặt cược).
 * Mỗi vé có tối đa 4 boards (A, B, C, D), mỗi board chọn 1-2 bộ ba số.
 */

import type { TicketStatus, TicketChannel } from "@megawin/game-core/entities";
import type { PlayMode, PlayType } from "./enums";
import type { BoardSelection, ISODateString } from "./types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Dữ liệu dẫn xuất từ selection của board. */
export interface BoardDerived {
  /**
   * Số lần tham gia dự thưởng (line count) cho board này.
   * - straight/quickPick basic: 1
   * - straight/quickPick plus: 1
   * - combo3: 3 (hoặc 1 nếu 3 chữ số giống nhau)
   * - combo6: 6 (hoặc 3 nếu 2 chữ số giống)
   */
  lineCount: number;
}

/** Kế hoạch kỳ quay mà vé tham gia. */
export interface TicketDrawPlan {
  /** Danh sách drawId đã đăng ký. */
  drawIds: string[];
  /** Số kỳ = drawIds.length. */
  drawCount: number;
}

/** Thông tin giá vé. */
export interface TicketPricing {
  /** Mệnh giá 1 line (VND). */
  unitPrice: number;
  /** Tổng lines mỗi kỳ = Σ(boards[].derived.lineCount). */
  linesPerDraw: number;
  /** Tiền cược mỗi kỳ = linesPerDraw × unitPrice. */
  amountPerDraw: number;
  /** Tổng tiền vé = amountPerDraw × drawCount. */
  totalAmount: number;
}

/** Tiến trình xử lý kỳ quay. */
export interface TicketProgress {
  /** Tổng kỳ đã đăng ký = drawPlan.drawCount. */
  totalDraws: number;
  /** Số kỳ đã xử lý xong (settled + voided). */
  settledDraws: number;
}

/** Tổng hợp thanh toán. Cập nhật mỗi khi settle 1 kỳ. */
export interface TicketSettlement {
  /** Tổng tiền thắng tích lũy qua các kỳ = Σ(entry.payout.winAmount). */
  totalWinAmount: number;
  /** Thời điểm settle gần nhất. */
  lastSettledAt?: Date;
}

/**
 * Tổng hợp void của Max3D – void theo BOARD (không phải theo draw).
 *
 * Max3D cho phép void 1 phần board trong vé (board-level void),
 * khác với các game khác (draw-level void).
 * Khi void board, hệ thống hoàn tiền tương ứng với các boards bị void.
 */
export interface TicketVoidSummary {
  /** true nếu void toàn bộ vé, false nếu chỉ void 1 số boards. */
  isFullVoid: boolean;
  /** Danh sách boardNo đã bị void (vd: ["A", "C"]). */
  voidedBoards: string[];
  /** Tổng tiền gốc của phần bị void. */
  originalAmount: number;
  /** Tổng tiền hoàn trả cho người chơi. */
  refundAmount: number;
  /** Thời điểm void. */
  voidedAt: Date;
}

// ─────────────────────────────────────────────
// Board
// ─────────────────────────────────────────────

export interface Board {
  /** Ký hiệu board: A, B, C, D. */
  boardNo: string;
  /** Board bị huỷ (khi void 1 phần). */
  isVoid?: boolean;
  /** Cách chơi: basic / plus. */
  playMode: PlayMode;
  /** Kiểu chơi: straight / combo3 / combo6 / quickPick. */
  playType: PlayType;
  /** Lựa chọn số của người chơi. */
  selection: BoardSelection;
  /** Dữ liệu dẫn xuất từ selection. */
  derived: BoardDerived;
}

// ─────────────────────────────────────────────
// Ticket Document
// ─────────────────────────────────────────────

export interface TicketDoc {
  _id: unknown;

  /** ID đại lý sở hữu vé. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Tên đăng nhập người chơi. */
  username: string;
  /** Mã vé hiển thị, unique. */
  ticketNo: string;
  /** Kênh mua vé: web / app / agent. */
  channel: TicketChannel;

  /** Kế hoạch kỳ quay mà vé tham gia. */
  drawPlan: TicketDrawPlan;

  /** Thông tin giá vé. */
  pricing: TicketPricing;

  /** Danh sách boards (tối đa 4: A, B, C, D). */
  boards: Board[];

  /** Tiến trình xử lý kỳ quay. */
  progress: TicketProgress;

  /** Tổng hợp thanh toán. Cập nhật mỗi khi settle 1 kỳ. */
  settlement?: TicketSettlement;

  /** Tổng hợp void. Set khi void vé (toàn phần hoặc 1 phần board). */
  voidSummary?: TicketVoidSummary;

  /** Trạng thái vé: pending → active → completed / voided. */
  status: TicketStatus;
  /** Optimistic locking version. */
  version: number;

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất. */
  updatedAt: Date;
}

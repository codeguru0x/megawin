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
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Dữ liệu dẫn xuất từ selection của board. */
export interface BoardDerived {
  /**
   * Số cặp (pairs) hai bộ ba số = số lần tham gia dự thưởng.
   * - multiNumber: C(n,2) cặp, n = số bộ ba số chọn (3-20)
   * - multiDigit: tuỳ vào loại chữ số đầu × sau
   */
  lineCount: number;
}

/** Kế hoạch tham gia các kỳ quay. */
export interface TicketDrawPlan {
  /** Danh sách drawId các kỳ quay tham gia. */
  drawIds: string[];
  /** Số kỳ quay tham gia = drawIds.length. */
  drawCount: number;
}

/** Thông tin giá vé. */
export interface TicketPricing {
  /** Mệnh giá 1 pair (VND). Snapshot từ global config. */
  unitPrice: number;
  /** Tổng cặp (pairs) mỗi kỳ = Σ(boards[].derived.lineCount). */
  linesPerDraw: number;
  /** Tiền cược mỗi kỳ = linesPerDraw × unitPrice. */
  amountPerDraw: number;
  /** Tổng tiền vé = amountPerDraw × drawCount. */
  totalAmount: number;
}

/** Tiến độ đối soát kỳ quay. */
export interface TicketProgress {
  /** Tổng kỳ quay cần đối soát = drawPlan.drawCount. */
  totalDraws: number;
  /** Số kỳ quay đã đối soát xong = settledCount + voidedCount. Khi settledDraws === totalDraws: ticket → completed / refunded. */
  settledDraws: number;
}

/** Tổng kết thắng thua sau đối soát. */
export interface TicketSettlement {
  /** Tổng tiền thắng tích luỹ = Σ(entry.payout.winAmount) qua tất cả kỳ. */
  totalWinAmount: number;
  /** Thời điểm settle kỳ gần nhất. */
  lastSettledAt?: Date;
}

/**
 * Tổng kết khi vé bị void của Max3D Pro – void theo BOARD (không phải theo draw).
 *
 * Max3D Pro cho phép void 1 phần board trong vé (board-level void),
 * khác với các game khác (draw-level void).
 */
export interface TicketVoidSummary {
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
}

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
  derived: BoardDerived;
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
  /**
   * IP address của player lúc đặt cược (IPv4 hoặc IPv6).
   * Lấy từ CF-Connecting-IP (qua Cloudflare) → X-Forwarded-For → sourceIp.
   * Optional: có thể thiếu nếu request không có header phù hợp.
   */
  ipAddress?: string;

  /** Kế hoạch tham gia các kỳ quay. */
  drawPlan: TicketDrawPlan;

  /** Thông tin giá vé. */
  pricing: TicketPricing;

  /** Danh sách boards (tối đa 4: A, B, C, D). */
  boards: Board[];

  /** Tiến độ đối soát kỳ quay. */
  progress: TicketProgress;

  /** Tổng kết thắng thua sau đối soát. */
  settlement?: TicketSettlement;

  /** Tổng kết khi vé bị void (toàn bộ hoặc một phần board). */
  voidSummary?: TicketVoidSummary;

  /**
   * Ngày tài chính của **thời điểm mua vé** "YYYY-MM-DD".
   *
   * Dùng để gom doanh thu bán vé theo ngày tài chính cho báo cáo.
   * Business rule: ngày tài chính tính từ 11h sáng → 11h sáng hôm sau.
   *
   * QUAN TRỌNG – Ticket vs Entry:
   * - Ticket.financialDate = ngày tài chính lúc **cược** (thời điểm place-bet).
   *   Vé multi-draw trải dài nhiều ngày nhưng chỉ ghi nhận doanh thu 1 lần vào ngày mua.
   * - Entry.financialDate = ngày tài chính của **kỳ draw** cụ thể (riêng từng entry).
   *   Dùng cho báo cáo thưởng/quyết toán theo kỳ.
   */
  financialDate: ISODateString;

  /** Trạng thái vé: pending → active → completed / voided. */
  status: TicketStatus;
  /** Phiên bản optimistic locking. */
  version: number;

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối. */
  updatedAt: Date;
}

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
   * Công thức: tính bởi calculateLineCount() trong play-types.ts.
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
 * Tổng hợp void của vé Max3D – void theo draw (entry), giống tất cả các game khác.
 *
 * Khi 1 kỳ (draw) bị void → TẤT CẢ entries của vé thuộc kỳ đó bị void.
 * Vé multi-draw: chỉ entry của kỳ bị void bị ảnh hưởng, các kỳ khác vẫn tiếp tục.
 * Single-draw: void toàn bộ vé → ticket.status = refunded.
 */
export interface TicketVoidSummary {
  /** Tổng tiền cược gốc của các kỳ bị void (VND) = Σ(entry.amount) kỳ đã void. */
  totalVoidedAmount: number;
  /** Tổng tiền đã hoàn trả cho player (VND). */
  totalRefundedAmount: number;
  /** Số kỳ quay đã bị void. */
  voidedDrawCount: number;
  /** Danh sách drawId của các kỳ đã bị void. */
  voidedDrawIds: string[];
  /** Thời điểm kỳ gần nhất bị void. */
  lastVoidedAt?: Date;
}

// ─────────────────────────────────────────────
// Board
// ─────────────────────────────────────────────

export interface Board {
  /** Ký hiệu board: A, B, C, D. */
  boardNo: string;
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
  /**
   * IP address của player lúc đặt cược (IPv4 hoặc IPv6).
   * Lấy từ CF-Connecting-IP (qua Cloudflare) → X-Forwarded-For → sourceIp.
   * Optional: có thể thiếu nếu request không có header phù hợp.
   */
  ipAddress?: string;

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

  /** Tổng hợp void. Set khi ít nhất 1 kỳ của vé bị void. */
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

  /** Trạng thái vé: paid → completed / refunded / void. */
  status: TicketStatus;
  /** Optimistic locking version. */
  version: number;

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất. */
  updatedAt: Date;
}

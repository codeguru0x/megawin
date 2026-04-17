/**
 * Mega 6/45 – Ticket Document
 *
 * Collection: mega645Tickets
 *
 * 1 document = 1 vé mua.
 * Mỗi vé có tối đa 6 boards (A-F).
 */

import type { PlayType } from "./enums";
import type { TicketChannel, TicketStatus } from "@megawin/game-core/entities";
import type { BoardSelection, ISODateString } from "./types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Thông tin dẫn xuất tính toán từ selection của board. */
export interface BoardDerived {
  /**
   * Số line sau khi expand từ board.
   * - standard: 1
   * - bao5: 40 (chọn 5 số, hệ thống bổ sung từ 40 số còn lại)
   * - bao7-18: C(N, 6) – tổ hợp chập 6 từ N số đã chọn
   */
  expandedLines: number;

  /** Kích thước bao (chỉ khi bao5, bao7-18). */
  baoSize?: number;
}

/** Kế hoạch tham gia các kỳ quay. */
export interface TicketDrawPlan {
  /** Danh sách ID các kỳ quay vé tham gia. */
  drawIds: string[];
  /** Số kỳ quay vé tham gia (= drawIds.length). */
  drawCount: number;
}

/** Thông tin giá vé, snapshot tại thời điểm mua. */
export interface TicketPricing {
  /** Đơn giá 1 line (VND). Snapshot từ config tại thời điểm mua. */
  unitPrice: number;
  /**
   * Tổng số line trên 1 kỳ quay.
   * Công thức: Σ(boards[].derived.expandedLines).
   */
  linesPerDraw: number;
  /**
   * Tổng đơn vị cược mỗi kỳ = Σ(expandedLines × betCount). Dùng tính tiền.
   * Khi betCount = 1 cho mọi board thì betUnitsPerDraw = linesPerDraw.
   */
  betUnitsPerDraw: number;
  /**
   * Tổng tiền cho 1 kỳ quay (VND).
   * Công thức: betUnitsPerDraw × unitPrice.
   */
  amountPerDraw: number;
  /**
   * Tổng tiền toàn bộ vé (VND).
   * Công thức: amountPerDraw × drawCount.
   */
  totalAmount: number;
}

/** Tiến trình xử lý qua các kỳ quay. */
export interface TicketProgress {
  /** Tổng số kỳ quay vé tham gia (= drawPlan.drawCount). */
  totalDraws: number;
  /** Số kỳ đã xử lý xong = settledCount + voidedCount. Khi settledDraws === totalDraws: ticket → completed / refunded. */
  settledDraws: number;
}

/** Tổng kết trả thưởng qua tất cả các kỳ quay. */
export interface TicketSettlement {
  /** Tổng tiền trúng thưởng qua tất cả kỳ quay (VND). */
  totalWinAmount: number;
  /** Thời điểm settle gần nhất. */
  lastSettledAt?: Date;
}

/** Tổng kết void (nếu có kỳ quay bị huỷ). */
export interface TicketVoidSummary {
  /** Tổng số tiền gốc của các entry bị void (VND). */
  totalVoidedAmount: number;
  /** Tổng số tiền đã hoàn trả (VND). */
  totalRefundedAmount: number;
  /** Số kỳ quay bị void. */
  voidedDrawCount: number;
  /** Danh sách drawId của các kỳ quay bị void. */
  voidedDrawIds: string[];
  /** Thời điểm void gần nhất. */
  lastVoidedAt?: Date;
}

// ─────────────────────────────────────────────
// Board
// ─────────────────────────────────────────────

/** Board trên vé – 1 board = 1 lựa chọn số của người chơi. */
export interface Board {
  /** Ký hiệu board ("A".."F"). */
  boardNo: string;
  /** Kiểu chơi (standard / bao5 / bao7-18). */
  playType: PlayType;
  /** Lựa chọn số gốc của người chơi. */
  selection: BoardSelection;
  /** Thông tin tính toán từ selection. */
  derived: BoardDerived;
  /** Số lần cược nhân bội cho board (≥ minBetCount). Player chọn khi đặt cược. */
  betCount: number;
}

// ─────────────────────────────────────────────
// Ticket Document
// ─────────────────────────────────────────────

export interface TicketDoc {
  /** MongoDB document ID. */
  _id: unknown;

  /** ID đại lý (tenant) bán vé. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Tên đăng nhập người chơi. */
  username: string;

  /** Số vé (mã hiển thị duy nhất cho người chơi). */
  ticketNo: string;
  /** Kênh mua vé (web / mobile / pos). */
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

  /** Danh sách các board trên vé (tối đa 6 boards A-F). */
  boards: Board[];
  /**
   * Tổng số line trên 1 kỳ quay (giống pricing.linesPerDraw).
   * Tiện truy vấn nhanh ở top-level.
   */
  lineCount: number;

  /** Tiến trình xử lý qua các kỳ quay. */
  progress: TicketProgress;

  /** Tổng kết trả thưởng qua tất cả các kỳ quay. */
  settlement?: TicketSettlement;

  /** Tổng kết void (nếu có kỳ quay bị huỷ). */
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

  /** Trạng thái vé (pending → active → completed / cancelled). */
  status: TicketStatus;
  /** Số phiên bản document (optimistic locking). */
  version: number;
  /**
   * Transaction ID (UUIDv7) — link ticket ↔ WAL (tx_intents).
   * Dùng bởi recovery scheduler để check ticket tồn tại khi xử lý orphan WAL.
   * Tickets cũ chưa có field này sẽ là null trong DB — không ảnh hưởng vì không cần re-process.
   */
  tx: string;

  /** Thời điểm tạo vé. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. */
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface TicketEntity extends Omit<TicketDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}

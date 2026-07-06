/**
 * Power 6/55 – Ticket Entity (Vé dự thưởng)
 *
 * Mỗi vé (ticket) đại diện cho 1 lần mua của player.
 * Vé chứa tối đa 5 bảng (A-E), mỗi bảng có PlayType riêng.
 * Vé có thể tham gia 1-6 kỳ quay liên tiếp (multi-draw).
 *
 * Vé là IMMUTABLE sau khi tạo – không sửa boards/selection.
 * Chỉ update: progress (sau settle), settlement (tổng thắng), voidSummary.
 *
 * Collection: power655_tickets.
 */

import type { TicketStatus, TicketChannel } from "@megawin/game-core/entities";
import type { PlayType } from "./enums";
import type { BoardSelection, ISODateString } from "./types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Thông tin dẫn xuất tính toán từ selection của board. */
export interface BoardDerived {
  /**
   * Số bộ số (lines) expand từ board này.
   * - Standard: 1
   * - Bao5: 55 - 5 = 50
   * - Bao7: C(7,6) = 7, Bao8: C(8,6) = 28, ..., Bao18: C(18,6) = 18.564
   */
  expandedLines: number;
}

/** Kế hoạch tham gia các kỳ quay. */
export interface TicketDrawPlan {
  /** Danh sách drawIds đăng ký (VD: ["2026-03-03.001", "2026-03-05.001"]). */
  drawIds: string[];
  /** Tổng số kỳ đăng ký (= drawIds.length). */
  drawCount: number;
}

/** Thông tin giá vé, snapshot tại thời điểm mua. */
export interface TicketPricing {
  /** Đơn giá 1 line (VND). Snapshot từ config tại thời điểm mua. */
  unitPrice: number;
  /**
   * Tổng số line trên 1 kỳ quay.
   * Công thức: Σ(boards[].derived.expandedLines) cho tất cả boards không bị void.
   */
  linesPerDraw: number;
  /**
   * Tổng đơn vị cược mỗi kỳ = Σ(expandedLines × betCount).
   * Khi tất cả boards betCount=1 → betUnitsPerDraw = linesPerDraw.
   * Dùng để tính tiền cược chính xác.
   */
  betUnitsPerDraw: number;
  /**
   * Tiền cược mỗi kỳ (VND).
   * Công thức: unitPrice × betUnitsPerDraw.
   */
  amountPerDraw: number;
  /**
   * Tổng tiền toàn bộ vé (VND).
   * Công thức: amountPerDraw × drawPlan.drawCount.
   */
  totalAmount: number;
}

/** Tiến trình xử lý qua các kỳ quay. */
export interface TicketProgress {
  /** Tổng số kỳ quay vé tham gia (= drawPlan.drawCount). */
  totalDraws: number;
  /**
   * Số kỳ đã xử lý xong = settledCount + voidedCount.
   * Khi settledDraws === totalDraws: ticket → completed / refunded.
   */
  settledDraws: number;
}

/** Tổng kết trả thưởng qua tất cả các kỳ quay. */
export interface TicketSettlement {
  /** Tổng tiền trúng thưởng qua tất cả kỳ quay (VND). */
  totalWinAmount: number;
  /** Thời điểm settle gần nhất. */
  lastSettledAt?: Date;
}

/**
 * Tổng kết void (nếu có kỳ quay bị huỷ).
 *
 * Multi-draw ticket: 1 hoặc nhiều kỳ bị void → partial refund.
 * Single-draw ticket: kỳ duy nhất void → full refund, ticket status = refunded.
 */
export interface TicketVoidSummary {
  /** Tổng số tiền gốc của các entry bị void (VND). */
  totalVoidedAmount: number;
  /** Tổng số tiền đã hoàn trả (VND). */
  totalRefundedAmount: number;
  /** Số kỳ bị void. */
  voidedDrawCount: number;
  /** Danh sách drawId của các kỳ bị void. */
  voidedDrawIds: string[];
  /** Thời điểm void gần nhất. */
  lastVoidedAt?: Date;
}

// ─────────────────────────────────────────────
// Board (lựa chọn trên 1 board A-E)
// ─────────────────────────────────────────────

/**
 * 1 bảng trên vé (A-E).
 *
 * Mỗi vé có tối đa 5 boards (A-E), mỗi board là 1 lựa chọn độc lập.
 * Board chứa selection (user input) + derived (thông tin tính toán).
 */
export interface Board {
  /**
   * Ký hiệu bảng sinh tự động theo thứ tự chữ cái: "A", "B", ..., "Z", "AA", "AB", ...
   * (giống đánh cột bảng tính). Board đầu tiên luôn là "A".
   * Số board tối đa mỗi vé do cấu hình game quyết định (`maxBoardsPerTicket`).
   */
  boardNo: string;
  /** Loại chơi: standard, bao5, bao7-bao18. */
  playType: PlayType;
  /** Các số đã chọn. Số lượng phụ thuộc playType. */
  selection: BoardSelection;
  /** Thông tin tính toán từ selection. */
  derived: BoardDerived;
  /** Số lần cược nhân bội cho board (≥ minBetCount). Player chọn khi đặt cược. */
  betCount: number;
}

// ─────────────────────────────────────────────
// Ticket Document
// ─────────────────────────────────────────────

/**
 * MongoDB document cho vé Power 6/55.
 * Collection: power655_tickets.
 */
export interface TicketDoc {
  /** MongoDB ObjectId – khóa chính nội bộ. Không dùng trong business logic. */
  _id: unknown;

  // ───── Ownership ─────

  /** ID tenant/đại lý bán vé. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Tên đăng nhập người chơi (snapshot lúc place-bet). */
  username: string;

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

  // ───── Ticket Identity ─────

  /** Mã vé unique format: "P655-YYYYMMDD-N" (game prefix + date + sequence). */
  ticketNo: string;
  /** Kênh bán: "pos" (điểm bán), "web", "sdk". */
  channel: TicketChannel;
  /**
   * IP address của player lúc đặt cược (IPv4 hoặc IPv6).
   * Lấy từ CF-Connecting-IP (qua Cloudflare) → X-Forwarded-For → sourceIp.
   * Optional: có thể thiếu nếu request không có header phù hợp.
   */
  ipAddress?: string;

  // ───── Draw Plan ─────

  /** Kế hoạch multi-draw. */
  drawPlan: TicketDrawPlan;

  // ───── Pricing ─────

  /** Thông tin giá vé: unitPrice, linesPerDraw, amountPerDraw, totalAmount. */
  pricing: TicketPricing;

  // ───── Boards ─────

  /** Danh sách bảng đã chọn (1-5 bảng A-E). */
  boards: Board[];

  // ───── Line Count ─────

  /**
   * Tổng line count cho 1 kỳ (= pricing.linesPerDraw = Σ boards[].derived.expandedLines).
   * Tiện truy vấn nhanh ở top-level, tránh unwind boards.
   */
  lineCount: number;

  // ───── Progress ─────

  /** Tiến độ settle. Cập nhật bởi worker sau mỗi kỳ. */
  progress: TicketProgress;

  // ───── Settlement Summary ─────

  /** Tổng kết thắng/thua. Cập nhật bởi worker. */
  settlement?: TicketSettlement;

  // ───── Void / Refund Summary ─────

  /**
   * Tổng kết void (chỉ có khi có kỳ bị void).
   *
   * Multi-draw ticket: 1 hoặc nhiều kỳ bị void → partial refund.
   * Single-draw ticket: kỳ duy nhất void → full refund, ticket status = refunded.
   */
  voidSummary?: TicketVoidSummary;

  // ───── Status & Timestamps ─────

  /** Trạng thái vé: paid → completed, hoặc → refunded/void. */
  status: TicketStatus;
  /**
   * Monotonic counter – incremented by SyncTicketSummaries.
   * Dùng cho audit trail, ETag/cache invalidation, change detection.
   */
  version: number;
  /**
   * Transaction ID (UUIDv7) — link ticket ↔ WAL (tx_intents).
   * Dùng bởi recovery scheduler để check ticket tồn tại khi xử lý orphan WAL.
   * Tickets cũ chưa có field này sẽ là null trong DB — không ảnh hưởng vì không cần re-process.
   */
  tx: string;

  /** Thời điểm tạo document (= thời điểm mua vé). */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất (progress/settlement update). */
  updatedAt: Date;
}

/** Application layer entity. */
export interface TicketEntity extends Omit<TicketDoc, "_id"> {
  /** ObjectId dạng hex string – khóa chính dùng trong application layer. */
  id: string;
}

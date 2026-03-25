/**
 * Keno – Ticket Document
 *
 * Collection: kenoTickets
 *
 * 1 document = 1 vé Keno (purchase intent).
 * Mỗi vé chứa 1-3 boards (panels A-C), mỗi board là 1 lựa chọn cược
 * thuộc bất kỳ loại chơi nào (cơ bản pick1-pick10 hoặc bổ sung bigSmall/evenOdd).
 *
 * Keno cho phép:
 * - Cách chơi cơ bản: chọn 1-10 số từ "01"-"80"
 * - Cách chơi bổ sung: Lớn/Nhỏ hoặc Chẵn/Lẻ
 * - Mọi loại chơi đều nằm trong mảng boards[], phân biệt qua playType
 * - Mệnh giá: 10.000đ mỗi lần tham gia
 * - Chơi nhiều kỳ liên tiếp (multi-draw, lazy enrollment)
 */

import type { KenoBigSmallBet, KenoEvenOddBet, KenoPlayType } from "./enums";
import type { TicketChannel, TicketStatus } from "@megawin/game-core/entities";
import type { ISODateString } from "./types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Kế hoạch tham gia các kỳ quay. */
export interface TicketDrawPlan {
  /** Danh sách drawIds mà player đặt cược (tất cả enroll ngay khi paid). */
  drawIds: string[];
  /**
   * Số kỳ tham gia = drawIds.length.
   * Lưu riêng để tránh phải tính length mỗi lần truy vấn.
   */
  drawCount: number;
}

/** Thông tin giá vé. */
export interface TicketPricing {
  /** Mệnh giá mỗi lần tham gia dự thưởng (VND). Keno = 10.000. */
  unitPrice: number;

  /**
   * Số selections mỗi kỳ = boards.length.
   * Đếm số bets logic (không nhân betCount).
   */
  selectionsPerDraw: number;

  /**
   * Tổng đơn vị cược mỗi kỳ = Σ(board.betCount).
   * Dùng để tính tiền: amountPerDraw = betUnitsPerDraw × unitPrice.
   */
  betUnitsPerDraw: number;

  /** Tiền cược mỗi kỳ = betUnitsPerDraw × unitPrice (VND). */
  amountPerDraw: number;

  /** Tổng tiền cược toàn bộ kỳ = amountPerDraw × drawPlan.drawCount (VND). */
  totalAmount: number;
}

/** Tiến trình xử lý kỳ quay. Cập nhật bởi SyncTicketSummaries sau mỗi settle/void. */
export interface TicketProgress {
  /** Tổng số kỳ tham gia = drawPlan.drawCount. */
  totalDraws: number;

  /**
   * Số kỳ đã xử lý xong = settledCount + voidedCount.
   * Khi settledDraws === totalDraws: ticket → completed / refunded.
   * Bao gồm cả kỳ bị void (chi tiết void xem voidSummary.voidedDrawCount).
   */
  settledDraws: number;
}

/** Tổng kết settle. Được cập nhật cộng dồn sau mỗi kỳ settle. */
export interface TicketSettlement {
  /** Tổng tiền thắng cộng dồn qua tất cả các kỳ đã settle (VND). */
  totalWinAmount: number;
  /** Thời điểm kỳ gần nhất được settle. */
  lastSettledAt?: Date;
}

/**
 * Tóm tắt huỷ cược trên ticket.
 * Multi-draw: 1+ kỳ void → partial refund.
 * Single-draw: kỳ duy nhất void → full refund, status = refunded.
 */
export interface TicketVoidSummary {
  /** Tổng tiền cược gốc của các kỳ bị huỷ (VND). */
  totalVoidedAmount: number;
  /** Tổng tiền đã hoàn lại cho player qua tất cả các kỳ void (VND). */
  totalRefundedAmount: number;
  /** Số kỳ đã bị huỷ. */
  voidedDrawCount: number;
  /** Danh sách drawId của các kỳ đã bị huỷ. */
  voidedDrawIds: string[];
  /** Thời điểm kỳ gần nhất bị huỷ. */
  lastVoidedAt?: Date;
}

// ─────────────────────────────────────────────
// Board – Tất cả loại chơi (panels A-C)
// ─────────────────────────────────────────────

/**
 * 1 board trên vé Keno — đại diện cho 1 lựa chọn cược.
 *
 * Unified: cả cách chơi cơ bản (pick1-pick10) và bổ sung (bigSmall/evenOdd)
 * đều nằm trong cùng 1 interface, phân biệt qua playType.
 *
 * - Cơ bản (pick1-pick10): bắt buộc `numbers`, `bet` = undefined.
 * - Bổ sung (bigSmall/evenOdd): bắt buộc `bet`, `numbers` = undefined.
 *
 * Số lưu dạng string "01"-"80" (zero-padded 2 chữ số).
 */
export interface Board {
  /** Mã nhận dạng board: "A", "B", hoặc "C". */
  boardNo: string;
  /** Loại chơi: "pick1"–"pick10" (cơ bản) hoặc "bigSmall"/"evenOdd" (bổ sung). */
  playType: KenoPlayType;

  /**
   * Danh sách số đã chọn ("01"-"80"), unique, sorted tăng dần.
   * Bắt buộc cho cách chơi cơ bản (pick1-pick10).
   * Undefined cho cách chơi bổ sung (bigSmall/evenOdd).
   */
  numbers?: string[];
  /**
   * Lựa chọn cụ thể cho cách chơi bổ sung:
   * - bigSmall: "big" | "small" | "bigSmallDraw"
   * - evenOdd: "even" | "odd" | "evenOddDraw" | "even1112" | "odd1112"
   *
   * Bắt buộc cho cách chơi bổ sung (bigSmall/evenOdd).
   * Undefined cho cách chơi cơ bản (pick1-pick10).
   */
  bet?: KenoBigSmallBet | KenoEvenOddBet;

  /** Số lần cược nhân bội cho board (≥ minBetCount). Player chọn khi đặt cược. */
  betCount: number;
}

// ─────────────────────────────────────────────
// Ticket Document
// ─────────────────────────────────────────────

export interface TicketDoc {
  _id: unknown;

  // ───── Ownership / Multi-tenant ─────

  /** ID của đại lý sở hữu ticket. Dùng để phân vùng dữ liệu multi-tenant. */
  tenantId: string;

  /** ID tài khoản người chơi. */
  accountId: string;

  /** Tên đăng nhập, lưu để giảm join khi hiển thị. */
  username: string;

  // ───── Ticket Identity ─────

  /** Mã vé duy nhất, hiển thị cho người chơi. Ví dụ: "KN-20240101-000001". */
  ticketNo: string;

  /** Kênh mua vé: "web" | "app" | "pos". */
  channel: TicketChannel;

  /**
   * IP address của player lúc đặt cược (IPv4 hoặc IPv6).
   * Lấy từ CF-Connecting-IP (qua Cloudflare) → X-Forwarded-For → sourceIp.
   * Optional: có thể thiếu nếu request không có header phù hợp.
   */
  ipAddress?: string;

  // ───── Draw Plan (lazy enrollment) ─────

  /**
   * Kế hoạch tham gia kỳ. Tất cả kỳ được enroll ngay khi ticket paid.
   * Keno cho phép chơi tối đa 20 kỳ liên tiếp.
   */
  drawPlan: TicketDrawPlan;

  // ───── Pricing ─────

  pricing: TicketPricing;

  // ───── Boards (tất cả loại chơi, panels A-C) ─────

  /**
   * Danh sách board — mỗi board là 1 lựa chọn cược.
   * Tối đa 3 boards (Panel A, B, C).
   *
   * Mỗi board có thể là cách chơi cơ bản (pick1-pick10) hoặc bổ sung (bigSmall/evenOdd).
   * Phân biệt qua field `playType`.
   */
  boards: Board[];

  // ───── Progress ─────

  progress: TicketProgress;

  // ───── Settlement Summary ─────

  /** Tổng kết thắng cược. Undefined nếu chưa có kỳ nào settle. */
  settlement?: TicketSettlement;

  // ───── Void / Refund Summary ─────

  /**
   * Tóm tắt huỷ cược trên ticket.
   * Multi-draw: 1+ kỳ void → partial refund.
   * Single-draw: kỳ duy nhất void → full refund, status = refunded.
   */
  voidSummary?: TicketVoidSummary;

  // ───── Status & Timestamps ─────

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

  /**
   * Trạng thái tổng thể của ticket:
   * - "paid": đang hoạt động, còn draws chờ xử lý
   * - "completed": tất cả draws đã settle/void
   * - "refunded": single-draw và kỳ duy nhất bị void
   */
  status: TicketStatus;

  /**
   * Monotonic counter – incremented by SyncTicketSummaries.
   * Dùng cho audit trail, ETag/cache invalidation, change detection.
   */
  version: number;

  /** Thời điểm ticket được tạo (= lúc player đặt cược). */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất (sau mỗi settle/void cycle). */
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface TicketEntity extends Omit<TicketDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}

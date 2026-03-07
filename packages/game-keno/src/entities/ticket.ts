/**
 * Keno – Ticket Document
 *
 * Collection: kenoTickets
 *
 * 1 document = 1 vé Keno (purchase intent).
 * Mỗi vé có thể chứa cả lựa chọn cơ bản (panels A, B) và bổ sung (panel C).
 *
 * Keno cho phép:
 * - Panel A, B: chọn 1-10 số từ "01"-"80" (cách chơi cơ bản)
 * - Panel C: đặt cược Lớn/Nhỏ hoặc Chẵn/Lẻ (cách chơi bổ sung)
 * - Mệnh giá: 10.000đ mỗi lần tham gia
 * - Chơi nhiều kỳ liên tiếp (multi-draw, lazy enrollment)
 */

import type { KenoBigSmallBet, KenoEvenOddBet, KenoPlayType, KenoSideBetPlayType } from "./enums";
import type { TicketChannel, TicketStatus } from "@megawin/game-core/entities";

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
   * Số lần tham gia dự thưởng mỗi kỳ.
   * = boards.length + sideBets.length.
   * Ví dụ: 2 boards + 1 side bet → betsPerDraw = 3.
   */
  betsPerDraw: number;
  /** Tiền cược mỗi kỳ = unitPrice × betsPerDraw (VND). */
  amountPerDraw: number;
  /** Tổng tiền cược toàn bộ kỳ = amountPerDraw × drawPlan.drawCount (VND). */
  totalAmount: number;
}

/** Thông tin đại lý snapshot tại thời điểm mua vé. */
export interface TicketTenant {
  /** Tỷ lệ hoa hồng đại lý áp dụng cho vé này. Ví dụ: 0.20 = 20%. Snapshot lúc place-bet, không đổi khi config thay đổi sau. */
  commissionRate: number;
}

/** Tiến trình xử lý kỳ quay. Cập nhật bởi SyncTicketSummaries sau mỗi settle/void. */
export interface TicketProgress {
  /** Tổng số kỳ tham gia = drawPlan.drawCount. */
  totalDraws: number;
  /**
   * Số kỳ đã xử lý xong (settled hoặc voided).
   * Khi settledDraws === totalDraws: ticket → completed / refunded.
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
// Board – Cách chơi cơ bản (Panel A/B)
// ─────────────────────────────────────────────

/**
 * 1 board cách chơi cơ bản trên vé Keno.
 * Số lưu dạng string "01"-"80" (zero-padded 2 chữ số).
 */
export interface BasicBoard {
  /** Mã nhận dạng board: "A" hoặc "B". */
  boardNo: string;
  /** Loại chơi xác định theo số lượng chọn: "pick1" – "pick10". */
  playType: KenoPlayType;
  /** Danh sách số đã chọn ("01"-"80"), unique, sorted tăng dần. */
  numbers: string[];
}

// ─────────────────────────────────────────────
// Side Bet – Cách chơi bổ sung (Panel C)
// ─────────────────────────────────────────────

/** Cách chơi bổ sung Panel C. Mỗi side bet là một lần tham gia dự thưởng độc lập. */
export interface SideBet {
  /** Loại side bet: "bigSmall" (Lớn/Nhỏ) hoặc "evenOdd" (Chẵn/Lẻ). */
  playType: KenoSideBetPlayType;
  /** Lựa chọn cụ thể: "big"/"small"/"bigSmallDraw" hoặc "even"/"odd"/"evenOddDraw"/... */
  bet: KenoBigSmallBet | KenoEvenOddBet;
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

  // ───── Draw Plan (lazy enrollment) ─────

  /**
   * Kế hoạch tham gia kỳ. Tất cả kỳ được enroll ngay khi ticket paid.
   * Keno cho phép chơi tối đa 20 kỳ liên tiếp.
   */
  drawPlan: TicketDrawPlan;

  // ───── Pricing ─────

  pricing: TicketPricing;

  // ───── Tenant ─────

  tenant: TicketTenant;

  // ───── Boards cơ bản (Panel A/B) ─────

  /**
   * Danh sách board cách chơi cơ bản.
   * Tối đa 2 boards (Panel A và Panel B).
   * Mỗi board chọn 1-10 số từ "01"-"80".
   */
  boards: BasicBoard[];

  // ───── Side Bets (Panel C) ─────

  /**
   * Danh sách cược bổ sung Panel C.
   * Mỗi side bet là Lớn/Nhỏ hoặc Chẵn/Lẻ.
   * Có thể rỗng nếu player không đặt cược bổ sung.
   */
  sideBets: SideBet[];

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

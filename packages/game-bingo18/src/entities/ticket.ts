/**
 * Bingo 18 – Ticket Document
 *
 * Collection: bingo18_tickets
 *
 * 1 document = 1 vé Bingo 18 (purchase intent).
 * Bingo 18 cho phép:
 * - Boards cơ bản: Một số, Hai số trùng, Ba số trùng
 * - Side bets: Cộng tổng, Lớn/Hòa/Nhỏ
 * - Mệnh giá: 10.000đ mỗi lần tham gia
 * - Chơi nhiều kỳ liên tiếp (multi-draw)
 */

import type {
  Bingo18PlayType,
  Bingo18SideBetPlayType,
  Bingo18BigSmallBet,
  Bingo18TripleKind,
} from "./enums";
import type { TicketChannel, TicketStatus } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// Board – Cách chơi cơ bản
// ─────────────────────────────────────────────

/** Board cơ bản — 1 lựa chọn cược trên bảng Bingo 18. */
export interface BasicBoard {
  /** Mã board, format "B01", "B02",... Unique trong 1 ticket. */
  boardNo: string;
  /** Board đã bị void (admin void board cụ thể). true = không tính khi settle. */
  isVoid?: boolean;
  /** Loại cược: "singleNum" | "doubleMatch" | "tripleMatch". Quyết định cách tính thưởng. */
  playType: Bingo18PlayType;
  /** Số đã chọn (1-6) cho singleNum/doubleMatch, hoặc undefined cho tripleMatch any. */
  number?: number;
  /** Chỉ dùng cho tripleMatch: "specific" (chọn số) hoặc "any" (bất kỳ bộ ba). */
  tripleKind?: Bingo18TripleKind;
}

// ─────────────────────────────────────────────
// Side Bet – Cách chơi bổ sung
// ─────────────────────────────────────────────

/** Side Bet — cược bổ sung ngoài board cơ bản. */
export interface SideBet {
  /** Side bet đã bị void. true = không tính khi settle. */
  isVoid?: boolean;
  /** Loại side bet: "sumTotal" (đoán tổng) hoặc "bigSmallDraw" (lớn/hoà/nhỏ). */
  playType: Bingo18SideBetPlayType;
  /** Tổng cụ thể (3-18) cho sumTotal, hoặc big/draw/small cho bigSmallDraw. */
  sum?: number;
  /** Cược lớn/hoà/nhỏ. Chỉ dùng cho bigSmallDraw. */
  bet?: Bingo18BigSmallBet;
}

// ─────────────────────────────────────────────
// Ticket Document
// ─────────────────────────────────────────────

/** Vé Bingo 18 — đại diện cho 1 lần mua vé (purchase intent). */
export interface TicketDoc {
  /** MongoDB document ID. */
  _id: unknown;

  // ───── Ownership / Multi-tenant ─────

  /** ID đại lý sở hữu vé. Dùng để phân vùng dữ liệu multi-tenant. */
  tenantId: string;
  /** ID tài khoản player mua vé. */
  accountId: string;
  /** Tên đăng nhập player, snapshot tại thời điểm mua vé. */
  username: string;

  // ───── Ticket Identity ─────

  /** Mã vé hiển thị, format do hệ thống sinh. Unique toàn hệ thống. */
  ticketNo: string;
  /** Kênh mua vé: "web" | "mobile" | "api" | "pos". */
  channel: TicketChannel;

  // ───── Draw Plan ─────

  /** Kế hoạch tham gia các kỳ quay. */
  drawPlan: {
    /** Danh sách drawId sẽ tham gia. Có thể chơi nhiều kỳ liên tiếp. */
    drawIds: string[];
    /** Số kỳ quay đăng ký = drawIds.length. */
    drawCount: number;
  };

  // ───── Pricing ─────

  /** Thông tin giá vé, tính tại thời điểm mua. */
  pricing: {
    /** Mệnh giá 1 lần cược (VND). Snapshot từ global config. */
    unitPrice: number;
    /** Số lượng cược mỗi kỳ = boards.length + sideBets.length. */
    betsPerDraw: number;
    /** Tiền cược mỗi kỳ = betsPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền vé = amountPerDraw × drawCount. Trừ từ ví player khi mua. */
    totalAmount: number;
  };

  // ───── Tenant ─────

  /** Thông tin đại lý, snapshot tại thời điểm mua vé. */
  tenant: {
    /** Tỷ lệ hoa hồng đại lý. Lấy từ tenant config tại thời điểm mua. */
    commissionRate: number;
  };

  // ───── Boards cơ bản ─────

  /** Danh sách boards cơ bản (singleNum, doubleMatch, tripleMatch). Tối đa maxBasicBoardsPerTicket. */
  boards: BasicBoard[];

  // ───── Side Bets ─────

  /** Danh sách side bets (sumTotal, bigSmallDraw). */
  sideBets: SideBet[];

  // ───── Progress ─────

  /** Tiến trình xử lý entries qua các kỳ quay. */
  progress: {
    /** Tổng kỳ đã đăng ký = drawPlan.drawCount. */
    totalDraws: number;
    /** Số kỳ đã xử lý xong (settled + voided). Khi settledDraws = totalDraws → ticket completed. */
    settledDraws: number;
  };

  // ───── Settlement Summary ─────

  /** Tổng hợp kết quả settle qua các kỳ. Cập nhật mỗi khi 1 entry settle xong. */
  settlement?: {
    /** Tổng tiền thắng tích lũy qua các kỳ = Σ(entry.payout.winAmount). */
    totalWinAmount: number;
    /** Thời điểm settle entry gần nhất. */
    lastSettledAt?: Date;
  };

  // ───── Void / Refund Summary ─────

  /**
   * Tổng hợp void/refund. Cập nhật khi 1 hoặc nhiều kỳ bị void.
   * Ticket có thể bị void 1 phần (một số kỳ void, còn lại bình thường).
   */
  voidSummary?: {
    /** Tổng tiền cược gốc của các entries bị void = Σ(entry.voidInfo.originalAmount). */
    totalVoidedAmount: number;
    /** Tổng tiền đã hoàn trả = Σ(entry.voidInfo.refundAmount). */
    totalRefundedAmount: number;
    /** Số kỳ quay đã bị void. */
    voidedDrawCount: number;
    /** Danh sách drawId đã bị void. Dùng để kiểm tra kỳ nào đã void. */
    voidedDrawIds: string[];
    /** Thời điểm void gần nhất. */
    lastVoidedAt?: Date;
  };

  // ───── Status & Timestamps ─────

  /**
   * Trạng thái vé.
   * Luồng: pending → active (khi entry đầu tiên tạo) → completed (tất cả kỳ settled).
   */
  status: TicketStatus;
  /** Optimistic concurrency version. Tăng +1 mỗi lần update. */
  version: number;
  /** Thời điểm mua vé. Set 1 lần khi tạo, không đổi. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. Tự động cập nhật mỗi khi document thay đổi. */
  updatedAt: Date;
}

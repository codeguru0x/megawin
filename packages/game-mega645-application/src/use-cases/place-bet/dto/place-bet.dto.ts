import type { TicketChannel } from "@megawin/game-core/entities";
import type { BoardSelection, PlayType } from "@megawin/game-mega645/entities";

// ─────────────────────────────────────────────
// PlaceBet Input (từ player)
// ─────────────────────────────────────────────

export interface PlaceBetBoardInput {
  /** Mã board (A, B, C...) — định danh bảng chọn số trong vé. */
  boardNo: string;
  /**
   * Loại cách chơi:
   * - "normal": chọn đúng 6 số
   * - "system": chọn 7-15 số, hệ thống expand ra tất cả tổ hợp C(n,6)
   */
  playType: PlayType;
  /**
   * Các số đã chọn cho board.
   * Mega 6/45: numbers gồm 6-15 số trong khoảng 1-45 (tuỳ playType).
   */
  selection: BoardSelection;
  /** Số lần cược nhân bội (≥ 1). Default 1 (backward compat). */
  betCount?: number;
}

export interface PlaceBetInput {
  /** ID tenant đặt vé. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Tên đăng nhập người chơi. */
  username: string;
  /** Kênh đặt vé (web, mobile, api...). */
  channel: TicketChannel;
  /** IP address của player lúc đặt cược. Lấy từ CF-Connecting-IP hoặc X-Forwarded-For. */
  ipAddress?: string;
  /**
   * Danh sách ID các kỳ quay muốn tham gia.
   * Hỗ trợ mua nhiều kỳ (multi-draw), mỗi drawId tạo 1 entry.
   */
  drawIds: string[];
  /** Danh sách board chọn số (1 vé có thể có nhiều board). */
  boards: PlaceBetBoardInput[];
}

// ─────────────────────────────────────────────
// PlaceBet Output
// ─────────────────────────────────────────────

export interface PlaceBetOutput {
  /** ID vé vừa tạo (MongoDB ObjectId). */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi (human-readable). */
  ticketNo: string;
  /** Trạng thái vé sau khi đặt (thường là "active"). */
  status: string;
  /** Số dư ví player sau khi trừ tiền cược (VND). Từ response tenant. */
  balance: number;
  /** Thông tin các kỳ quay đã đăng ký. */
  drawPlan: {
    /** Danh sách ID kỳ quay đã đăng ký. */
    drawIds: string[];
    /** Tổng số kỳ quay tham gia. */
    drawCount: number;
  };
  /**
   * Chi tiết giá vé.
   *
   * Công thức tính:
   * - linesPerDraw = tổng số dòng expand từ tất cả board (ΣC(n,6) cho mỗi board)
   * - amountPerDraw = unitPrice × linesPerDraw
   * - totalAmount = amountPerDraw × drawCount
   */
  pricing: {
    /** Đơn giá 1 dòng (VND), ví dụ 10,000 VND. */
    unitPrice: number;
    /** Tổng số dòng mỗi kỳ = ΣC(n,6) cho tất cả board. */
    linesPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(expandedLines × betCount). */
    betUnitsPerDraw: number;
    /** Số tiền mỗi kỳ = unitPrice × betUnitsPerDraw (VND). */
    amountPerDraw: number;
    /** Tổng tiền vé = amountPerDraw × drawCount (VND). */
    totalAmount: number;
  };
  /** Tổng số board trong vé. */
  boardCount: number;
  /** Tổng số entry đã tạo (= số kỳ quay × 1). */
  entryCount: number;
}

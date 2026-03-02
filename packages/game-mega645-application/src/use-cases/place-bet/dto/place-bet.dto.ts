import type { PlayType } from "@megawin/game-mega645/entities";
import type { BoardSelection } from "@megawin/game-mega645/entities";
import type { TicketChannel } from "@megawin/game-core/entities";

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
   * Mega 6/45: mainNumbers gồm 6-15 số trong khoảng 1-45 (tuỳ playType).
   */
  selection: BoardSelection;
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
    /** Số tiền mỗi kỳ = unitPrice × linesPerDraw (VND). */
    amountPerDraw: number;
    /** Tổng tiền vé = amountPerDraw × drawCount (VND). */
    totalAmount: number;
  };
  /** Tổng số board trong vé. */
  boardCount: number;
  /** Tổng số entry đã tạo (= số kỳ quay × 1). */
  entryCount: number;
}

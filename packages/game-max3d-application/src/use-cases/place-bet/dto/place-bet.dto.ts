import type { PlayMode, PlayType } from "@megawin/game-max3d/entities";
import type { BoardSelection } from "@megawin/game-max3d/entities";
import type { TicketChannel } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// PlaceBet Input (từ player)
// ─────────────────────────────────────────────

export interface PlaceBetBoardInput {
  /** Số thứ tự bảng (board) trong vé, vd: "A", "B". */
  boardNo: string;
  /** Kiểu chơi: basic | combo | plus. */
  playMode: PlayMode;
  /** Loại cược: direct | rumble. */
  playType: PlayType;
  /** Lựa chọn số của player cho board này (bộ ba số 3 chữ số). */
  selection: BoardSelection;
}

export interface PlaceBetInput {
  /** ID đại lý / tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Tên đăng nhập player. */
  username: string;
  /** Kênh đặt cược (web / app / api). */
  channel: TicketChannel;
  /** IP address của player lúc đặt cược. Lấy từ CF-Connecting-IP hoặc X-Forwarded-For. */
  ipAddress?: string;

  /**
   * Danh sách drawIds mà player muốn cược.
   * Tất cả draws phải đang mở bán (salesOpen) và chưa hết hạn nhận cược.
   * All-or-nothing: 1 draw không hợp lệ → reject toàn bộ.
   */
  drawIds: string[];

  /** Danh sách boards trong vé. */
  boards: PlaceBetBoardInput[];
}

// ─────────────────────────────────────────────
// PlaceBet Output
// ─────────────────────────────────────────────

export interface PlaceBetOutput {
  /** ID vé vừa tạo. */
  ticketId: string;
  /** Mã vé hiển thị cho player. */
  ticketNo: string;
  /** Trạng thái vé sau khi tạo (pending). */
  status: string;
  drawPlan: {
    /** Danh sách drawId đã chọn. */
    drawIds: string[];
    /** Số kỳ quay. */
    drawCount: number;
  };
  pricing: {
    /** Đơn giá mỗi line (VND). */
    unitPrice: number;
    /** Tổng lines mỗi kỳ = Σ(board.lineCount). */
    linesPerDraw: number;
    /** Tiền cược mỗi kỳ = linesPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền cược = amountPerDraw × drawCount. */
    totalAmount: number;
  };
  /** Số boards trong vé. */
  boardCount: number;
  /** Số entries đã tạo = drawCount (1 entry / draw). */
  entryCount: number;
}

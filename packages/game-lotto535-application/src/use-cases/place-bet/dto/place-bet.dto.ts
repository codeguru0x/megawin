import type { PlayType } from "@megawin/game-lotto535/entities";
import type { BoardSelection } from "@megawin/game-lotto535/entities";
import type { TicketChannel } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// PlaceBet Input (từ player)
// ─────────────────────────────────────────────

export interface PlaceBetBoardInput {
  /** Ký hiệu bảng (A, B, C, D, E). */
  boardNo: string;
  /** Kiểu chơi (normal, system, ...). Quyết định cách expand thành lines. */
  playType: PlayType;
  /**
   * Bộ số đã chọn cho board.
   * - mainNumbers: 5+ số chính (1-35), unique. System play cho phép chọn >5.
   * - specialNumbers: 1+ số đặc biệt (1-12), unique.
   */
  selection: BoardSelection;
  /**
   * Số lần cược nhân bội (≥ minBetCount). Optional — default 1 khi không truyền.
   * Mỗi lần tham gia = 1 × unitPrice. betCount=3 → tiền cược × 3, thưởng × 3.
   */
  betCount?: number;
}

export interface PlaceBetInput {
  /** Mã tenant (đại lý / đối tác) phát hành vé. */
  tenantId: string;
  /** Mã tài khoản player. */
  accountId: string;
  /** Tên đăng nhập player. */
  username: string;
  /** Kênh đặt cược (web, mobile, api, ...). */
  channel: TicketChannel;
  /** IP address của player lúc đặt cược. Lấy từ CF-Connecting-IP hoặc X-Forwarded-For. */
  ipAddress?: string;

  /**
   * Danh sách drawIds mà player muốn cược.
   * Tất cả draws phải đang mở bán (salesOpen) và chưa hết hạn nhận cược.
   * All-or-nothing: 1 draw không hợp lệ → reject toàn bộ.
   */
  drawIds: string[];

  /**
   * Danh sách boards trên vé (tối đa maxBoardsPerTicket từ PlayRules).
   * Mỗi board expand thành N lines tùy theo playType và số lượng số đã chọn.
   */
  boards: PlaceBetBoardInput[];
}

// ─────────────────────────────────────────────
// PlaceBet Output
// ─────────────────────────────────────────────

export interface PlaceBetOutput {
  /** Mã vé duy nhất (MongoDB ObjectId). */
  ticketId: string;
  /** Số vé hiển thị cho player (human-readable). */
  ticketNo: string;
  /** Trạng thái vé sau khi tạo (thường là "active"). */
  status: string;
  /** Kế hoạch tham gia các kỳ quay. */
  drawPlan: {
    /** Danh sách mã kỳ quay đã đăng ký. */
    drawIds: string[];
    /** Số kỳ quay tham gia = drawIds.length. */
    drawCount: number;
  };
  /**
   * Chi tiết giá vé.
   *
   * Công thức tính:
   * - linesPerDraw = Σ(board.expandedLines) — tổng lines từ tất cả boards
   * - betUnitsPerDraw = Σ(board.expandedLines × board.betCount) — tổng đơn vị cược
   * - amountPerDraw = betUnitsPerDraw × unitPrice — giá cho 1 kỳ
   * - totalAmount = amountPerDraw × drawCount — tổng tiền toàn vé
   */
  pricing: {
    /** Đơn giá 1 line cho 1 kỳ (VND) — từ PlayRules.unitPrice. */
    unitPrice: number;
    /** Tổng số lines mỗi kỳ = Σ(board.expandedLines). */
    linesPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(board.expandedLines × betCount). */
    betUnitsPerDraw: number;
    /** Giá mỗi kỳ (VND) = betUnitsPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền toàn vé (VND) = amountPerDraw × drawCount. */
    totalAmount: number;
  };
  /** Số lượng boards trên vé. */
  boardCount: number;
  /** Tổng entries đã tạo = boardCount logic × drawCount (mỗi draw 1 entry). */
  entryCount: number;
}

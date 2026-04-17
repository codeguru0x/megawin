import type { PlayType } from "@megawin/game-power655/entities";
import type { BoardSelection } from "@megawin/game-power655/entities";
import type { TicketChannel } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// PlaceBet Input (từ player)
// ─────────────────────────────────────────────

export interface PlaceBetBoardInput {
  /** Mã board (A, B, C, ...). Dùng để phân biệt các board trong vé. */
  boardNo: string;
  /** Loại chơi: Standard (6 số), Bao5 (5 số → 50 lines), Bao7-18 (C(N,6) lines). */
  playType: PlayType;
  /** Danh sách số đã chọn. Chỉ có mainNumbers (Power 6/55 không có specialNumbers). */
  selection: BoardSelection;
  /** Số lần cược nhân bội (≥ 1). Default 1. */
  betCount?: number;
}

export interface PlaceBetInput {
  /** ID tenant (đại lý) phát hành vé. */
  tenantId: string;
  /** ID tài khoản người chơi trên hệ thống tenant. */
  accountId: string;
  /** Tên đăng nhập của người chơi. */
  username: string;
  /** Kênh đặt cược (web, mobile, retail, ...). */
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
   * Danh sách boards (1-5).
   * Mỗi board có playType riêng: Standard (6 số), Bao5 (5 số → 50 lines), Bao7-18 (C(N,6) lines).
   * Tất cả số trong range [1, 55].
   */
  boards: PlaceBetBoardInput[];
}

// ─────────────────────────────────────────────
// PlaceBet Output
// ─────────────────────────────────────────────

export interface PlaceBetOutput {
  /** ID vé đã tạo thành công. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi (ví dụ: "PW-20250301-00123"). */
  ticketNo: string;
  /** Trạng thái vé sau khi tạo (thường là "active"). */
  status: string;
  /** Số dư ví player sau khi trừ tiền cược (VND). Từ response tenant. */
  balance: number;
  /** Thông tin kế hoạch kỳ quay cho vé. */
  drawPlan: {
    /** Danh sách ID các kỳ quay mà vé tham gia. */
    drawIds: string[];
    /** Số kỳ quay vé tham gia. */
    drawCount: number;
  };
  /** Thông tin giá cược. */
  pricing: {
    /**
     * Giá 1 dòng cược (VND).
     * Lấy từ cấu hình game (PlayRules.unitPrice).
     */
    unitPrice: number;
    /**
     * Tổng số dòng mỗi kỳ quay.
     * Công thức: sum(lines per board). Bao N sinh C(N,6) dòng.
     */
    linesPerDraw: number;
    /**
     * Tổng đơn vị cược mỗi kỳ = Σ(expandedLines × betCount).
     * Khi tất cả boards betCount=1 → betUnitsPerDraw = linesPerDraw.
     */
    betUnitsPerDraw: number;
    /**
     * Số tiền cược mỗi kỳ quay (VND).
     * Công thức: unitPrice × betUnitsPerDraw.
     */
    amountPerDraw: number;
    /**
     * Tổng số tiền cược (VND).
     * Công thức: amountPerDraw × drawCount.
     */
    totalAmount: number;
  };
  /** Tổng số board trong vé. */
  boardCount: number;
  /** Tổng số entries đã tạo (= drawCount, mỗi kỳ 1 entry). */
  entryCount: number;
}

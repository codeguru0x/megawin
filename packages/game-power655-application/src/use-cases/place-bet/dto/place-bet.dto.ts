import type { PlayType } from "@megawin/game-power655/entities";
import type { BoardSelection } from "@megawin/game-power655/entities";
import type { TicketChannel } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// PlaceBet Input (từ player)
// ─────────────────────────────────────────────

export interface PlaceBetBoardInput {
  boardNo: string;
  playType: PlayType;
  /** Danh sách số đã chọn. Chỉ có mainNumbers (Power 6/55 không có specialNumbers). */
  selection: BoardSelection;
}

export interface PlaceBetInput {
  tenantId: string;
  accountId: string;
  username: string;
  channel: TicketChannel;

  /**
   * Danh sách drawIds mà player muốn cược.
   * Tất cả draws phải đang mở bán (salesOpen) và chưa hết hạn nhận cược.
   * All-or-nothing: 1 draw không hợp lệ → reject toàn bộ.
   */
  drawIds: string[];

  /**
   * Danh sách boards (1-5).
   * Mỗi board có playType riêng: Standard (6 số), Bao7-18 (7-18 số), QuickPick (auto 6 số).
   * Tất cả số trong range [1, 55].
   */
  boards: PlaceBetBoardInput[];
}

// ─────────────────────────────────────────────
// PlaceBet Output
// ─────────────────────────────────────────────

export interface PlaceBetOutput {
  ticketId: string;
  ticketNo: string;
  status: string;
  drawPlan: {
    drawIds: string[];
    drawCount: number;
  };
  pricing: {
    unitPrice: number;
    linesPerDraw: number;
    amountPerDraw: number;
    totalAmount: number;
  };
  boardCount: number;
  entryCount: number;
}

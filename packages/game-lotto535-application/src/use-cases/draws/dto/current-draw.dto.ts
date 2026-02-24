import type { DrawStatus } from "@megawin/game-core/entities";
import type { DrawEntity } from "../../../infras/mappers/draw-mapper";

// ─────────────────────────────────────────────
// GetCurrentDraw
// ─────────────────────────────────────────────

export interface GetCurrentDrawInput {
  /**
   * Cho phép trả draw ở các status cụ thể.
   * Nếu không truyền, mặc định trả draw đang salesOpen.
   * Backoffice có thể truyền nhiều status để lấy draw "đang active nhất".
   */
  allowStatuses?: DrawStatus[];
}

export interface CurrentDrawInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  status: string;
  sales: {
    openAt: string;
    closeAt: string;
  };
  jackpot: {
    openingAmount: number;
    isSplitCycle: boolean;
  };
  stats?: {
    ticketEntryCount: number;
    totalLineCount: number;
    totalSalesAmount: number;
  };
}

export interface GetCurrentDrawOutput {
  currentDraw: CurrentDrawInfo | null;
  /** Kỳ kế tiếp (scheduled) nếu có, dùng cho UI hiển thị countdown. */
  nextDraw: CurrentDrawInfo | null;
  /** Kỳ đã settle gần nhất, dùng cho UI hiển thị kết quả mới nhất. */
  lastSettledDraw: {
    drawId: string;
    drawDate: string;
    drawNo: number;
    drawTime: string;
    result?: {
      winningMain: number[];
      winningSpecial: number;
      publishedAt: string;
    };
    jackpot: {
      openingAmount: number;
      closingAmount?: number;
      isSplitCycle: boolean;
    };
  } | null;
}

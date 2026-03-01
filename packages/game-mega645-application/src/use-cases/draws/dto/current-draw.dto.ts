import type { DrawStatus } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// GetCurrentDraw
// ─────────────────────────────────────────────

export interface GetCurrentDrawInput {
  allowStatuses?: DrawStatus[];
}

export interface CurrentDrawInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  status: string;
  sales: {
    openAt?: string;
    closeAt: string;
  };
  /** Jackpot hiện tại (VND) — đọc từ active cycle. */
  jackpotCurrentAmount: number;
  /** Dự kiến kỳ chia giải. */
  splitCycleIntent: boolean;
  stats?: {
    ticketEntryCount: number;
    totalLineCount: number;
    totalSalesAmount: number;
  };
}

export interface GetCurrentDrawOutput {
  /** Kỳ active đầu tiên (backward compat). */
  currentDraw: CurrentDrawInfo | null;
  /** Tất cả các kỳ active, sorted theo drawDate asc. */
  activeDraws: CurrentDrawInfo[];
  /** Jackpot hiện tại từ active cycle (VND). */
  jackpotCurrentAmount: number;
  /** Kỳ đã settle gần nhất. */
  lastSettledDraw: {
    drawId: string;
    drawDate: string;
    drawNo: number;
    drawTime: string;
    result?: {
      winningMain: number[];
      publishedAt: string;
    };
    jackpot?: {
      openingAmount: number;
      closingAmount: number;
      isSplitCycle: boolean;
    };
  } | null;
}

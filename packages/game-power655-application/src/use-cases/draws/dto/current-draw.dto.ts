import type { DrawStatus } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// GetCurrentDraw
// ─────────────────────────────────────────────

export interface GetCurrentDrawInput {
  /**
   * Cho phép trả draw ở các status cụ thể.
   * Nếu không truyền, mặc định trả tất cả draw active.
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
    openAt?: string;
    closeAt: string;
  };
  /** Jackpot 1 hiện tại (VND) — đọc từ active cycle. */
  jackpot1CurrentAmount: number;
  /** Jackpot 2 hiện tại (VND) — đọc từ active cycle. */
  jackpot2CurrentAmount: number;
  /** Dự kiến kỳ chia giải (split cycle). */
  splitCycleIntent: boolean;
  stats?: {
    totalEntries: number;
    totalLines: number;
    totalSalesAmount?: number;
  };
}

export interface GetCurrentDrawOutput {
  /** Kỳ active đầu tiên (backward compat). */
  currentDraw: CurrentDrawInfo | null;
  /** Tất cả các kỳ active, sorted theo drawDate asc. */
  activeDraws: CurrentDrawInfo[];
  /** Jackpot 1 hiện tại từ active cycle (VND). */
  jackpot1CurrentAmount: number;
  /** Jackpot 2 hiện tại từ active cycle (VND). */
  jackpot2CurrentAmount: number;
  /** Kỳ đã settle gần nhất. */
  lastSettledDraw: {
    drawId: string;
    drawDate: string;
    drawNo: number;
    drawTime: string;
    result?: {
      winningMain: number[];
      bonusNumber: number;
      publishedAt: string;
    };
    jackpot?: {
      openingJackpot1: number;
      closingJackpot1: number;
      openingJackpot2: number;
      closingJackpot2: number;
      isSplitCycle: boolean;
    };
  } | null;
}

// ─────────────────────────────────────────────
// GetCurrentDraw / GetActiveDraws
// ─────────────────────────────────────────────

export interface GetCurrentDrawInput {
  allowStatuses?: string[];
}

export interface KenoCurrentDrawInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  status: string;
  sales: {
    openAt?: string;
    closeAt: string;
  };
  result?: {
    winningNumbers: number[];
    publishedAt: string;
  };
  stats?: {
    ticketEntryCount: number;
    totalSalesAmount: number;
  };
}

export interface GetCurrentDrawOutput {
  currentDraw: KenoCurrentDrawInfo | null;
  activeDraws: KenoCurrentDrawInfo[];
}

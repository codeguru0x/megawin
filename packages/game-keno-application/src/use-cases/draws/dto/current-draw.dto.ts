// ─────────────────────────────────────────────
// GetCurrentDraw / GetActiveDraws
// ─────────────────────────────────────────────

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
  result?: {
    winningNumbers: string[];
    publishedAt: string;
  };
  stats?: {
    ticketEntryCount: number;
    totalSalesAmount: number;
  };
}

export interface GetCurrentDrawOutput {
  currentDraw: CurrentDrawInfo | null;
  activeDraws: CurrentDrawInfo[];
}

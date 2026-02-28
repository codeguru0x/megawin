import type { DrawStatus } from "@megawin/game-core/entities";
import type { DrawNo } from "@megawin/game-lotto535/entities";
import type { DrawEntity } from "../../../infras/mappers/draw-mapper";

// ─────────────────────────────────────────────
// CreateDraws (batch – tạo nhiều kỳ liên tiếp)
// ─────────────────────────────────────────────

export interface CreateDrawsInput {
  /** Số kỳ cần tạo (1-12). */
  count: number;
}

export interface CreateDrawsOutputItem {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  closeAt: string;
  financialDate: string;
  status: string;
}

export interface CreateDrawsOutput {
  draws: CreateDrawsOutputItem[];
}

// ─────────────────────────────────────────────
// PreviewDraws
// ─────────────────────────────────────────────

export interface PreviewDrawsInput {
  count: number;
}

export interface PreviewDrawItem {
  drawDate: string;
  drawNo: number;
  drawTime: string;
  closeAt: string;
  status: string;
}

export interface PreviewDrawsOutput {
  draws: PreviewDrawItem[];
}

// ─────────────────────────────────────────────
// OpenSales / CloseSales / VoidDraw
// ─────────────────────────────────────────────

export interface DrawIdInput {
  drawId: string;
}

export interface DrawTransitionOutput {
  drawId: string;
  previousStatus: string;
  currentStatus: string;
}

// ─────────────────────────────────────────────
// PublishResult
// ─────────────────────────────────────────────

export interface PublishResultInput {
  drawId: string;
  /** 5 số chính trúng thưởng (1-35), unique, unsorted OK. */
  winningMain: number[];
  /** 1 số đặc biệt trúng thưởng (1-12). */
  winningSpecial: number;
  /** Tham chiếu kỳ quay Vietlott (optional). */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
    drawSession: number;
  };
}

export interface PublishResultOutput {
  drawId: string;
  status: string;
  result: {
    winningMain: number[];
    winningSpecial: number;
    publishedAt: string;
  };
}

// ─────────────────────────────────────────────
// TriggerSettle
// ─────────────────────────────────────────────

export interface TriggerSettleInput {
  drawId: string;
}

export interface TriggerSettleOutput {
  drawId: string;
  status: string;
  isSplitCycle: boolean;
  /** Tổng entries sẽ được settle bởi worker. */
  totalEntries: number;
  totalLines: number;
}

// ─────────────────────────────────────────────
// ListDraws
// ─────────────────────────────────────────────

export interface ListDrawsInput {
  status?: DrawStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  size?: number;
}

export interface DrawSummary {
  id: string;
  drawId: string;
  drawDate: string;
  drawNo: DrawNo;
  drawTime: string;
  status: string;
  /** Jackpot opening — chỉ có cho draws đã settle. */
  jackpotAmount?: number;
  jackpotClosingAmount?: number;
  isSplitCycle: boolean;
  hasResult: boolean;
  ticketEntryCount?: number;
  totalRevenue?: number;
  financial?: {
    totalFixedPrizes: number;
    totalAgentCommission: number;
    companyTake: number;
    jackpotContribution: number;
  };
}

export interface ListDrawsOutput {
  draws: DrawSummary[];
  page: number;
  size: number;
}

// ─────────────────────────────────────────────
// GetDrawDetail
// ─────────────────────────────────────────────

export interface GetDrawDetailInput {
  drawId: string;
}

export interface GetDrawDetailOutput {
  draw: DrawEntity;
}

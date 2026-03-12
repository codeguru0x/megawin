import type { DrawStatus } from "@megawin/game-core/entities";
import type { DrawEntity } from "../../../infras/mappers/draw-mapper";

// ─────────────────────────────────────────────
// CreateDraw (batch)
// ─────────────────────────────────────────────

export interface CreateDrawInput {
  drawDate: string;
  /** Số kỳ tạo 1 lúc. Default 10, max 30. */
  count: number;
}

export interface CreateDrawOutputItem {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  closeAt: string;
  financialDate: string;
  status: string;
}

export interface CreateDrawOutput {
  draws: CreateDrawOutputItem[];
}

// ─────────────────────────────────────────────
// PreviewDraws
// ─────────────────────────────────────────────

export interface PreviewDrawsInput {
  drawDate: string;
  count: number;
}

export interface PreviewDrawItem {
  drawNo: number;
  drawTime: string;
  closeAt: string;
  /** salesOpen nếu trong [firstDrawTime, lastDrawTime], scheduled nếu ngoài. */
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
  /** 20 số trúng thưởng ("01"-"80"), unique, giữ nguyên thứ tự quay. */
  winningNumbers: string[];
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

export interface PublishResultOutput {
  drawId: string;
  status: string;
  result: {
    winningNumbers: string[];
    publishedAt: string;
  };
}

// ─────────────────────────────────────────────
// TriggerSettle
// ─────────────────────────────────────────────

export interface TriggerSettleInput {
  drawId: string;
  /** ARN của Step Function kết sổ Keno. */
  KENO_SETTLE_SFN_ARN: string;
}

export interface TriggerSettleOutput {
  drawId: string;
  status: string;
  totalEntries: number;
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
  drawNo: number;
  drawTime: string;
  status: string;
  hasResult: boolean;
  /** 20 số trúng thưởng (01-80), chỉ có sau khi published. */
  result?: { winningNumbers: string[] };
  ticketEntryCount?: number;
  totalRevenue?: number;
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

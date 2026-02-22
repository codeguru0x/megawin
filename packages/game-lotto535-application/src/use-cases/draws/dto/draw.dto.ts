import type {
  Lotto535DrawStatus,
  DrawResultSource,
  Lotto535PrizeTier,
} from "@megawin/game-lotto535/entities";
import type { DrawEntity } from "../../../infras/mappers/draw-mapper";

// ─────────────────────────────────────────────
// CreateDraws
// ─────────────────────────────────────────────

export interface CreateDrawsInput {
  /** Ngày tạo kỳ quay, format "YYYY-MM-DD". */
  drawDate: string;
}

export interface CreateDrawsOutput {
  draws: Array<{
    drawId: string;
    drawDate: string;
    drawNo: number;
    drawTime: string;
    status: string;
  }>;
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
  /** Nguồn kết quả. */
  source: DrawResultSource;
  /** Checksum (optional). */
  checksum?: string;
  /** Tham chiếu kỳ quay Vietlott (optional). */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
    drawSession: number;
    sourceUrl?: string;
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
  /** Số entry được stamp kết quả. */
  entriesUpdated: number;
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
  status?: Lotto535DrawStatus;
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
  jackpotAmount: number;
  isSplitCycle: boolean;
  hasResult: boolean;
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

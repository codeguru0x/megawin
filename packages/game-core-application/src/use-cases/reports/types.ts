/**
 * Input/Output types cho system report use cases.
 *
 * Tách riêng để use case file gọn, consumer import trực tiếp từ types file.
 */

import type {
  DailyOverviewRow,
  GameSummaryRow,
  TenantSummaryRow,
  DashboardGameDailyData,
} from "../../infras/repos/types";
import type {
  SystemSettleGameDaily,
  SystemOutstandingGameDaily,
  SystemSettleTenantDaily,
} from "@megawin/game-core/entities";

// ─── Daily Overview ───────────────────────────────────────────────────────────

export interface GetDailyOverviewInput {
  from: string;
  to: string;
  /** Nếu có → trả raw docs cho ngày đó (inline day expansion). */
  date?: string;
}

export interface GetDailyOverviewOutput {
  data: DailyOverviewRow[] | SystemSettleGameDaily[];
}

// ─── Game Summary ─────────────────────────────────────────────────────────────

export interface GetGameSummaryInput {
  from: string;
  to: string;
}

export interface GetGameSummaryOutput {
  data: GameSummaryRow[];
}

// ─── Tenant Summary ───────────────────────────────────────────────────────────

export interface GetTenantSummaryInput {
  from?: string;
  to?: string;
  /** Lọc theo 1 game cụ thể. Undefined / "all" = tất cả game. */
  game?: string;
  /** Nếu có → trả game breakdown cho tenant đó. */
  tenantId?: string;
}

export interface GetTenantSummaryOutput {
  data: TenantSummaryRow[] | SystemSettleTenantDaily[];
}

// ─── Outstanding ──────────────────────────────────────────────────────────────

export interface GetSystemOutstandingOutput {
  data: SystemOutstandingGameDaily[];
}

// ─── Dashboard KPIs ───────────────────────────────────────────────────────────

export interface GetDashboardKpisInput {
  /** Ngày tài chính đang xem (YYYY-MM-DD). */
  fd: string;
  /** Ngày so sánh, cùng thứ tuần trước (YYYY-MM-DD). Chỉ truyền khi fd < today. */
  compare?: string;
}

export interface GetDashboardKpisOutput {
  /**
   * Raw per-game data cho 1-2 ngày tài chính.
   * Client tách theo financialDate để compute KPI totals, trend %, payout ratio.
   */
  data: DashboardGameDailyData[];
}

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
  PlayerOverviewResult,
  PlayerOutstandingSummary,
  PlayerSettledEntryRow,
} from "../../infras/repos/types";
import type {
  SystemSettleGameDaily,
  SystemOutstandingGameDaily,
  SystemSettleTenantDaily,
  PlayerSettleGameDailyEntity,
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
  /** Ngày tài chính chính (YYYY-MM-DD). */
  fd: string;
  /**
   * Danh sách ngày so sánh, comma-separated (YYYY-MM-DD,YYYY-MM-DD).
   * Phương án C: truyền yesterdayFd + compareFd (cùng thứ tuần trước).
   */
  compare?: string;
}

export interface GetDashboardKpisOutput {
  /**
   * Raw per-game data cho 1-N ngày tài chính.
   * Client tách theo financialDate để compute KPI totals, trend %, payout ratio.
   */
  data: DashboardGameDailyData[];
}

// ─── Player Overview ──────────────────────────────────────────────────────────

export interface GetPlayerOverviewInput {
  /** ID tài khoản player (ULID). */
  accountId: string;
  /** Ngày bắt đầu (YYYY-MM-DD). */
  from: string;
  /** Ngày kết thúc (YYYY-MM-DD). */
  to: string;
}

export interface GetPlayerOverviewOutput {
  /** KPIs tổng hợp + game breakdown của player trong date range. */
  data: PlayerOverviewResult;
}

// ─── Player Financials ────────────────────────────────────────────────────────

export interface GetPlayerFinancialsInput {
  /** ID tài khoản player (ULID). */
  accountId: string;
  /** Ngày bắt đầu (YYYY-MM-DD). */
  from: string;
  /** Ngày kết thúc (YYYY-MM-DD). */
  to: string;
  /** Lọc theo game cụ thể. Undefined / "all" = tất cả game. */
  game?: string;
}

export interface GetPlayerFinancialsOutput {
  /** Raw docs player_settle_game_daily sort by financialDate desc, gameProduct asc. */
  data: PlayerSettleGameDailyEntity[];
}

// ─── Player Outstanding ──────────────────────────────────────────────────────

export interface GetPlayerOutstandingInput {
  /** ID tài khoản player (ULID). */
  accountId: string;
}

export interface GetPlayerOutstandingOutput {
  /** Summary KPIs + danh sách entries đang chờ (cross-game). */
  data: PlayerOutstandingSummary;
}

// ─── Player Entries (drill cấp 2 — tab Tài chính) ─────────────────────────────

export interface GetPlayerEntriesInput {
  /** ID tài khoản player. */
  accountId: string;
  /** Ngày tài chính cần drill (YYYY-MM-DD). */
  financialDate: string;
  /** Game product string (vd: "mega645"). */
  game: string;
}

export interface GetPlayerEntriesOutput {
  /**
   * Danh sách entries settled/voided của player trong ngày × game.
   * KHÔNG bao gồm outstanding (scheduled) entries.
   */
  data: PlayerSettledEntryRow[];
}

// ─── Player Entry Detail (dialog chi tiết) ───────────────────────────────────

export interface GetPlayerEntryDetailInput {
  /** Game product string — dùng để biết collection nào cần query. */
  game: string;
  /** Entry ID (ObjectId hex string). */
  entryId: string;
}

export interface GetPlayerEntryDetailOutput {
  /**
   * Full entry doc — game-specific TicketEntryEntity.
   *
   * Outstanding entries: có entrySummary, amount, drawId — KHÔNG có payout/result/outcome.
   * Settled entries: có payout (nếu win), result, outcome.
   * Voided entries: có voidInfo — KHÔNG có payout/result.
   * Consumer cast sang đúng TicketEntryEntity của từng game.
   */
  data: unknown | null;
}

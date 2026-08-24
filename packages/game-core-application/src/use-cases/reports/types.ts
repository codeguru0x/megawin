/**
 * Input/Output types cho system report use cases.
 *
 * Tách riêng để use case file gọn, consumer import trực tiếp từ types file.
 */

import type {
  PlayerSettleGameDailyEntity,
  SystemOutstandingGameDaily,
  SystemSettleGameDaily,
} from "@megawin/game-core/entities";
import type { FinancialPeriod } from "@megawin/shared/utils";

import type {
  DailyOverviewRow,
  DashboardGameDailyData,
  GamePeriodByGameRow,
  GamePeriodMetricKey,
  GamePeriodRow,
  GameSummaryRow,
  PlayerDrawBreakdownRow,
  PlayerOutstandingSummary,
  PlayerOverviewResult,
  PlayerSettledEntryRow,
  TenantGameBreakdownRow,
  TenantSummaryRow,
} from "../../infras/repos/types";

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
  /** Lọc 1 game. Bỏ trống = tất cả game (mặc định, dùng cho tab "Theo game"). */
  game?: string;
}

export interface GetGameSummaryOutput {
  data: GameSummaryRow[];
}

// ─── Game Period Trend ────────────────────────────────────────────────────────

export interface GetGamePeriodTrendInput {
  from: string;
  to: string;
  /** Độ chia kỳ: `day` | `week` | `month`. */
  period: FinancialPeriod;
  /** Lọc 1 game. Bỏ trống = tất cả game gộp lại theo từng kỳ. */
  game?: string;
}

export interface GetGamePeriodTrendOutput {
  data: GamePeriodRow[];
  /** Echo lại tham số đã dùng — người đọc/biểu đồ phải biết dòng đang là ngày, tuần hay tháng. */
  meta: {
    period: FinancialPeriod;
    /** `undefined` = không lọc game (tổng hệ thống). */
    game?: string;
    /** Tên game để hiển thị. `undefined` khi không lọc game. */
    gameLabel?: string;
    from: string;
    to: string;
  };
}

// ─── Game Period Trend By Game (so sánh N game trên 1 chỉ số) ───────────────

export interface GetGamePeriodTrendByGameInput {
  from: string;
  to: string;
  /** Độ chia kỳ: `day` | `week` | `month`. */
  period: FinancialPeriod;
  /** Danh sách game cần so sánh — tối thiểu 2. */
  games: string[];
  /** Chỉ số DUY NHẤT để so sánh giữa các game (vd `"ggr"`, `"totalStake"`). */
  metric: GamePeriodMetricKey;
}

export interface GetGamePeriodTrendByGameOutput {
  data: GamePeriodByGameRow[];
  /** Echo lại tham số đã dùng — dòng dữ liệu chỉ có khoá kỳ + cột game, không tự nói được chỉ số nào. */
  meta: {
    period: FinancialPeriod;
    games: string[];
    gameLabels: string[];
    metric: GamePeriodMetricKey;
    metricLabel: string;
    from: string;
    to: string;
  };
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
  data: TenantSummaryRow[] | TenantGameBreakdownRow[];
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
  /** Optional: filter theo 1 kỳ quay cụ thể (View 4 từ draw breakdown). */
  drawId?: string;
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

// ─── Player Draw Breakdown (View 3 — kỳ quay trong ngày) ────────────────────

export interface GetPlayerDrawBreakdownInput {
  /** ID tài khoản player. */
  accountId: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Game product string (vd: "keno"). */
  game: string;
}

export interface GetPlayerDrawBreakdownOutput {
  /** Breakdown theo drawId — aggregate entries trong 1 ngày × 1 game × 1 player. */
  data: PlayerDrawBreakdownRow[];
}

/**
 * Input/Output types cho Bingo 18 report use cases.
 */

import type {
  SettleDrawReport,
  SettleTenantReport,
  VoidDrawReport,
  OutstandingDrawReport,
  TicketEntryEntity,
} from "@megawin/game-bingo18/entities";
import type {
  DrawSummaryResult,
  TenantAggregateSummary,
  PlayerBreakdownRow,
  OutstandingTenantBreakdownRow,
  OutstandingPlayerBreakdownRow,
} from "../../infras/repos/types";

export interface ListSettleDrawReportsInput {
  from: string;
  to: string;
  page: number;
  limit: number;
}
export interface ListSettleDrawReportsOutput {
  data: SettleDrawReport[];
  total: number;
  page: number;
  limit: number;
}
export interface GetDrawSummaryInput {
  from: string;
  to: string;
}
export interface GetDrawSummaryOutput {
  data: DrawSummaryResult | null;
}
export interface ListDrawTenantsInput {
  drawId: string;
}
export interface ListDrawTenantsOutput {
  data: SettleTenantReport[];
}
export interface ListTenantReportsInput {
  from: string;
  to: string;
}
export interface ListTenantReportsOutput {
  data: TenantAggregateSummary[];
}
export interface ListTenantDrawsInput {
  tenantId: string;
  from: string;
  to: string;
}
export interface ListTenantDrawsOutput {
  data: SettleTenantReport[];
  total: number;
}
export interface ListPlayerBreakdownInput {
  drawId: string;
  tenantId: string;
}
export interface ListPlayerBreakdownOutput {
  data: PlayerBreakdownRow[];
}
export interface ListEntryBreakdownInput {
  drawId: string;
  tenantId: string;
  accountId: string;
}
export interface ListEntryBreakdownOutput {
  data: TicketEntryEntity[];
}
export interface ListVoidReportsInput {
  from: string;
  to: string;
}
export interface ListVoidReportsOutput {
  data: VoidDrawReport[];
}
export interface GetOutstandingReportsOutput {
  data: OutstandingDrawReport[];
}

// ─── Outstanding Drill-Down ───────────────────────────────────────────────────

export interface ListOutstandingDrawTenantsInput {
  drawId: string;
}

export interface ListOutstandingDrawTenantsOutput {
  data: OutstandingTenantBreakdownRow[];
}

export interface ListOutstandingTenantPlayersInput {
  drawId: string;
  tenantId: string;
}

export interface ListOutstandingTenantPlayersOutput {
  data: OutstandingPlayerBreakdownRow[];
}

export interface ListOutstandingPlayerEntriesInput {
  drawId: string;
  tenantId: string;
  accountId: string;
}

export interface ListOutstandingPlayerEntriesOutput {
  data: TicketEntryEntity[];
}

// ─── Sync Outstanding ─────────────────────────────────────────────────────────

export interface SyncOutstandingResult {
  /** Số draw đã upsert outstanding report. */
  drawsSynced: number;
  /** Số draw active theo system outstanding report. */
  systemActiveDrawCount: number;
  /** Tổng stake outstanding theo system outstanding report (VND). */
  systemTotalStake: number;
}

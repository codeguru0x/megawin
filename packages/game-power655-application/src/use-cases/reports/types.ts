/**
 * Input/Output types cho Power 6/55 report use cases.
 */

import type {
  SettleDrawReport,
  SettleTenantReport,
  VoidDrawReport,
  OutstandingDrawReport,
  TicketEntryEntity,
} from "@megawin/game-power655/entities";
import type {
  DrawSummaryResult,
  TenantAggregateSummary,
  PlayerBreakdownRow,
  OutstandingTenantBreakdownRow,
  OutstandingPlayerBreakdownRow,
  VoidTenantBreakdownRow,
  VoidPlayerBreakdownRow,
} from "../../infras/repos";

// ─── Draw Reports ─────────────────────────────────────────────────────────────

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

// ─── Draw Summary (KPI) ───────────────────────────────────────────────────────

export interface GetDrawSummaryInput {
  from: string;
  to: string;
}

export interface GetDrawSummaryOutput {
  data: DrawSummaryResult | null;
}

// ─── Draw → Tenants ───────────────────────────────────────────────────────────

export interface ListDrawTenantsInput {
  drawId: string;
}

export interface ListDrawTenantsOutput {
  data: SettleTenantReport[];
}

// ─── Tenant Reports ───────────────────────────────────────────────────────────

export interface ListTenantReportsInput {
  from: string;
  to: string;
}

export interface ListTenantReportsOutput {
  data: TenantAggregateSummary[];
}

// ─── Tenant → Draws ───────────────────────────────────────────────────────────

export interface ListTenantDrawsInput {
  tenantId: string;
  from: string;
  to: string;
  page: number;
  limit: number;
}

export interface ListTenantDrawsOutput {
  data: SettleTenantReport[];
  total: number;
  page: number;
  limit: number;
}

// ─── Player Breakdown ─────────────────────────────────────────────────────────

export interface ListPlayerBreakdownInput {
  drawId: string;
  tenantId: string;
}

export interface ListPlayerBreakdownOutput {
  data: PlayerBreakdownRow[];
}

// ─── Entry Breakdown ──────────────────────────────────────────────────────────

export interface ListEntryBreakdownInput {
  drawId: string;
  tenantId: string;
  accountId: string;
}

export interface ListEntryBreakdownOutput {
  data: TicketEntryEntity[];
}

// ─── Void Reports ─────────────────────────────────────────────────────────────

export interface ListVoidReportsInput {
  from: string;
  to: string;
}

export interface ListVoidReportsOutput {
  data: VoidDrawReport[];
}

// ─── Outstanding ──────────────────────────────────────────────────────────────

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

// ─── Get Entry By Id ──────────────────────────────────────────────────────────

export interface GetEntryByIdInput {
  entryId: string;
}

export interface GetEntryByIdOutput {
  entry: TicketEntryEntity;
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

// ─── Void Drill-Down ─────────────────────────────────────────────────────────

export interface ListVoidDrawTenantsInput {
  drawId: string;
}

export interface ListVoidDrawTenantsOutput {
  data: VoidTenantBreakdownRow[];
}

export interface ListVoidTenantPlayersInput {
  drawId: string;
  tenantId: string;
}

export interface ListVoidTenantPlayersOutput {
  data: VoidPlayerBreakdownRow[];
}

export interface ListVoidPlayerEntriesInput {
  drawId: string;
  tenantId: string;
  accountId: string;
}

export interface ListVoidPlayerEntriesOutput {
  data: TicketEntryEntity[];
}

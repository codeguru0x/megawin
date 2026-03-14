/**
 * Input/Output types cho Max 3D report use cases.
 */

import type {
  SettleDrawReport,
  SettleTenantReport,
  VoidDrawReport,
  OutstandingDrawReport,
} from "@megawin/game-max3d/entities";
import type {
  DrawSummaryResult,
  TenantAggregateSummary,
  PlayerBreakdownRow,
  EntryEntity,
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

// ─── Draw Summary ─────────────────────────────────────────────────────────────

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
  data: EntryEntity[];
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

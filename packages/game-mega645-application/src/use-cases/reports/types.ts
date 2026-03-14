import type {
  SettleDrawReport,
  SettleTenantReport,
  VoidDrawReport,
  OutstandingDrawReport,
} from "@megawin/game-mega645/entities";
import type {
  DrawSummaryResult,
  TenantAggregateSummary,
  PlayerBreakdownRow,
  EntryEntity,
} from "../../infras/repos";

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
  page: number;
  limit: number;
}
export interface ListTenantDrawsOutput {
  data: SettleTenantReport[];
  total: number;
  page: number;
  limit: number;
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
  data: EntryEntity[];
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

/**
 * Mega 6/45 – MongoDB Indexes
 */

import { Mega645Collections } from "../entities/enums";

export interface IndexSpec {
  collection: string;
  key: Record<string, 1 | -1>;
  options?: {
    unique?: boolean;
    name?: string;
    sparse?: boolean;
  };
  purpose: string;
}

export const MEGA645_INDEXES: readonly IndexSpec[] = [
  // ───── mega645GameConfigs ─────
  {
    collection: Mega645Collections.GameConfigs,
    key: { scope: 1, tenantId: 1 },
    options: { unique: true, name: "idx_scope_tenant_unique" },
    purpose: "1 global config + 1 config per tenant",
  },

  // ───── mega645Tickets ─────
  {
    collection: Mega645Collections.Tickets,
    key: { accountId: 1, ticketNo: 1 },
    options: { unique: true, name: "idx_account_ticketNo_unique" },
    purpose: "Mã vé unique per account",
  },
  {
    collection: Mega645Collections.Tickets,
    key: { tenantId: 1, accountId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_account_status_created" },
    purpose: "Player pending/completed tickets",
  },
  {
    collection: Mega645Collections.Tickets,
    key: {
      tenantId: 1,
      accountId: 1,
      status: 1,
      "settlement.lastSettledAt": -1,
    },
    options: { name: "idx_tenant_account_status_settled" },
    purpose: "Player completed tickets sortBy=drawDate",
  },
  {
    collection: Mega645Collections.Tickets,
    key: { tenantId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_status_created" },
    purpose: "Báo cáo vé theo tenant",
  },
  {
    collection: Mega645Collections.Tickets,
    key: { "drawPlan.drawIds": 1 },
    options: { name: "idx_drawPlanDrawIds" },
    purpose: "Query tickets theo drawId",
  },

  // ───── mega645TicketEntries ─────
  {
    collection: Mega645Collections.TicketEntries,
    key: { drawId: 1, status: 1 },
    options: { name: "idx_draw_status" },
    purpose: "Settle batch",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: { tenantId: 1, accountId: 1, drawDate: -1 },
    options: { name: "idx_tenant_account_drawDate" },
    purpose: "Lịch sử chơi player",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: { tenantId: 1, drawDate: 1, status: 1 },
    options: { name: "idx_tenant_drawDate_status" },
    purpose: "Báo cáo tenant",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: { ticketId: 1 },
    options: { name: "idx_ticketId" },
    purpose: "Lookup entries theo ticket",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: { ticketId: 1, drawId: 1 },
    options: { unique: true, name: "idx_ticketId_drawId_unique" },
    purpose: "1 ticket chỉ có 1 entry cho 1 draw",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: { tenantId: 1, financialDate: 1, status: 1 },
    options: { name: "idx_tenant_financialDate_status" },
    purpose: "Báo cáo tài chính",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: {
      drawId: 1,
      status: 1,
      "payout.winAmount": 1,
      "payout.payoutTx": 1,
    },
    options: { name: "idx_draw_payoutTx", sparse: true },
    purpose: "Enqueue dispatch payouts: query entries thắng đã sinh payoutTx",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: {
      drawId: 1,
      status: 1,
      "voidInfo.refundTx": 1,
    },
    options: { name: "idx_draw_refundTx", sparse: true },
    purpose: "Enqueue dispatch refunds: paginate voided entries theo refundTx ASC",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: { version: 1 },
    options: { name: "idx_version" },
    purpose: "Feed sync worker",
  },

  // ───── mega645Draws ─────
  {
    collection: Mega645Collections.Draws,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "DrawId unique",
  },
  {
    collection: Mega645Collections.Draws,
    key: { status: 1, drawTime: 1 },
    options: { name: "idx_status_drawTime" },
    purpose: "Scheduler",
  },
  {
    collection: Mega645Collections.Draws,
    key: { status: 1, drawId: 1 },
    options: { name: "idx_status_drawId" },
    purpose:
      "Resettle cascade guard: findPendingResettleBeforeDraw (status ∈ {Published,Settling} + drawId < T) — ESR equality+range, IXSCAN không scan kỳ Settled cũ",
  },
  {
    collection: Mega645Collections.Draws,
    key: { drawDate: 1, drawNo: 1 },
    options: { name: "idx_drawDate_drawNo" },
    purpose: "UI danh sách draws theo ngày",
  },
  {
    collection: Mega645Collections.Draws,
    key: { "vietlottRef.drawPeriod": 1 },
    options: { name: "idx_vietlott_drawPeriod", sparse: true },
    purpose: "Lookup draw theo mã kỳ quay Vietlott",
  },

  // ───── mega645TicketLines ─────
  {
    collection: Mega645Collections.TicketLines,
    key: { entryId: 1, lineIndex: 1 },
    options: { unique: true, name: "idx_entryId_lineIndex_unique" },
    purpose: "Player xem lines + dedup key",
  },
  {
    collection: Mega645Collections.TicketLines,
    key: { drawId: 1, accountId: 1 },
    options: { name: "idx_drawId_accountId" },
    purpose: "Query lines theo kỳ + player",
  },

  // ───── mega645JackpotCycles ─────
  {
    collection: Mega645Collections.JackpotCycles,
    key: { status: 1 },
    options: { name: "idx_status" },
    purpose: "Tìm active cycle",
  },
  {
    collection: Mega645Collections.JackpotCycles,
    key: { cycleNo: 1 },
    options: { unique: true, name: "idx_cycleNo_unique" },
    purpose: "Mã cycle unique",
  },
  {
    collection: Mega645Collections.JackpotCycles,
    key: { status: 1, closedAt: -1 },
    options: { name: "idx_status_closedAt" },
    purpose: "Lịch sử cycles",
  },

  // ───── mega645JackpotCycleEntries (Cycle Ledger) ─────
  {
    collection: Mega645Collections.JackpotCycleEntries,
    key: { cycleNo: 1, seq: 1 },
    options: { unique: true, name: "idx_cycleNo_seq_unique" },
    purpose: "listByCycle, findLatestInCycle, upsertEntry — sort chronological trong cycle",
  },
  {
    collection: Mega645Collections.JackpotCycleEntries,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose:
      "findByDraw lookup theo kỳ; findSettledChainAfterDraw + findClosingJpBeforeDraw — range scan drawId (cascade B2 xuyên cycle, resolve opening theo thời gian)",
  },
];

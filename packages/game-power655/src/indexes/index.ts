/**
 * Power 6/55 – Recommended MongoDB Indexes
 */

import { Power655Collections } from "../entities/enums";

export interface IndexSpec {
  collection: string;
  key: Record<string, 1 | -1>;
  options?: { unique?: boolean; name?: string; sparse?: boolean };
  purpose: string;
}

export const POWER655_INDEXES: readonly IndexSpec[] = [
  // ─── power655GameConfigs ───
  {
    collection: Power655Collections.GameConfigs,
    key: { scope: 1, tenantId: 1 },
    options: { unique: true, name: "idx_scope_tenant_unique" },
    purpose: "1 global + 1 per tenant",
  },

  // ─── power655Tickets ───
  {
    collection: Power655Collections.Tickets,
    key: { accountId: 1, ticketNo: 1 },
    options: { unique: true, name: "idx_account_ticketNo_unique" },
    purpose: "Mã vé unique per account",
  },
  {
    collection: Power655Collections.Tickets,
    key: { tenantId: 1, accountId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_account_status_created" },
    purpose: "Player pending/completed tickets",
  },
  {
    collection: Power655Collections.Tickets,
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
    collection: Power655Collections.Tickets,
    key: { status: 1, "progress.nextDrawId": 1 },
    options: { name: "idx_status_nextDraw", sparse: true },
    purpose: "Tìm tickets cần settle cho draw kế tiếp",
  },
  {
    collection: Power655Collections.Tickets,
    key: { tenantId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_status_created" },
    purpose: "Báo cáo vé theo tenant",
  },
  {
    collection: Power655Collections.Tickets,
    key: { "drawPlan.enrolledDrawIds": 1 },
    options: { name: "idx_enrolledDrawIds" },
    purpose: "Query tickets theo drawId",
  },
  {
    collection: Power655Collections.Tickets,
    key: { "drawPlan.drawIds": 1 },
    options: { name: "idx_drawPlan_drawIds" },
    purpose: "Cursor-based query tickets theo drawId cho SyncTicketSummaries",
  },

  // ─── power655TicketEntries ───
  {
    collection: Power655Collections.TicketEntries,
    key: { drawId: 1, status: 1 },
    options: { name: "idx_draw_status" },
    purpose: "Settle batch",
  },
  {
    collection: Power655Collections.TicketEntries,
    key: { tenantId: 1, accountId: 1, drawDate: -1 },
    options: { name: "idx_tenant_account_drawDate" },
    purpose: "Lịch sử chơi player",
  },
  {
    collection: Power655Collections.TicketEntries,
    key: { tenantId: 1, drawDate: 1, status: 1 },
    options: { name: "idx_tenant_drawDate_status" },
    purpose: "Báo cáo tenant",
  },
  {
    collection: Power655Collections.TicketEntries,
    key: { drawDate: 1, status: 1 },
    options: { name: "idx_drawDate_status" },
    purpose: "Báo cáo megawin",
  },
  {
    collection: Power655Collections.TicketEntries,
    key: { ticketId: 1 },
    options: { name: "idx_ticketId" },
    purpose: "Lookup entries theo ticket",
  },
  {
    collection: Power655Collections.TicketEntries,
    key: { ticketId: 1, drawId: 1 },
    options: { unique: true, name: "idx_ticketId_drawId_unique" },
    purpose: "1 ticket 1 entry per draw",
  },
  {
    collection: Power655Collections.TicketEntries,
    key: { tenantId: 1, financialDate: 1, status: 1 },
    options: { name: "idx_tenant_financialDate_status" },
    purpose: "Báo cáo tài chính",
  },
  {
    collection: Power655Collections.TicketEntries,
    key: { drawId: 1, "payout.winAmount": 1 },
    options: { name: "idx_draw_winAmount", sparse: true },
    purpose: "Query winners",
  },
  {
    collection: Power655Collections.TicketEntries,
    key: {
      drawId: 1,
      status: 1,
      "payout.payoutStatus": 1,
      "payout.winAmount": 1,
    },
    options: { name: "idx_draw_payoutStatus" },
    purpose: "Payout worker",
  },
  {
    collection: Power655Collections.TicketEntries,
    key: { version: 1 },
    options: { name: "idx_version" },
    purpose: "Feed sync",
  },

  // ─── power655Draws ───
  {
    collection: Power655Collections.Draws,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "DrawId unique",
  },
  {
    collection: Power655Collections.Draws,
    key: { status: 1, drawTime: 1 },
    options: { name: "idx_status_drawTime" },
    purpose: "Scheduler",
  },
  {
    collection: Power655Collections.Draws,
    key: { drawDate: 1, drawNo: 1 },
    options: { name: "idx_drawDate_drawNo" },
    purpose: "UI danh sách",
  },
  {
    collection: Power655Collections.Draws,
    key: { "vietlottRef.drawPeriod": 1 },
    options: { name: "idx_vietlott_drawPeriod", sparse: true },
    purpose: "Lookup draw theo Vietlott",
  },

  // ─── power655TicketLines ───
  {
    collection: Power655Collections.TicketLines,
    key: { entryId: 1, lineIndex: 1 },
    options: { unique: true, name: "idx_entryId_lineIndex_unique" },
    purpose: "Dedup key",
  },
  {
    collection: Power655Collections.TicketLines,
    key: { drawId: 1, accountId: 1 },
    options: { name: "idx_drawId_accountId" },
    purpose: "Query lines theo kỳ + player",
  },
  {
    collection: Power655Collections.TicketLines,
    key: { tenantId: 1, ticketId: 1, drawId: 1 },
    options: { name: "idx_tenant_ticket_draw" },
    purpose: "Access control",
  },

  // ─── power655JackpotCycles ───
  {
    collection: Power655Collections.JackpotCycles,
    key: { status: 1 },
    options: { name: "idx_status" },
    purpose: "Active cycle",
  },
  {
    collection: Power655Collections.JackpotCycles,
    key: { cycleNo: 1 },
    options: { unique: true, name: "idx_cycleNo_unique" },
    purpose: "Cycle unique",
  },
  {
    collection: Power655Collections.JackpotCycles,
    key: { status: 1, closedAt: -1 },
    options: { name: "idx_status_closedAt" },
    purpose: "Lịch sử cycles",
  },

  // ─── power655DailyReports ───
  {
    collection: "power655DailyReports",
    key: {
      tenantId: 1,
      financialDate: 1,
      drawId: 1,
      product: 1,
      reportType: 1,
    },
    options: { unique: true, name: "idx_tenant_report_unique" },
    purpose: "Tenant daily report",
  },
  {
    collection: "power655DailyReports",
    key: { financialDate: 1, reportType: 1 },
    options: { name: "idx_financialDate_type" },
    purpose: "Query reports",
  },
];

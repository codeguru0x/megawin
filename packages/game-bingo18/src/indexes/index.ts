/**
 * Bingo 18 – Recommended MongoDB Indexes
 */

import { Bingo18Collections } from "../entities/enums";

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

export const BINGO18_INDEXES: readonly IndexSpec[] = [
  // ─────────────────────────────────────────
  // bingo18_game_configs
  // ─────────────────────────────────────────
  {
    collection: Bingo18Collections.GameConfigs,
    key: { scope: 1, tenantId: 1 },
    options: { unique: true, name: "idx_scope_tenant_unique" },
    purpose: "Đảm bảo 1 global config + 1 config per tenant",
  },

  // ─────────────────────────────────────────
  // bingo18_tickets
  // ─────────────────────────────────────────
  {
    collection: Bingo18Collections.Tickets,
    key: { accountId: 1, ticketNo: 1 },
    options: { unique: true, name: "idx_account_ticketNo_unique" },
    purpose: "Mã vé unique per account",
  },
  {
    collection: Bingo18Collections.Tickets,
    key: { tenantId: 1, accountId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_account_status_created" },
    purpose: "Player pending/completed tickets",
  },
  {
    collection: Bingo18Collections.Tickets,
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
    collection: Bingo18Collections.Tickets,
    key: { "drawPlan.drawIds": 1 },
    options: { name: "idx_drawPlan_drawIds" },
    purpose: "Query tickets by drawId trong drawPlan",
  },
  {
    collection: Bingo18Collections.Tickets,
    key: { tenantId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_status_created" },
    purpose: "Báo cáo vé theo tenant",
  },

  // ─────────────────────────────────────────
  // bingo18_ticket_entries
  // ─────────────────────────────────────────
  {
    collection: Bingo18Collections.TicketEntries,
    key: { ticketId: 1, drawId: 1 },
    options: { unique: true, name: "idx_ticket_draw_unique" },
    purpose: "Idempotent: 1 entry per ticket per draw",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: { drawId: 1, status: 1 },
    options: { name: "idx_draw_status" },
    purpose: "Settle batch: lấy tất cả entries cho 1 draw",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: {
      drawId: 1,
      status: 1,
      "payout.winAmount": 1,
      "payout.payoutTx": 1,
    },
    options: { name: "idx_draw_payoutTx", sparse: true },
    purpose: "Enqueue dispatch payouts: paginate winners theo payoutTx ASC",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: {
      drawId: 1,
      status: 1,
      "voidInfo.refundTx": 1,
    },
    options: { name: "idx_draw_refundTx", sparse: true },
    purpose: "Enqueue dispatch refunds: paginate voided entries theo refundTx ASC",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: { tenantId: 1, accountId: 1, drawDate: -1 },
    options: { name: "idx_tenant_account_drawDate" },
    purpose: "Lịch sử chơi: player xem entries gần đây",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: { tenantId: 1, drawDate: 1, status: 1 },
    options: { name: "idx_tenant_drawDate_status" },
    purpose: "Báo cáo tenant: doanh thu theo ngày",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: { drawDate: 1, status: 1 },
    options: { name: "idx_drawDate_status" },
    purpose: "Báo cáo megawin: doanh thu toàn hệ thống theo ngày",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: { ticketId: 1 },
    options: { name: "idx_ticketId" },
    purpose: "Lookup entries theo ticket",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: { version: 1 },
    options: { name: "idx_version" },
    purpose: "Feed sync worker: scan entries thay đổi",
  },

  // ─────────────────────────────────────────
  // bingo18_draws
  // ─────────────────────────────────────────
  {
    collection: Bingo18Collections.Draws,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "DrawId unique",
  },
  {
    collection: Bingo18Collections.Draws,
    key: { status: 1, drawTime: 1 },
    options: { name: "idx_status_drawTime" },
    purpose: "Scheduler: tìm draws sắp quay",
  },
  {
    collection: Bingo18Collections.Draws,
    key: { drawDate: 1, drawNo: 1 },
    options: { name: "idx_drawDate_drawNo" },
    purpose: "UI: hiển thị danh sách draws theo ngày",
  },
  {
    collection: Bingo18Collections.Draws,
    key: { drawDate: -1, drawNo: -1 },
    options: { name: "idx_drawDate_drawNo_desc" },
    purpose: "getLatestDraw: O(1) lookup kỳ mới nhất",
  },
  {
    collection: Bingo18Collections.Draws,
    key: { "vietlottRef.drawPeriod": 1 },
    options: { name: "idx_vietlott_drawPeriod", sparse: true },
    purpose: "Lookup draw theo mã kỳ quay Vietlott",
  },

  // ─────────────────────────────────────────
  // bingo18_draw_counters
  // ─────────────────────────────────────────
  {
    collection: Bingo18Collections.DrawCounters,
    key: { drawDate: 1 },
    options: { unique: true, name: "idx_drawDate_unique" },
    purpose: "Atomic counter: 1 document per ngày",
  },
];

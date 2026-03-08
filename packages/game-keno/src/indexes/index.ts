/**
 * Keno – Recommended MongoDB Indexes
 */

import { KenoCollections } from "../entities/enums";

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

export const KENO_INDEXES: readonly IndexSpec[] = [
  // ─────────────────────────────────────────
  // kenoGameConfigs
  // ─────────────────────────────────────────
  {
    collection: KenoCollections.GameConfigs,
    key: { scope: 1, tenantId: 1 },
    options: { unique: true, name: "idx_scope_tenant_unique" },
    purpose: "Đảm bảo 1 global config + 1 config per tenant",
  },

  // ─────────────────────────────────────────
  // kenoTickets
  // ─────────────────────────────────────────
  {
    collection: KenoCollections.Tickets,
    key: { accountId: 1, ticketNo: 1 },
    options: { unique: true, name: "idx_account_ticketNo_unique" },
    purpose: "Mã vé unique per account (counter per player per day)",
  },
  {
    collection: KenoCollections.Tickets,
    key: { tenantId: 1, accountId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_account_status_created" },
    purpose: "Player pending/completed tickets: filter tenant+account+status, cursor by _id",
  },
  {
    collection: KenoCollections.Tickets,
    key: {
      tenantId: 1,
      accountId: 1,
      status: 1,
      "settlement.lastSettledAt": -1,
    },
    options: { name: "idx_tenant_account_status_settled" },
    purpose: "Player completed tickets sortBy=drawDate: filter by settlement date range",
  },
  {
    collection: KenoCollections.Tickets,
    key: { "drawPlan.drawIds": 1 },
    options: { name: "idx_drawPlan_drawIds" },
    purpose: "Query tickets by drawId trong drawPlan",
  },
  {
    collection: KenoCollections.Tickets,
    key: { tenantId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_status_created" },
    purpose: "Báo cáo vé theo tenant",
  },

  // ─────────────────────────────────────────
  // kenoTicketEntries
  // ─────────────────────────────────────────
  {
    collection: KenoCollections.TicketEntries,
    key: { ticketId: 1, drawId: 1 },
    options: { unique: true, name: "idx_ticket_draw_unique" },
    purpose: "Idempotent: 1 entry per ticket per draw",
  },
  {
    collection: KenoCollections.TicketEntries,
    key: { drawId: 1, status: 1 },
    options: { name: "idx_draw_status" },
    purpose: "Settle batch: lấy tất cả entries cho 1 draw",
  },
  {
    collection: KenoCollections.TicketEntries,
    key: { tenantId: 1, accountId: 1, drawDate: -1 },
    options: { name: "idx_tenant_account_drawDate" },
    purpose: "Lịch sử chơi: player xem entries gần đây",
  },
  {
    collection: KenoCollections.TicketEntries,
    key: { tenantId: 1, drawDate: 1, status: 1 },
    options: { name: "idx_tenant_drawDate_status" },
    purpose: "Báo cáo tenant: doanh thu theo ngày",
  },
  {
    collection: KenoCollections.TicketEntries,
    key: { drawDate: 1, status: 1 },
    options: { name: "idx_drawDate_status" },
    purpose: "Báo cáo megawin: doanh thu toàn hệ thống theo ngày",
  },
  {
    collection: KenoCollections.TicketEntries,
    key: { ticketId: 1 },
    options: { name: "idx_ticketId" },
    purpose: "Lookup entries theo ticket",
  },
  {
    collection: KenoCollections.TicketEntries,
    key: { version: 1 },
    options: { name: "idx_version" },
    purpose: "Feed sync worker: scan entries thay đổi kể từ version cuối cùng đã sync",
  },

  // ─────────────────────────────────────────
  // kenoDraws
  // ─────────────────────────────────────────
  {
    collection: KenoCollections.Draws,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "DrawId unique – join key với entries",
  },
  {
    collection: KenoCollections.Draws,
    key: { status: 1, drawTime: 1 },
    options: { name: "idx_status_drawTime" },
    purpose: "Scheduler: tìm draws sắp quay / cần chuyển trạng thái",
  },
  {
    collection: KenoCollections.Draws,
    key: { status: 1, drawId: -1 },
    options: { name: "idx_status_drawId_desc" },
    purpose:
      "Player draw results: filter settled draws + cursor pagination theo drawId (upper bound từ ngày)",
  },
  {
    collection: KenoCollections.Draws,
    key: { drawDate: 1, drawNo: 1 },
    options: { name: "idx_drawDate_drawNo" },
    purpose: "UI: hiển thị danh sách draws theo ngày",
  },
  {
    collection: KenoCollections.Draws,
    key: { drawDate: -1, drawNo: -1 },
    options: { name: "idx_drawDate_drawNo_desc" },
    purpose: "getLatestDraw: O(1) lookup kỳ mới nhất (đọc entry đầu tiên index B-tree)",
  },
  {
    collection: KenoCollections.Draws,
    key: { "vietlottRef.drawPeriod": 1 },
    options: { name: "idx_vietlott_drawPeriod", sparse: true },
    purpose: "Lookup draw theo mã kỳ quay Vietlott",
  },

  // ─────────────────────────────────────────
  // kenoDrawCounters
  // ─────────────────────────────────────────
  {
    collection: KenoCollections.DrawCounters,
    key: { drawDate: 1 },
    options: { unique: true, name: "idx_drawDate_unique" },
    purpose: "Atomic counter: 1 document per ngày, $inc drawNo race-safe",
  },
];

/**
 * Keno – Recommended MongoDB Indexes
 */

import { KenoCollections } from "../entities/keno.enums";

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
    key: { ticketNo: 1 },
    options: { unique: true, name: "idx_ticketNo_unique" },
    purpose: "Mã vé unique toàn hệ thống",
  },
  {
    collection: KenoCollections.Tickets,
    key: { tenantId: 1, playerId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_player_status_created" },
    purpose: "Query vé theo tenant + player",
  },
  {
    collection: KenoCollections.Tickets,
    key: { status: 1, "progress.nextDrawId": 1 },
    options: { name: "idx_status_nextDraw", sparse: true },
    purpose: "Tìm tickets cần settle cho draw kế tiếp",
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
    key: { drawId: 1, status: 1 },
    options: { name: "idx_draw_status" },
    purpose: "Settle batch: lấy tất cả entries cho 1 draw",
  },
  {
    collection: KenoCollections.TicketEntries,
    key: { tenantId: 1, playerId: 1, drawDate: -1 },
    options: { name: "idx_tenant_player_drawDate" },
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
    key: { drawDate: 1, drawNo: 1 },
    options: { name: "idx_drawDate_drawNo" },
    purpose: "UI: hiển thị danh sách draws theo ngày",
  },
  {
    collection: KenoCollections.Draws,
    key: { "vietlottRef.drawPeriod": 1 },
    options: { name: "idx_vietlott_drawPeriod", sparse: true },
    purpose: "Lookup draw theo mã kỳ quay Vietlott",
  },
];

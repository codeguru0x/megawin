/**
 * Keno – Recommended MongoDB Indexes
 *
 * Danh sách indexes khuyến nghị cho tất cả collections Keno.
 * Dùng bởi migration script / Atlas Index Management để tạo indexes.
 *
 * Cách dùng:
 * ```ts
 * import { KENO_INDEXES } from "@megawin/game-keno/indexes";
 * for (const idx of KENO_INDEXES) {
 *   await db.collection(idx.collection).createIndex(idx.key, idx.options);
 * }
 * ```
 *
 * LƯU Ý: Chạy trong môi trường maintenance hoặc background — tránh block production.
 */

import { KenoCollections } from "../entities/enums";

/** Mô tả 1 index MongoDB cần tạo cho Keno collections. */
export interface IndexSpec {
  /** Tên collection (từ `KenoCollections`). */
  collection: string;
  /** Khai báo index key: field → 1 (ascending) hoặc -1 (descending). */
  key: Record<string, 1 | -1>;
  /** Tùy chọn MongoDB createIndex. */
  options?: {
    /** True nếu index phải unique. */
    unique?: boolean;
    /** Tên index — dùng để identify khi drop/update. */
    name?: string;
    /** True nếu chỉ index các document có field đó (tiết kiệm storage cho optional fields). */
    sparse?: boolean;
  };
  /** Mô tả mục đích index này phục vụ query nào. Dùng để review và audit. */
  purpose: string;
}

/**
 * Tất cả indexes khuyến nghị cho Keno.
 *
 * Bao gồm 5 collections:
 * - keno_game_configs: unique scope+tenant
 * - keno_tickets: player queries, drawPlan lookup
 * - keno_ticket_entries: settle batch, feed sync, history
 * - keno_draws: scheduler, player results, UI
 * - keno_draw_counters: atomic daily counter
 */
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

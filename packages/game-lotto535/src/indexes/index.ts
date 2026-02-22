/**
 * Lotto 5/35 – Recommended MongoDB Indexes
 *
 * Gợi ý indexes cho các collections game Lotto 5/35.
 * Chạy script này 1 lần khi setup DB hoặc tích hợp vào migration.
 *
 * Pattern cho mọi game:
 *   - Ticket: query theo tenant + player, unique ticketNo, settle progress
 *   - Entry: settle theo draw, report theo tenant + date
 *   - Draw: unique drawId, schedule, vietlott ref lookup
 *   - Line: query theo ticket (optional collection)
 *   - GameConfig: unique scope + tenant
 *
 * Sử dụng:
 * ```ts
 * import { LOTTO535_INDEXES } from "@megawin/game-lotto535/indexes";
 * // Apply indexes via MongoRepository hoặc migration script
 * ```
 */

import { Lotto535Collections } from "../entities/lotto535.enums";

/** Mô tả 1 index cần tạo. */
export interface IndexSpec {
  /** Tên collection. */
  collection: string;
  /** Index key. */
  key: Record<string, 1 | -1>;
  /** Index options. */
  options?: {
    unique?: boolean;
    name?: string;
    sparse?: boolean;
  };
  /** Ghi chú mục đích index. */
  purpose: string;
}

export const LOTTO535_INDEXES: readonly IndexSpec[] = [
  // ─────────────────────────────────────────
  // lotto535GameConfigs
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.GameConfigs,
    key: { scope: 1, tenantId: 1 },
    options: { unique: true, name: "idx_scope_tenant_unique" },
    purpose: "Đảm bảo 1 global config + 1 config per tenant",
  },

  // ─────────────────────────────────────────
  // lotto535Tickets
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.Tickets,
    key: { ticketNo: 1 },
    options: { unique: true, name: "idx_ticketNo_unique" },
    purpose: "Mã vé unique toàn hệ thống",
  },
  {
    collection: Lotto535Collections.Tickets,
    key: { tenantId: 1, playerId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_player_status_created" },
    purpose: "Query vé theo tenant + player (lịch sử mua, dashboard player)",
  },
  {
    collection: Lotto535Collections.Tickets,
    key: { status: 1, "progress.nextDrawId": 1 },
    options: { name: "idx_status_nextDraw", sparse: true },
    purpose: "Tìm tickets cần settle cho draw kế tiếp",
  },
  {
    collection: Lotto535Collections.Tickets,
    key: { tenantId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_status_created" },
    purpose: "Báo cáo vé theo tenant",
  },

  // ─────────────────────────────────────────
  // lotto535TicketEntries
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.TicketEntries,
    key: { drawId: 1, status: 1 },
    options: { name: "idx_draw_status" },
    purpose: "Settle batch: lấy tất cả entries cho 1 draw",
  },
  {
    collection: Lotto535Collections.TicketEntries,
    key: { tenantId: 1, playerId: 1, drawDate: -1 },
    options: { name: "idx_tenant_player_drawDate" },
    purpose: "Lịch sử chơi: player xem entries gần đây",
  },
  {
    collection: Lotto535Collections.TicketEntries,
    key: { tenantId: 1, drawDate: 1, status: 1 },
    options: { name: "idx_tenant_drawDate_status" },
    purpose: "Báo cáo tenant backoffice: doanh thu theo ngày",
  },
  {
    collection: Lotto535Collections.TicketEntries,
    key: { drawDate: 1, status: 1 },
    options: { name: "idx_drawDate_status" },
    purpose: "Báo cáo megawin backoffice: doanh thu toàn hệ thống theo ngày",
  },
  {
    collection: Lotto535Collections.TicketEntries,
    key: { ticketId: 1 },
    options: { name: "idx_ticketId" },
    purpose: "Lookup entries theo ticket (xem chi tiết vé)",
  },

  // ─────────────────────────────────────────
  // lotto535Draws
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.Draws,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "DrawId unique – join key với entries",
  },
  {
    collection: Lotto535Collections.Draws,
    key: { status: 1, drawTime: 1 },
    options: { name: "idx_status_drawTime" },
    purpose: "Scheduler: tìm draws sắp quay / cần chuyển trạng thái",
  },
  {
    collection: Lotto535Collections.Draws,
    key: { drawDate: 1, drawNo: 1 },
    options: { name: "idx_drawDate_drawNo" },
    purpose: "UI: hiển thị danh sách draws theo ngày",
  },
  {
    collection: Lotto535Collections.Draws,
    key: { "vietlottRef.drawPeriod": 1 },
    options: { name: "idx_vietlott_drawPeriod", sparse: true },
    purpose: "Lookup draw theo mã kỳ quay Vietlott",
  },

  // ─────────────────────────────────────────
  // lotto535TicketLines (optional collection)
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.TicketLines,
    key: { ticketId: 1, lineIndex: 1 },
    options: { name: "idx_ticket_lineIndex" },
    purpose: "Paginate lines theo ticket + thứ tự ổn định",
  },
  {
    collection: Lotto535Collections.TicketLines,
    key: { tenantId: 1, ticketId: 1 },
    options: { name: "idx_tenant_ticket" },
    purpose: "Access control: chỉ tenant sở hữu mới xem được lines",
  },
];

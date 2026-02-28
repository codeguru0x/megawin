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

import { Lotto535Collections } from "../entities/enums";

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
    key: { accountId: 1, ticketNo: 1 },
    options: { unique: true, name: "idx_account_ticketNo_unique" },
    purpose: "Mã vé unique per account (counter per player per day)",
  },
  {
    collection: Lotto535Collections.Tickets,
    key: { tenantId: 1, accountId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_account_status_created" },
    purpose:
      "Player pending/completed tickets: filter tenant+account+status, cursor by _id",
  },
  {
    collection: Lotto535Collections.Tickets,
    key: {
      tenantId: 1,
      accountId: 1,
      status: 1,
      "settlement.lastSettledAt": -1,
    },
    options: { name: "idx_tenant_account_status_settled" },
    purpose:
      "Player completed tickets sortBy=drawDate: filter by settlement date range",
  },
  {
    collection: Lotto535Collections.Tickets,
    key: { status: 1, "progress.nextDrawId": 1 },
    options: { name: "idx_status_nextDraw", sparse: true },
    purpose: "Tìm tickets cần settle cho draw kế tiếp",
  },
  {
    collection: Lotto535Collections.Tickets,
    key: {
      status: 1,
      "drawPlan.fullyEnrolled": 1,
      "drawPlan.remainingDraws": 1,
    },
    options: { name: "idx_auto_enroll" },
    purpose: "Auto-enroll worker: tìm tickets multi-draw cần nhập entry kỳ mới",
  },
  {
    collection: Lotto535Collections.Tickets,
    key: { tenantId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_status_created" },
    purpose: "Báo cáo vé theo tenant",
  },
  {
    collection: Lotto535Collections.Tickets,
    key: { "drawPlan.enrolledDrawIds": 1 },
    options: { name: "idx_enrolledDrawIds" },
    purpose: "Query tickets theo drawId (thay thế drawPlan.drawIds)",
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
    key: { tenantId: 1, accountId: 1, drawDate: -1 },
    options: { name: "idx_tenant_account_drawDate" },
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
  {
    collection: Lotto535Collections.TicketEntries,
    key: { ticketId: 1, drawId: 1 },
    options: { unique: true, name: "idx_ticketId_drawId_unique" },
    purpose:
      "Unique guard: 1 ticket chỉ có 1 entry cho 1 draw (idempotent auto-enroll)",
  },
  {
    collection: Lotto535Collections.TicketEntries,
    key: { tenantId: 1, financialDate: 1, status: 1 },
    options: { name: "idx_tenant_financialDate_status" },
    purpose: "Báo cáo tài chính theo ngày tài chính (settle report)",
  },
  {
    collection: Lotto535Collections.TicketEntries,
    key: { drawId: 1, "payout.winAmount": 1 },
    options: { name: "idx_draw_winAmount", sparse: true },
    purpose: "Query winners cho dispatch-payouts: entries có winAmount > 0",
  },
  {
    collection: Lotto535Collections.TicketEntries,
    key: {
      drawId: 1,
      status: 1,
      "payout.payoutStatus": 1,
      "payout.winAmount": 1,
    },
    options: { name: "idx_draw_payoutStatus" },
    purpose:
      "Payout worker: query entries chưa dispatch (pending/failed) cho 1 draw",
  },
  {
    collection: Lotto535Collections.TicketEntries,
    key: { version: 1 },
    options: { name: "idx_version" },
    purpose:
      "Feed sync worker: scan entries thay đổi kể từ version cuối cùng đã sync",
  },

  // ─────────────────────────────────────────
  // lotto535DailyReports
  // ─────────────────────────────────────────
  {
    collection: "lotto535DailyReports",
    key: {
      tenantId: 1,
      financialDate: 1,
      drawId: 1,
      product: 1,
      reportType: 1,
    },
    options: { unique: true, name: "idx_tenant_report_unique" },
    purpose: "Unique key cho tenant daily report (upsert-safe)",
  },
  {
    collection: "lotto535DailyReports",
    key: {
      tenantId: 1,
      playerId: 1,
      financialDate: 1,
      drawId: 1,
      product: 1,
      reportType: 1,
    },
    options: { unique: true, name: "idx_player_report_unique" },
    purpose: "Unique key cho player daily report (upsert-safe)",
  },
  {
    collection: "lotto535DailyReports",
    key: { financialDate: 1, reportType: 1 },
    options: { name: "idx_financialDate_type" },
    purpose: "Query reports theo ngày tài chính cho backoffice megawin",
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
  // lotto535TicketLines (per-entry, tạo khi settle)
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.TicketLines,
    key: { entryId: 1, lineIndex: 1 },
    options: { unique: true, name: "idx_entryId_lineIndex_unique" },
    purpose:
      "Player xem lines của 1 entry + dedup key cho idempotent upsert khi retry",
  },
  {
    collection: Lotto535Collections.TicketLines,
    key: { drawId: 1, accountId: 1 },
    options: { name: "idx_drawId_accountId" },
    purpose: "Query lines theo kỳ + player",
  },
  {
    collection: Lotto535Collections.TicketLines,
    key: { tenantId: 1, ticketId: 1, drawId: 1 },
    options: { name: "idx_tenant_ticket_draw" },
    purpose: "Access control + audit: tenant xem lines theo ticket + kỳ",
  },

  // ─────────────────────────────────────────
  // lotto535JackpotCycles
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.JackpotCycles,
    key: { status: 1 },
    options: { name: "idx_status" },
    purpose: "Tìm nhanh active cycle (chỉ có 1 tại 1 thời điểm)",
  },
  {
    collection: Lotto535Collections.JackpotCycles,
    key: { cycleNo: 1 },
    options: { unique: true, name: "idx_cycleNo_unique" },
    purpose: "Mã cycle unique, auto-increment",
  },
  {
    collection: Lotto535Collections.JackpotCycles,
    key: { status: 1, closedAt: -1 },
    options: { name: "idx_status_closedAt" },
    purpose: "Lịch sử cycles đã đóng, mới nhất trước",
  },
];

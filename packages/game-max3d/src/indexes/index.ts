/**
 * Max 3D – Recommended MongoDB Indexes
 */

import { Max3dCollections } from "../entities/enums";

export interface IndexSpec {
  collection: string;
  key: Record<string, 1 | -1>;
  options?: {
    unique?: boolean;
    name?: string;
    sparse?: boolean;
    /**
     * TTL (giây) — Mongo tự xoá document sau khi field trong `key` (PHẢI là 1 field
     * Date, ascending, đứng riêng — không gộp compound) quá hạn. Dùng cho retention
     * (xem `mongodb.mdc` §7) thay cho cleanup batch tự viết trong worker.
     */
    expireAfterSeconds?: number;
  };
  purpose: string;
}

export const MAX3D_INDEXES: readonly IndexSpec[] = [
  // max3dGameConfigs
  {
    collection: Max3dCollections.GameConfigs,
    key: { scope: 1, tenantId: 1 },
    options: { unique: true, name: "idx_scope_tenant_unique" },
    purpose: "Đảm bảo 1 global config + 1 config per tenant",
  },

  // max3dTickets
  {
    collection: Max3dCollections.Tickets,
    key: { accountId: 1, ticketNo: 1 },
    options: { unique: true, name: "idx_account_ticketNo_unique" },
    purpose: "Mã vé unique per account",
  },
  {
    collection: Max3dCollections.Tickets,
    key: { tenantId: 1, accountId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_account_status_created" },
    purpose: "Player pending/completed tickets",
  },
  {
    collection: Max3dCollections.Tickets,
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
    collection: Max3dCollections.Tickets,
    key: { status: 1, "progress.nextDrawId": 1 },
    options: { name: "idx_status_nextDraw", sparse: true },
    purpose: "Tìm tickets cần settle cho draw kế tiếp",
  },
  {
    collection: Max3dCollections.Tickets,
    key: { tenantId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_status_created" },
    purpose: "Báo cáo vé theo tenant",
  },
  {
    collection: Max3dCollections.Tickets,
    key: { "drawPlan.drawIds": 1 },
    options: { name: "idx_drawPlanDrawIds" },
    purpose: "Query tickets theo drawId",
  },

  // max3dTicketEntries
  {
    collection: Max3dCollections.TicketEntries,
    key: { drawId: 1, status: 1 },
    options: { name: "idx_draw_status" },
    purpose: "Settle batch: lấy tất cả entries cho 1 draw",
  },
  {
    collection: Max3dCollections.TicketEntries,
    key: { drawId: 1, _id: 1 },
    options: { name: "idx_draw_id" },
    purpose:
      "Ops stats insert-stream: đọc entries mới 1 draw theo watermark _id (drawId equality + _id range, index-only cursor).",
  },
  {
    collection: Max3dCollections.TicketEntries,
    key: { tenantId: 1, accountId: 1, financialDate: -1 },
    options: { name: "idx_tenant_account_financialDate" },
    purpose: "Lịch sử chơi: player xem entries gần đây",
  },
  // idx_tenant_drawDate_status ĐÃ XOÁ (30/07/2026): entry KHÔNG có field drawDate —
  // bản sửa key trùng 100% với idx_tenant_financialDate_status sẵn có bên dưới.
  {
    collection: Max3dCollections.TicketEntries,
    key: { financialDate: 1, status: 1 },
    options: { name: "idx_financialDate_status" },
    purpose: "Báo cáo megawin backoffice",
  },
  {
    collection: Max3dCollections.TicketEntries,
    key: { ticketId: 1 },
    options: { name: "idx_ticketId" },
    purpose: "Lookup entries theo ticket",
  },
  {
    collection: Max3dCollections.TicketEntries,
    key: { ticketId: 1, drawId: 1 },
    options: { unique: true, name: "idx_ticketId_drawId_unique" },
    purpose: "Unique guard: 1 ticket chỉ có 1 entry cho 1 draw",
  },
  {
    collection: Max3dCollections.TicketEntries,
    key: { tenantId: 1, financialDate: 1, status: 1 },
    options: { name: "idx_tenant_financialDate_status" },
    purpose: "Báo cáo tài chính theo ngày tài chính",
  },
  {
    collection: Max3dCollections.TicketEntries,
    key: { drawId: 1, "payout.winAmount": 1 },
    options: { name: "idx_draw_winAmount", sparse: true },
    purpose: "Query winners cho enqueue-dispatch-payouts",
  },
  {
    collection: Max3dCollections.TicketEntries,
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
    collection: Max3dCollections.TicketEntries,
    key: {
      drawId: 1,
      status: 1,
      "voidInfo.refundTx": 1,
    },
    options: { name: "idx_draw_refundTx", sparse: true },
    purpose: "Enqueue dispatch refunds: paginate voided entries theo refundTx ASC",
  },
  {
    collection: Max3dCollections.TicketEntries,
    key: { version: 1 },
    options: { name: "idx_version" },
    purpose: "Feed sync worker: scan entries thay đổi",
  },

  // max3dDraws
  {
    collection: Max3dCollections.Draws,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "DrawId unique",
  },
  {
    collection: Max3dCollections.Draws,
    key: { status: 1, drawTime: 1 },
    options: { name: "idx_status_drawTime" },
    purpose: "Scheduler: tìm draws sắp quay",
  },
  {
    collection: Max3dCollections.Draws,
    key: { status: 1, drawId: -1 },
    options: { name: "idx_status_drawId_desc" },
    purpose:
      "Settle order guard: findUnfinishedDrawBefore (status ∈ 6 trạng thái chưa hoàn thành + drawId < T) — ESR equality+range, IXSCAN không scan kỳ Settled/Void cũ. Đồng thời phục vụ getUnfinishedDraws (kỳ active dashboard).",
  },
  {
    collection: Max3dCollections.Draws,
    key: { drawDate: 1, drawNo: 1 },
    options: { name: "idx_drawDate_drawNo" },
    purpose: "UI: hiển thị danh sách draws theo ngày",
  },
  {
    collection: Max3dCollections.Draws,
    key: { "vietlottRef.drawPeriod": 1 },
    options: { name: "idx_vietlott_drawPeriod", sparse: true },
    purpose: "Lookup draw theo mã kỳ quay Vietlott",
  },

  // max3dTicketLines
  {
    collection: Max3dCollections.TicketLines,
    key: { entryId: 1, lineIndex: 1 },
    options: { unique: true, name: "idx_entryId_lineIndex_unique" },
    purpose: "Player xem lines + dedup key",
  },
  {
    collection: Max3dCollections.TicketLines,
    key: { drawId: 1, accountId: 1 },
    options: { name: "idx_drawId_accountId" },
    purpose: "Query lines theo kỳ + player",
  },
  {
    collection: Max3dCollections.TicketLines,
    key: { tenantId: 1, ticketId: 1, drawId: 1 },
    options: { name: "idx_tenant_ticket_draw" },
    purpose: "Access control + audit",
  },

  // max3d_draw_betting_stats
  {
    collection: Max3dCollections.BettingStats,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "Ops dashboard: findOne pre-aggregated stats theo drawId (1 doc/draw, O(1))",
  },
  {
    collection: Max3dCollections.BettingStats,
    key: { final: 1 },
    options: { name: "idx_final" },
    purpose:
      "Worker stats-sync: hàng đợi việc `findNotFinal({final:false})` — nguồn điều phối DUY NHẤT " +
      "thay cho getUnfinishedDraws(status). Bền với mọi tốc độ chuyển status draw. Selectivity thấp " +
      "(2 giá trị) nhưng số doc `final:false` luôn nhỏ (kỳ đang mở + vừa đóng). Thiếu index này ⇒ " +
      "COLLSCAN mỗi tick worker CHÍNH (p0-01).",
  },
  {
    collection: Max3dCollections.BettingStats,
    key: { updatedAt: 1 },
    options: { name: "idx_updatedAt" },
    purpose:
      "Worker ops-alerts: findChangedSince({updatedAt:{$gt:cursor}}) sort asc — hàng đợi đánh " +
      "giá alert theo doc ĐÃ ĐỔI. Doc final không update lại → phần index 'nóng' luôn nhỏ. " +
      "Thiếu index này ⇒ COLLSCAN mỗi tick (p0-02 rủi ro #1).",
  },

  // max3d_ops_alerts
  {
    collection: Max3dCollections.OpsAlerts,
    key: { status: 1, createdAt: -1 },
    options: { name: "idx_status_createdAt" },
    purpose: "List/count alert theo status (badge snapshot index-only count)",
  },
  {
    collection: Max3dCollections.OpsAlerts,
    key: { drawId: 1, dedupeKey: 1 },
    options: { unique: true, name: "idx_drawId_dedupeKey_unique" },
    purpose: "Chống bắn trùng: 1 alert/(draw × dedupeKey), evaluator upsert idempotent",
  },

  // max3d_draw_pair_stats (p0-03)
  {
    collection: Max3dCollections.PairStats,
    key: { drawId: 1, pairKey: 1 },
    options: { unique: true, name: "idx_drawId_pairKey_unique" },
    purpose: "Upsert delta per-cặp idempotent + lookup theo pairKey",
  },
  {
    collection: Max3dCollections.PairStats,
    key: { drawId: 1, units: -1 },
    options: { name: "idx_drawId_units" },
    purpose: "Derive topPairs: sort({units:-1}).limit(K) — IXSCAN dừng đúng K",
  },
  {
    collection: Max3dCollections.PairStats,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "Retention 90 ngày — TTL tự xoá, không cleanup batch trong app",
  },

  // max3d_draw_account_stats (p0-03)
  {
    collection: Max3dCollections.AccountStats,
    key: { drawId: 1, accountId: 1 },
    options: { unique: true, name: "idx_drawId_accountId_unique" },
    purpose: "Upsert delta per-account idempotent + drill-down outstanding từ alert",
  },
  {
    collection: Max3dCollections.AccountStats,
    key: { drawId: 1, amount: -1 },
    options: { name: "idx_drawId_amount" },
    purpose: "Derive topAccounts: sort({amount:-1}).limit(K) — IXSCAN dừng đúng K",
  },
  {
    collection: Max3dCollections.AccountStats,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "Retention 90 ngày — TTL tự xoá, không cleanup batch trong app",
  },

  // max3d_draw_pair_accounts (p0-03)
  {
    collection: Max3dCollections.PairAccounts,
    key: { drawId: 1, pairKey: 1, accountId: 1 },
    options: { unique: true, name: "idx_drawId_pairKey_accountId_unique" },
    purpose: "Upsert idempotent + $group đếm distinct account cho countAccountsByPair",
  },
  {
    collection: Max3dCollections.PairAccounts,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "Retention 90 ngày — TTL tự xoá, không cleanup batch trong app",
  },
];

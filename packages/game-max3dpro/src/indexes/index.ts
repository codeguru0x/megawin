/**
 * Max 3D Pro – Recommended MongoDB Indexes
 */

import { Max3dproCollections } from "../entities/enums";

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

export const MAX3D_PRO_INDEXES: readonly IndexSpec[] = [
  {
    collection: Max3dproCollections.GameConfigs,
    key: { scope: 1, tenantId: 1 },
    options: { unique: true, name: "idx_scope_tenant_unique" },
    purpose: "Đảm bảo 1 global config + 1 config per tenant",
  },
  {
    collection: Max3dproCollections.Tickets,
    key: { accountId: 1, ticketNo: 1 },
    options: { unique: true, name: "idx_account_ticketNo_unique" },
    purpose: "Mã vé unique per account",
  },
  {
    collection: Max3dproCollections.Tickets,
    key: { tenantId: 1, accountId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_account_status_created" },
    purpose: "Player pending/completed tickets",
  },
  {
    collection: Max3dproCollections.Tickets,
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
    collection: Max3dproCollections.Tickets,
    key: { status: 1, "progress.nextDrawId": 1 },
    options: { name: "idx_status_nextDraw", sparse: true },
    purpose: "Tìm tickets cần settle cho draw kế tiếp",
  },
  {
    collection: Max3dproCollections.Tickets,
    key: { tenantId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_status_created" },
    purpose: "Báo cáo vé theo tenant",
  },
  {
    collection: Max3dproCollections.Tickets,
    key: { "drawPlan.drawIds": 1 },
    options: { name: "idx_drawPlanDrawIds" },
    purpose: "Query tickets theo drawId",
  },
  {
    collection: Max3dproCollections.TicketEntries,
    key: { drawId: 1, status: 1 },
    options: { name: "idx_draw_status" },
    purpose: "Settle batch: lấy tất cả entries cho 1 draw",
  },
  {
    collection: Max3dproCollections.TicketEntries,
    key: { drawId: 1, _id: 1 },
    options: { name: "idx_draw_id" },
    purpose:
      "Ops stats insert-stream: đọc entries mới 1 draw theo watermark _id (drawId equality + _id range, index-only cursor). Cũng phục vụ recompute full lúc salesClosed.",
  },
  {
    collection: Max3dproCollections.TicketEntries,
    key: { tenantId: 1, accountId: 1, financialDate: -1 },
    options: { name: "idx_tenant_account_financialDate" },
    purpose: "Lịch sử chơi: player xem entries gần đây",
  },
  // idx_tenant_drawDate_status ĐÃ XOÁ (30/07/2026): entry KHÔNG có field drawDate —
  // bản sửa key trùng 100% với idx_tenant_financialDate_status sẵn có bên dưới.
  {
    collection: Max3dproCollections.TicketEntries,
    key: { financialDate: 1, status: 1 },
    options: { name: "idx_financialDate_status" },
    purpose: "Báo cáo megawin backoffice",
  },
  {
    collection: Max3dproCollections.TicketEntries,
    key: { ticketId: 1 },
    options: { name: "idx_ticketId" },
    purpose: "Lookup entries theo ticket",
  },
  {
    collection: Max3dproCollections.TicketEntries,
    key: { ticketId: 1, drawId: 1 },
    options: { unique: true, name: "idx_ticketId_drawId_unique" },
    purpose: "Unique guard: 1 ticket chỉ có 1 entry cho 1 draw",
  },
  {
    collection: Max3dproCollections.TicketEntries,
    key: { tenantId: 1, financialDate: 1, status: 1 },
    options: { name: "idx_tenant_financialDate_status" },
    purpose: "Báo cáo tài chính theo ngày tài chính",
  },
  {
    collection: Max3dproCollections.TicketEntries,
    key: { drawId: 1, "payout.winAmount": 1 },
    options: { name: "idx_draw_winAmount", sparse: true },
    purpose: "Query winners cho enqueue-dispatch-payouts",
  },
  {
    collection: Max3dproCollections.TicketEntries,
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
    collection: Max3dproCollections.TicketEntries,
    key: {
      drawId: 1,
      status: 1,
      "voidInfo.refundTx": 1,
    },
    options: { name: "idx_draw_refundTx", sparse: true },
    purpose: "Enqueue dispatch refunds: paginate voided entries theo refundTx ASC",
  },
  {
    collection: Max3dproCollections.TicketEntries,
    key: { version: 1 },
    options: { name: "idx_version" },
    purpose: "Feed sync worker: scan entries thay đổi",
  },
  {
    collection: Max3dproCollections.Draws,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "DrawId unique",
  },
  {
    collection: Max3dproCollections.Draws,
    key: { status: 1, drawTime: 1 },
    options: { name: "idx_status_drawTime" },
    purpose: "Scheduler: tìm draws sắp quay",
  },
  {
    collection: Max3dproCollections.Draws,
    key: { status: 1, drawId: -1 },
    options: { name: "idx_status_drawId_desc" },
    purpose:
      "Settle order guard: findUnfinishedDrawBefore (status ∈ 6 trạng thái chưa hoàn thành + drawId < T) — ESR equality+range, IXSCAN không scan kỳ Settled/Void cũ. Đồng thời phục vụ getUnfinishedDraws (kỳ active dashboard).",
  },
  {
    collection: Max3dproCollections.Draws,
    key: { drawDate: 1, drawNo: 1 },
    options: { name: "idx_drawDate_drawNo" },
    purpose: "UI: hiển thị danh sách draws theo ngày",
  },
  {
    collection: Max3dproCollections.Draws,
    key: { "vietlottRef.drawPeriod": 1 },
    options: { name: "idx_vietlott_drawPeriod", sparse: true },
    purpose: "Lookup draw theo mã kỳ quay Vietlott",
  },
  {
    collection: Max3dproCollections.TicketLines,
    key: { entryId: 1, lineIndex: 1 },
    options: { unique: true, name: "idx_entryId_lineIndex_unique" },
    purpose: "Player xem lines + dedup key",
  },
  {
    collection: Max3dproCollections.TicketLines,
    key: { drawId: 1, accountId: 1 },
    options: { name: "idx_drawId_accountId" },
    purpose: "Query lines theo kỳ + player",
  },
  {
    collection: Max3dproCollections.TicketLines,
    key: { tenantId: 1, ticketId: 1, drawId: 1 },
    options: { name: "idx_tenant_ticket_draw" },
    purpose: "Access control + audit",
  },

  // max3dpro_draw_betting_stats
  {
    collection: Max3dproCollections.BettingStats,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "Ops dashboard: findOne pre-aggregated stats theo drawId (1 doc/draw, O(1))",
  },
  {
    collection: Max3dproCollections.BettingStats,
    key: { final: 1 },
    options: { name: "idx_final" },
    purpose:
      "Worker stats-sync: hàng đợi việc `findNotFinal()` — nguồn điều phối DUY NHẤT thay cho " +
      "getUnfinishedDraws(status). Bền với mọi tốc độ chuyển status draw. Selectivity thấp (2 " +
      "giá trị) nhưng số doc `final:false` luôn nhỏ và query dùng projection → index-only.",
  },
  {
    collection: Max3dproCollections.BettingStats,
    key: { updatedAt: 1 },
    options: { name: "idx_updatedAt" },
    purpose:
      "Worker ops-alerts: findChangedSince({updatedAt:{$gt:cursor}}) — hàng đợi đánh giá alert " +
      "theo doc ĐÃ ĐỔI. Doc final không update lại → phần index 'nóng' luôn nhỏ.",
  },

  // max3dpro_draw_pair_stats
  {
    collection: Max3dproCollections.PairStats,
    key: { drawId: 1, pairKey: 1 },
    options: { unique: true, name: "idx_drawId_pairKey_unique" },
    purpose:
      "Pair lookup + upsert delta worker (1 doc/(draw × pairKey ORDERED)). Worker upsert filter " +
      "`{drawId, pairKey, lastEntryId:{$lt:batchMaxId}}` — index phủ 2 field equality. Unique CÒN " +
      "là cơ chế idempotent: batch đã áp → filter không khớp → insert → 11000 = no-op " +
      "(bulkWrite `ordered:false`, bỏ qua 11000). Xem `DeltaAccumulatedDoc`. " +
      "⚠️ pairKey ORDERED `first>second` — KHÔNG sort.",
  },
  {
    collection: Max3dproCollections.PairStats,
    key: { drawId: 1, units: -1 },
    options: { name: "idx_drawId_units" },
    purpose:
      "Derive `topPairs` lúc đọc: sort({units:-1}).limit(topCombosK) — thay mảng top-K trong " +
      "stats doc vốn bị drift (p0-01 §1). Index-only, không cần recompute lúc đóng bán.",
  },
  {
    collection: Max3dproCollections.PairStats,
    key: { drawId: 1, accountCount: -1 },
    options: { name: "idx_drawId_accountCount" },
    purpose:
      "Rule combo_concentration: find({drawId, accountCount:{$gte:n}}) — counter vô hướng nên " +
      "index được (mongodb.mdc §8.2), thay `$expr $size` trên mảng (không sargable → COLLSCAN).",
  },
  {
    collection: Max3dproCollections.PairStats,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose:
      "TTL retention 90 ngày — Mongo tự xoá pair-stats cũ (mongodb.mdc §7). Index RIÊNG " +
      "single-field ascending — không gộp vào unique compound (TTL bắt buộc single-field).",
  },

  // max3dpro_draw_pair_accounts
  {
    collection: Max3dproCollections.PairAccounts,
    key: { drawId: 1, pairKey: 1, accountId: 1 },
    options: { unique: true, name: "idx_drawId_pairKey_accountId_unique" },
    purpose:
      "Worker `$inc` upsert 1 doc/(draw × pair × account) — nguồn đếm accountCount distinct cho " +
      "pair doc mà không phình mảng người chơi. Unique vừa đếm account mới qua `upsertedCount`, " +
      "vừa là cơ chế idempotent: batch đã áp → filter `lastEntryId:{$lt}` không khớp → insert → " +
      "11000 = no-op (`DeltaAccumulatedDoc`).",
  },
  {
    collection: Max3dproCollections.PairAccounts,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "TTL retention 90 ngày — cùng chuẩn PairStats (mongodb.mdc §7).",
  },

  // max3dpro_draw_account_stats
  {
    collection: Max3dproCollections.AccountStats,
    key: { drawId: 1, accountId: 1 },
    options: { unique: true, name: "idx_drawId_accountId_unique" },
    purpose:
      "Worker `$inc` upsert tích luỹ cược theo account/kỳ. Unique vừa bảo đảm 1 doc/(draw × " +
      "account), vừa là cơ chế idempotent: batch đã áp → filter `lastEntryId:{$lt}` không khớp → " +
      "insert → 11000 = no-op (`DeltaAccumulatedDoc`). Cũng phục vụ tra outstanding theo player/kỳ.",
  },
  {
    collection: Max3dproCollections.AccountStats,
    key: { drawId: 1, amount: -1 },
    options: { name: "idx_drawId_amount" },
    purpose:
      "Derive `topAccounts` lúc đọc: sort({amount:-1}).limit(topAccountsK) — THAY mảng top-K " +
      "trong stats doc vốn drift tỷ lệ thuận số người chơi (p0-01 §1). Chính xác tuyệt đối.",
  },
  {
    collection: Max3dproCollections.AccountStats,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "TTL retention 90 ngày — cùng chuẩn PairStats (mongodb.mdc §7).",
  },

  // max3dpro_ops_alerts
  {
    collection: Max3dproCollections.OpsAlerts,
    key: { status: 1, createdAt: -1 },
    options: { name: "idx_status_createdAt" },
    purpose: "List/count alert theo status (badge snapshot index-only count)",
  },
  {
    collection: Max3dproCollections.OpsAlerts,
    key: { drawId: 1, dedupeKey: 1 },
    options: { unique: true, name: "idx_drawId_dedupeKey_unique" },
    purpose: "Chống bắn trùng: 1 alert/(draw × dedupeKey), evaluator upsert idempotent",
  },
];

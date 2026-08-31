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
    /**
     * TTL (giây) — Mongo tự xoá document sau khi field trong `key` (PHẢI là 1 field
     * Date, ascending, đứng riêng — không gộp compound) quá hạn. Dùng cho retention
     * (xem `mongodb.mdc` §7) thay cho cleanup batch tự viết trong worker.
     */
    expireAfterSeconds?: number;
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
    key: { drawId: 1, _id: 1 },
    options: { name: "idx_draw_id" },
    purpose:
      "Ops stats insert-stream: đọc entries mới 1 draw theo watermark _id (drawId equality + _id range, index-only cursor). Cũng phục vụ recompute full lúc salesClosed.",
  },
  {
    collection: KenoCollections.TicketEntries,
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
    collection: KenoCollections.TicketEntries,
    key: {
      drawId: 1,
      status: 1,
      "voidInfo.refundTx": 1,
    },
    options: { name: "idx_draw_refundTx", sparse: true },
    purpose: "Enqueue dispatch refunds: paginate voided entries theo refundTx ASC",
  },
  {
    collection: KenoCollections.TicketEntries,
    key: { tenantId: 1, accountId: 1, financialDate: -1 },
    options: { name: "idx_tenant_account_financialDate" },
    purpose: "Lịch sử chơi: player xem entries gần đây",
  },
  {
    collection: KenoCollections.TicketEntries,
    key: { tenantId: 1, financialDate: 1, status: 1 },
    options: { name: "idx_tenant_financialDate_status" },
    purpose: "Báo cáo tenant: doanh thu theo ngày",
  },
  {
    collection: KenoCollections.TicketEntries,
    key: { financialDate: 1, status: 1 },
    options: { name: "idx_financialDate_status" },
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
    purpose: "Player draw results: filter settled draws + cursor pagination theo drawId (upper bound từ ngày)",
  },
  {
    collection: KenoCollections.Draws,
    key: { drawDate: 1, drawNo: 1 },
    options: { name: "idx_drawDate_drawNo" },
    purpose: "UI: hiển thị danh sách draws theo ngày",
  },
  {
    collection: KenoCollections.Draws,
    key: { drawDate: 1, drawTime: 1 },
    options: { name: "idx_drawDate_drawTime" },
    purpose:
      "listDrawTimesByDate: COVERED query (projection chỉ drawTime, _id:0) cho preview/validate tạo kỳ — " +
      "idx_drawDate_drawNo chỉ khớp prefix drawDate rồi phải FETCH ~119 doc/ngày để đọc drawTime",
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

  // ─────────────────────────────────────────
  // kenoDrawBettingStats
  // ─────────────────────────────────────────
  {
    collection: KenoCollections.BettingStats,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "Ops dashboard: findOne pre-aggregated stats theo drawId (1 doc/draw, O(1))",
  },
  {
    collection: KenoCollections.BettingStats,
    key: { final: 1 },
    options: { name: "idx_final" },
    purpose:
      "Worker stats-sync: hàng đợi việc `findNotFinal()` — nguồn điều phối DUY NHẤT thay cho " +
      "getUnfinishedDraws(status). Bền với mọi tốc độ chuyển status draw (p2-01 §3.5.4). " +
      "Selectivity thấp (chỉ 2 giá trị) nhưng số doc `final:false` luôn nhỏ (kỳ đang mở + vừa đóng) " +
      "và query dùng projection → index-only, không fetch doc.",
  },
  {
    collection: KenoCollections.BettingStats,
    key: { updatedAt: 1 },
    options: { name: "idx_updatedAt" },
    purpose:
      "Worker ops-alerts: findChangedSince({updatedAt:{$gt:cursor}}) — hàng đợi đánh giá alert " +
      "theo doc ĐÃ ĐỔI. Doc final không update lại → phần index 'nóng' luôn nhỏ. " +
      "(analysis keno-stats-worker-simplification §5.1)",
  },

  // ─────────────────────────────────────────
  // kenoDrawComboStats
  // ─────────────────────────────────────────
  {
    collection: KenoCollections.ComboStats,
    key: { drawId: 1, comboKey: 1 },
    options: { unique: true, name: "idx_drawId_comboKey_unique" },
    purpose:
      "Combo lookup staff/player + upsert delta worker (1 doc/combo/draw). Worker upsert filter " +
      "`{drawId, comboKey, lastEntryId:{$lt:batchMaxId}}` — index phủ 2 field equality, " +
      "`lastEntryId` lọc sau (chỉ 1 doc nên không tốn gì). Unique CÒN là cơ chế idempotent: " +
      "batch đã áp → filter không khớp → upsert cố insert → lỗi 11000 = 'đã áp rồi' = no-op " +
      "(bulkWrite `ordered:false`, bỏ qua 11000). Xem `DeltaAccumulatedDoc`.",
  },
  {
    collection: KenoCollections.ComboStats,
    key: { drawId: 1, sets: -1 },
    options: { name: "idx_drawId_sets" },
    purpose:
      "Derive `topCombos` lúc đọc: sort({sets:-1}).limit(topCombosK) — thay mảng top-K trong " +
      "stats doc vốn bị drift (p2-01 §3.5). Index-only, không cần recompute lúc đóng bán.",
  },
  {
    collection: KenoCollections.ComboStats,
    key: { drawId: 1, accountCount: -1 },
    options: { name: "idx_drawId_accountCount" },
    purpose:
      "Rule combo_concentration: find({drawId, accountCount:{$gte:n}}) — THAY `$expr $size` " +
      "trên mảng accounts (không sargable → COLLSCAN toàn bộ combo của kỳ mỗi tick, p2-01 R2). " +
      "Counter vô hướng nên index được (mongodb.mdc §8.2).",
  },
  {
    collection: KenoCollections.ComboStats,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose:
      "TTL retention 90 ngày — Mongo tự xoá combo-stats cũ (thay cleanup batch tự viết trong " +
      "worker `SyncBettingStatsUseCase`, xem mongodb.mdc §7). Index RIÊNG, single-field ascending " +
      "— không gộp vào unique index compound phía trên (TTL bắt buộc single-field).",
  },

  // ─────────────────────────────────────────
  // kenoDrawComboAccounts
  // ─────────────────────────────────────────
  {
    collection: KenoCollections.ComboAccounts,
    key: { drawId: 1, comboKey: 1, accountId: 1 },
    options: { unique: true, name: "idx_drawId_comboKey_accountId_unique" },
    purpose:
      "Worker `$inc` upsert 1 doc/(draw × combo × account) — thay mảng `accounts` trong combo doc " +
      "(mảng phình theo số người chơi → chạm BSON 16MB + buộc read-modify-write, p2-01 R1). " +
      "Unique vừa để đếm account mới qua `upsertedCount`, vừa là cơ chế idempotent: batch đã áp " +
      "→ filter `lastEntryId:{$lt}` không khớp → insert → 11000 = no-op (`DeltaAccumulatedDoc`).",
  },
  {
    collection: KenoCollections.ComboAccounts,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "TTL retention 90 ngày — cùng chuẩn ComboStats (mongodb.mdc §7).",
  },

  // ─────────────────────────────────────────
  // kenoDrawAccountStats
  // ─────────────────────────────────────────
  {
    collection: KenoCollections.AccountStats,
    key: { drawId: 1, accountId: 1 },
    options: { unique: true, name: "idx_drawId_accountId_unique" },
    purpose:
      "Worker `$inc` upsert tích luỹ cược theo account/kỳ. Unique vừa bảo đảm 1 doc/(draw × " +
      "account), vừa là cơ chế idempotent: batch đã áp → filter `lastEntryId:{$lt}` không khớp " +
      "→ insert → 11000 = no-op (xem `DeltaAccumulatedDoc`). " +
      "Cũng phục vụ tra outstanding theo player/kỳ (link từ alert large_bet).",
  },
  {
    collection: KenoCollections.AccountStats,
    key: { drawId: 1, amount: -1 },
    options: { name: "idx_drawId_amount" },
    purpose:
      "Derive `topAccounts` lúc đọc: sort({amount:-1}).limit(topAccountsK) — THAY mảng top-K " +
      "trong stats doc vốn drift tỷ lệ thuận số người chơi (p2-01 R5). Chính xác tuyệt đối.",
  },
  {
    collection: KenoCollections.AccountStats,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "TTL retention 90 ngày — cùng chuẩn ComboStats (mongodb.mdc §7).",
  },

  // ─────────────────────────────────────────
  // kenoOpsAlerts
  // ─────────────────────────────────────────
  {
    collection: KenoCollections.OpsAlerts,
    key: { status: 1, createdAt: -1 },
    options: { name: "idx_status_createdAt" },
    purpose: "List/count alert theo status (badge snapshot index-only count)",
  },
  {
    collection: KenoCollections.OpsAlerts,
    key: { drawId: 1, dedupeKey: 1 },
    options: { unique: true, name: "idx_drawId_dedupeKey_unique" },
    purpose: "Chống bắn trùng: 1 alert/(draw × dedupeKey), evaluator upsert idempotent",
  },
];

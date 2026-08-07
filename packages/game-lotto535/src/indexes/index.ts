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
    /**
     * TTL (giây) — Mongo tự xoá document sau khi field trong `key` (PHẢI là 1 field
     * Date, ascending, đứng riêng — không gộp compound) quá hạn. Dùng cho retention
     * (xem `mongodb.mdc` §7) thay cho cleanup batch tự viết trong worker.
     */
    expireAfterSeconds?: number;
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
    purpose: "Player pending/completed tickets: filter tenant+account+status, cursor by _id",
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
    purpose: "Player completed tickets sortBy=drawDate: filter by settlement date range",
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
  {
    collection: Lotto535Collections.Tickets,
    key: { "drawPlan.drawIds": 1 },
    options: { name: "idx_drawPlan_drawIds" },
    purpose: "Cursor-based query tickets theo drawId cho SyncTicketSummaries",
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
    key: { drawId: 1, accountId: 1 },
    options: { name: "idx_draw_accountId" },
    purpose:
      "Ownership-gate combo popularity (p1-01, analysis §3.10): getBoardsByAccountDraw " +
      "filter {accountId, drawId} — player chỉ tra được bộ số MÌNH đã cược.",
  },
  {
    collection: Lotto535Collections.TicketEntries,
    key: { drawId: 1, _id: 1 },
    options: { name: "idx_draw_id" },
    purpose:
      "Ops stats insert-stream (p0-02): getEntriesForStatsAfter đọc entries mới 1 draw " +
      "theo watermark _id (drawId equality + _id range, index-only cursor) — đối chiếu " +
      "kết luận Power 6/55 p0-01 mục 7 (copy nguyên: index riêng {drawId,_id}, không dựa " +
      "vào _id tự nhiên toàn collection).",
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
    purpose: "Unique guard: 1 ticket chỉ có 1 entry cho 1 draw (idempotent auto-enroll)",
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
    purpose: "Query winners cho enqueue-dispatch-payouts: entries có winAmount > 0",
  },
  {
    collection: Lotto535Collections.TicketEntries,
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
    collection: Lotto535Collections.TicketEntries,
    key: {
      drawId: 1,
      status: 1,
      "voidInfo.refundTx": 1,
    },
    options: { name: "idx_draw_refundTx", sparse: true },
    purpose: "Enqueue dispatch refunds: paginate voided entries theo refundTx ASC",
  },
  {
    collection: Lotto535Collections.TicketEntries,
    key: { version: 1 },
    options: { name: "idx_version" },
    purpose: "Feed sync worker: scan entries thay đổi kể từ version cuối cùng đã sync",
  },
  {
    collection: Lotto535Collections.TicketEntries,
    key: { drawId: 1, "reversal.reversalTx": 1 },
    options: { name: "idx_draw_reversalTx", sparse: true },
    purpose: "EnqueueReversals: cursor pagination theo reversalTx ASC",
  },
  {
    collection: Lotto535Collections.TicketEntries,
    key: {
      drawId: 1,
      status: 1,
      "entrySummary.boards.mainNumbers": 1,
    },
    options: { name: "idx_draw_status_boardNumbers" },
    purpose:
      "Resettle pre-flight: existsJpWinnerForDraw match JP winner bằng $elemMatch+$all (IXSCAN multikey, không scan toàn kỳ)",
  },

  // ─────────────────────────────────────────
  // lotto535JackpotCycleEntries (Cycle Ledger)
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.JackpotCycleEntries,
    key: { cycleNo: 1, seq: 1 },
    options: { unique: true, name: "idx_cycle_seq_unique" },
    purpose: "Sort chronological trong cycle + unique vị trí kỳ",
  },
  {
    collection: Lotto535Collections.JackpotCycleEntries,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose:
      "Lookup ledger theo kỳ; findSettledChainAfterDraw + findClosingBeforeDraw — range scan drawId (cascade B2 xuyên cycle, resolve opening theo thời gian)",
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
    key: { status: 1, drawId: -1 },
    options: { name: "idx_status_drawId_desc" },
    purpose:
      "Player draw results: filter settled draws + cursor pagination theo drawId. CŨNG phục vụ resettle cascade guard findPendingResettleBeforeDraw (status ∈ {Published,Settling} + drawId < T, sort drawId DESC) — ESR equality+range, IXSCAN không scan kỳ Settled cũ",
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
    purpose: "Player xem lines của 1 entry + dedup key cho idempotent upsert khi retry",
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

  // ─────────────────────────────────────────
  // lotto535_draw_betting_stats
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.DrawBettingStats,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "Ops dashboard: findOne pre-aggregated stats theo drawId (1 doc/draw, O(1))",
  },
  {
    collection: Lotto535Collections.DrawBettingStats,
    key: { final: 1 },
    options: { name: "idx_final" },
    purpose:
      "Worker stats-sync: hàng đợi việc findNotFinal() — nguồn điều phối duy nhất " +
      "thay cho getUnfinishedDraws(status). 2 kỳ/ngày, 1 kỳ active → số doc final:false " +
      "luôn nhỏ, query dùng projection mỏng → index-only.",
  },
  {
    collection: Lotto535Collections.DrawBettingStats,
    key: { updatedAt: 1 },
    options: { name: "idx_updatedAt" },
    purpose:
      "Worker ops-alerts: findChangedSince({updatedAt:{$gt:cursor}}) — hàng đợi đánh giá " +
      "alert theo doc ĐÃ ĐỔI. Doc final không update lại → phần index 'nóng' luôn nhỏ.",
  },

  // ─────────────────────────────────────────
  // lotto535_draw_number_stats
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.DrawNumberStats,
    key: { drawId: 1, kind: 1, number: 1 },
    options: { unique: true, name: "idx_drawId_kind_number_unique" },
    purpose:
      "Heatmap 2 lưới (35 main + 12 special): find({drawId}) index-only ≤47 docs + " +
      "upsert delta worker filter {drawId, kind, number, lastEntryId:{$lt}}. Unique cũng " +
      "là cơ chế idempotent (11000 = no-op). Input trực tiếp rule special_skew (kind=special).",
  },
  {
    collection: Lotto535Collections.DrawNumberStats,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "TTL retention 90 ngày — Mongo tự xoá number-stats cũ (mongodb.mdc §7).",
  },

  // ─────────────────────────────────────────
  // lotto535_draw_account_stats
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.DrawAccountStats,
    key: { drawId: 1, accountId: 1 },
    options: { unique: true, name: "idx_drawId_accountId_unique" },
    purpose:
      "Worker $inc upsert tích luỹ cược theo account/kỳ. Unique vừa bảo đảm 1 doc/(draw × " +
      "account), vừa là cơ chế idempotent: batch đã áp → filter lastEntryId:{$lt} không " +
      "khớp → insert → 11000 = no-op. Cũng phục vụ tra outstanding theo player/kỳ (alert large_bet).",
  },
  {
    collection: Lotto535Collections.DrawAccountStats,
    key: { drawId: 1, amount: -1 },
    options: { name: "idx_drawId_amount" },
    purpose:
      "Derive topAccounts lúc đọc: sort({amount:-1}).limit(topAccountsK) — thay mảng " +
      "top-K trong stats doc vốn drift tỷ lệ thuận số người chơi. Chính xác tuyệt đối.",
  },
  {
    collection: Lotto535Collections.DrawAccountStats,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "TTL retention 90 ngày — cùng chuẩn number-stats (mongodb.mdc §7).",
  },

  // ─────────────────────────────────────────
  // lotto535_draw_combo_stats
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.DrawComboStats,
    key: { drawId: 1, comboKey: 1 },
    options: { unique: true, name: "idx_drawId_comboKey_unique" },
    purpose:
      "Combo lookup staff/player + upsert delta worker (1 doc/combo/draw). Unique CÒN " +
      "là cơ chế idempotent: batch đã áp → filter lastEntryId:{$lt} không khớp → insert " +
      "→ 11000 = no-op (bulkWrite ordered:false, bỏ qua 11000).",
  },
  {
    collection: Lotto535Collections.DrawComboStats,
    key: { drawId: 1, sets: -1 },
    options: { name: "idx_drawId_sets" },
    purpose:
      "Derive topCombos lúc đọc: sort({sets:-1}).limit(topCombosK) — thay mảng top-K " +
      "trong stats doc vốn bị drift. Index-only, không cần recompute lúc đóng bán.",
  },
  {
    collection: Lotto535Collections.DrawComboStats,
    key: { drawId: 1, accountCount: 1 },
    options: { name: "idx_drawId_accountCount" },
    purpose:
      "Rule combo_concentration: find({drawId, accountCount:{$gte:n}}) — THAY $expr $size " +
      "trên mảng (không sargable). Counter vô hướng nên index được (mongodb.mdc §8.2).",
  },
  {
    collection: Lotto535Collections.DrawComboStats,
    key: { drawId: 1, playType: 1, mainNumbers: 1 },
    options: { name: "idx_drawId_playType_mainNumbers" },
    purpose:
      "Multikey — nhánh $all mainCover6–15 tính jackpotUnits (p1-01, analysis §3.10(2)): " +
      "find({drawId, playType:'mainCover', mainNumbers:{$all:M}, specialNumbers:[s]}). " +
      "Prefix playType bound index để KHÔNG quét biển combo standard (board mainCover " +
      "tối thiểu 60k, phổ biến tiền lớn — docs hiếm hơn combo standard rất nhiều).",
  },
  {
    collection: Lotto535Collections.DrawComboStats,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "TTL retention 90 ngày — cùng chuẩn number-stats (mongodb.mdc §7).",
  },

  // ─────────────────────────────────────────
  // lotto535_draw_combo_accounts
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.DrawComboAccounts,
    key: { drawId: 1, comboKey: 1, accountId: 1 },
    options: { unique: true, name: "idx_drawId_comboKey_accountId_unique" },
    purpose:
      "Worker $inc upsert 1 doc/(draw × combo × account) — thay mảng accounts trong " +
      "combo doc (phình theo số người chơi → chạm BSON 16MB). Unique vừa để đếm account " +
      "mới qua upsertedCount, vừa là cơ chế idempotent.",
  },
  {
    collection: Lotto535Collections.DrawComboAccounts,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "TTL retention 90 ngày — cùng chuẩn combo-stats (mongodb.mdc §7).",
  },

  // ─────────────────────────────────────────
  // lotto535_ops_alerts
  // ─────────────────────────────────────────
  {
    collection: Lotto535Collections.OpsAlerts,
    key: { drawId: 1, dedupeKey: 1 },
    options: { unique: true, name: "idx_drawId_dedupeKey_unique" },
    purpose: "Chống bắn trùng: 1 alert/(draw × dedupeKey), evaluator upsert idempotent",
  },
  {
    collection: Lotto535Collections.OpsAlerts,
    key: { status: 1, severity: 1, createdAt: -1 },
    options: { name: "idx_status_severity_createdAt" },
    purpose: "List/count alert theo status+severity (badge snapshot, panel filter)",
  },
  {
    collection: Lotto535Collections.OpsAlerts,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 180 * 24 * 60 * 60 },
    purpose: "TTL retention 180 ngày — alert giữ lâu hơn stats để audit vận hành.",
  },
];

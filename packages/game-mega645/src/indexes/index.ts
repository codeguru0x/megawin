/**
 * Mega 6/45 – MongoDB Indexes
 */

import { Mega645Collections } from "../entities/enums";

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

export const MEGA645_INDEXES: readonly IndexSpec[] = [
  // ───── mega645GameConfigs ─────
  {
    collection: Mega645Collections.GameConfigs,
    key: { scope: 1, tenantId: 1 },
    options: { unique: true, name: "idx_scope_tenant_unique" },
    purpose: "1 global config + 1 config per tenant",
  },

  // ───── mega645Tickets ─────
  {
    collection: Mega645Collections.Tickets,
    key: { accountId: 1, ticketNo: 1 },
    options: { unique: true, name: "idx_account_ticketNo_unique" },
    purpose: "Mã vé unique per account",
  },
  {
    collection: Mega645Collections.Tickets,
    key: { tenantId: 1, accountId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_account_status_created" },
    purpose: "Player pending/completed tickets",
  },
  {
    collection: Mega645Collections.Tickets,
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
    collection: Mega645Collections.Tickets,
    key: { tenantId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_status_created" },
    purpose: "Báo cáo vé theo tenant",
  },
  {
    collection: Mega645Collections.Tickets,
    key: { "drawPlan.drawIds": 1 },
    options: { name: "idx_drawPlanDrawIds" },
    purpose: "Query tickets theo drawId",
  },

  // ───── mega645TicketEntries ─────
  {
    collection: Mega645Collections.TicketEntries,
    key: { drawId: 1, status: 1 },
    options: { name: "idx_draw_status" },
    purpose: "Settle batch",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: { drawId: 1, accountId: 1 },
    options: { name: "idx_draw_accountId" },
    purpose:
      "Ownership-gate combo popularity (p1-01, analysis §3.10): getBoardsByAccountDraw " +
      "filter {accountId, drawId} — player chỉ tra được bộ số MÌNH đã cược.",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: { drawId: 1, _id: 1 },
    options: { name: "idx_draw_id" },
    purpose:
      "Ops stats insert-stream (p0-02): getEntriesForStatsAfter đọc entries mới 1 draw " +
      "theo watermark _id (drawId equality + _id range, index-only cursor) — đối chiếu " +
      "quyết định Power 6/55 p0-01 (thêm index này).",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: { ticketId: 1 },
    options: { name: "idx_ticketId" },
    purpose: "Lookup entries theo ticket",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: { ticketId: 1, drawId: 1 },
    options: { unique: true, name: "idx_ticketId_drawId_unique" },
    purpose: "1 ticket chỉ có 1 entry cho 1 draw",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: { tenantId: 1, financialDate: 1, status: 1 },
    options: { name: "idx_tenant_financialDate_status" },
    purpose: "Báo cáo tài chính",
  },
  {
    collection: Mega645Collections.TicketEntries,
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
    collection: Mega645Collections.TicketEntries,
    key: {
      drawId: 1,
      status: 1,
      "voidInfo.refundTx": 1,
    },
    options: { name: "idx_draw_refundTx", sparse: true },
    purpose: "Enqueue dispatch refunds: paginate voided entries theo refundTx ASC",
  },
  {
    collection: Mega645Collections.TicketEntries,
    key: { version: 1 },
    options: { name: "idx_version" },
    purpose: "Feed sync worker",
  },

  // ───── mega645Draws ─────
  {
    collection: Mega645Collections.Draws,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "DrawId unique",
  },
  {
    collection: Mega645Collections.Draws,
    key: { status: 1, drawTime: 1 },
    options: { name: "idx_status_drawTime" },
    purpose: "Scheduler",
  },
  {
    collection: Mega645Collections.Draws,
    key: { status: 1, drawId: -1 },
    options: { name: "idx_status_drawId_desc" },
    purpose:
      "Resettle cascade guard: findPendingResettleBeforeDraw (status ∈ {Published,Settling} + drawId < T) — ESR equality+range, IXSCAN không scan kỳ Settled cũ. Đồng thời phục vụ getUnfinishedDraws (single source of truth kỳ đang vận hành).",
  },
  {
    collection: Mega645Collections.Draws,
    key: { drawDate: 1, drawNo: 1 },
    options: { name: "idx_drawDate_drawNo" },
    purpose: "UI danh sách draws theo ngày",
  },
  {
    collection: Mega645Collections.Draws,
    key: { "vietlottRef.drawPeriod": 1 },
    options: { name: "idx_vietlott_drawPeriod", sparse: true },
    purpose: "Lookup draw theo mã kỳ quay Vietlott",
  },

  // ───── mega645TicketLines ─────
  {
    collection: Mega645Collections.TicketLines,
    key: { entryId: 1, lineIndex: 1 },
    options: { unique: true, name: "idx_entryId_lineIndex_unique" },
    purpose: "Player xem lines + dedup key",
  },
  {
    collection: Mega645Collections.TicketLines,
    key: { drawId: 1, accountId: 1 },
    options: { name: "idx_drawId_accountId" },
    purpose: "Query lines theo kỳ + player",
  },

  // ───── mega645JackpotCycles ─────
  {
    collection: Mega645Collections.JackpotCycles,
    key: { status: 1 },
    options: { name: "idx_status" },
    purpose: "Tìm active cycle",
  },
  {
    collection: Mega645Collections.JackpotCycles,
    key: { cycleNo: 1 },
    options: { unique: true, name: "idx_cycleNo_unique" },
    purpose: "Mã cycle unique",
  },
  {
    collection: Mega645Collections.JackpotCycles,
    key: { status: 1, closedAt: -1 },
    options: { name: "idx_status_closedAt" },
    purpose: "Lịch sử cycles",
  },

  // ───── mega645JackpotCycleEntries (Cycle Ledger) ─────
  {
    collection: Mega645Collections.JackpotCycleEntries,
    key: { cycleNo: 1, seq: 1 },
    options: { unique: true, name: "idx_cycleNo_seq_unique" },
    purpose: "listByCycle, findLatestInCycle, upsertEntry — sort chronological trong cycle",
  },
  {
    collection: Mega645Collections.JackpotCycleEntries,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose:
      "findByDraw lookup theo kỳ; findSettledChainAfterDraw + findClosingJpBeforeDraw — range scan drawId (cascade B2 xuyên cycle, resolve opening theo thời gian)",
  },

  // ─────────────────────────────────────────
  // mega645_draw_betting_stats
  // ─────────────────────────────────────────
  {
    collection: Mega645Collections.DrawBettingStats,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "Ops dashboard: findOne pre-aggregated stats theo drawId (1 doc/draw, O(1))",
  },
  {
    collection: Mega645Collections.DrawBettingStats,
    key: { final: 1 },
    options: { name: "idx_final" },
    purpose:
      "Worker stats-sync: hàng đợi việc findNotFinal() — nguồn điều phối duy nhất " +
      "thay cho getUnfinishedDraws(status). Số doc final:false luôn nhỏ (1 kỳ active) " +
      "và query dùng projection mỏng → index-only.",
  },
  {
    collection: Mega645Collections.DrawBettingStats,
    key: { updatedAt: 1 },
    options: { name: "idx_updatedAt" },
    purpose:
      "Worker ops-alerts: findChangedSince({updatedAt:{$gt:cursor}}) — hàng đợi đánh giá " +
      "alert theo doc ĐÃ ĐỔI. Doc final không update lại → phần index 'nóng' luôn nhỏ.",
  },

  // ─────────────────────────────────────────
  // mega645_draw_number_stats
  // ─────────────────────────────────────────
  {
    collection: Mega645Collections.DrawNumberStats,
    key: { drawId: 1, number: 1 },
    options: { unique: true, name: "idx_drawId_number_unique" },
    purpose:
      "Heatmap 45 số: find({drawId}) index-only ≤45 docs + upsert delta worker filter " +
      "{drawId, number, lastEntryId:{$lt}}. Unique cũng là cơ chế idempotent (11000 = no-op).",
  },
  {
    collection: Mega645Collections.DrawNumberStats,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "TTL retention 90 ngày — Mongo tự xoá number-stats cũ (mongodb.mdc §7).",
  },

  // ─────────────────────────────────────────
  // mega645_draw_account_stats
  // ─────────────────────────────────────────
  {
    collection: Mega645Collections.DrawAccountStats,
    key: { drawId: 1, accountId: 1 },
    options: { unique: true, name: "idx_drawId_accountId_unique" },
    purpose:
      "Worker $inc upsert tích luỹ cược theo account/kỳ. Unique vừa bảo đảm 1 doc/(draw × " +
      "account), vừa là cơ chế idempotent: batch đã áp → filter lastEntryId:{$lt} không " +
      "khớp → insert → 11000 = no-op. Cũng phục vụ tra outstanding theo player/kỳ (alert large_bet).",
  },
  {
    collection: Mega645Collections.DrawAccountStats,
    key: { drawId: 1, amount: -1 },
    options: { name: "idx_drawId_amount" },
    purpose:
      "Derive topAccounts lúc đọc: sort({amount:-1}).limit(topAccountsK) — thay mảng " +
      "top-K trong stats doc vốn drift tỷ lệ thuận số người chơi. Chính xác tuyệt đối.",
  },
  {
    collection: Mega645Collections.DrawAccountStats,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "TTL retention 90 ngày — cùng chuẩn number-stats (mongodb.mdc §7).",
  },

  // ─────────────────────────────────────────
  // mega645_draw_combo_stats
  // ─────────────────────────────────────────
  {
    collection: Mega645Collections.DrawComboStats,
    key: { drawId: 1, comboKey: 1 },
    options: { unique: true, name: "idx_drawId_comboKey_unique" },
    purpose:
      "Combo lookup staff/player + upsert delta worker (1 doc/combo/draw). Unique CÒN " +
      "là cơ chế idempotent: batch đã áp → filter lastEntryId:{$lt} không khớp → insert " +
      "→ 11000 = no-op (bulkWrite ordered:false, bỏ qua 11000).",
  },
  {
    collection: Mega645Collections.DrawComboStats,
    key: { drawId: 1, sets: -1 },
    options: { name: "idx_drawId_sets" },
    purpose:
      "Derive topCombos lúc đọc: sort({sets:-1}).limit(topCombosK) — thay mảng top-K " +
      "trong stats doc vốn bị drift. Index-only, không cần recompute lúc đóng bán.",
  },
  {
    collection: Mega645Collections.DrawComboStats,
    key: { drawId: 1, accountCount: 1 },
    options: { name: "idx_drawId_accountCount" },
    purpose:
      "Rule combo_concentration: find({drawId, accountCount:{$gte:n}}) — THAY $expr $size " +
      "trên mảng (không sargable). Counter vô hướng nên index được (mongodb.mdc §8.2).",
  },
  {
    collection: Mega645Collections.DrawComboStats,
    key: { drawId: 1, playType: 1, numbers: 1 },
    options: { name: "idx_drawId_playType_numbers" },
    purpose:
      "Multikey — nhánh $all bao7–18 tính jackpotUnits (p1-01, analysis §3.10(3)): " +
      "find({drawId, playType:{$in:[bao7..bao18]}, numbers:{$all:S}}). Prefix " +
      "playType bound index để KHÔNG quét biển combo standard (docs bao cao hiếm — " +
      "giá board 70k–185tr).",
  },
  {
    collection: Mega645Collections.DrawComboStats,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "TTL retention 90 ngày — cùng chuẩn number-stats (mongodb.mdc §7).",
  },

  // ─────────────────────────────────────────
  // mega645_draw_combo_accounts
  // ─────────────────────────────────────────
  {
    collection: Mega645Collections.DrawComboAccounts,
    key: { drawId: 1, comboKey: 1, accountId: 1 },
    options: { unique: true, name: "idx_drawId_comboKey_accountId_unique" },
    purpose:
      "Worker $inc upsert 1 doc/(draw × combo × account) — thay mảng accounts trong " +
      "combo doc (phình theo số người chơi → chạm BSON 16MB). Unique vừa để đếm account " +
      "mới qua upsertedCount, vừa là cơ chế idempotent.",
  },
  {
    collection: Mega645Collections.DrawComboAccounts,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "TTL retention 90 ngày — cùng chuẩn combo-stats (mongodb.mdc §7).",
  },

  // ─────────────────────────────────────────
  // mega645_ops_alerts
  // ─────────────────────────────────────────
  {
    collection: Mega645Collections.OpsAlerts,
    key: { drawId: 1, dedupeKey: 1 },
    options: { unique: true, name: "idx_drawId_dedupeKey_unique" },
    purpose: "Chống bắn trùng: 1 alert/(draw × dedupeKey), evaluator upsert idempotent",
  },
  {
    collection: Mega645Collections.OpsAlerts,
    key: { status: 1, severity: 1, createdAt: -1 },
    options: { name: "idx_status_severity_createdAt" },
    purpose: "List/count alert theo status+severity (badge snapshot, panel filter)",
  },
  {
    collection: Mega645Collections.OpsAlerts,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 180 * 24 * 60 * 60 },
    purpose: "TTL retention 180 ngày — alert giữ lâu hơn stats để audit vận hành.",
  },
];

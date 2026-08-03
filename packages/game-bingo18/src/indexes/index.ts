/**
 * Bingo 18 – Recommended MongoDB Indexes
 */

import { Bingo18Collections } from "../entities/enums";

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

export const BINGO18_INDEXES: readonly IndexSpec[] = [
  // ─────────────────────────────────────────
  // bingo18_game_configs
  // ─────────────────────────────────────────
  {
    collection: Bingo18Collections.GameConfigs,
    key: { scope: 1, tenantId: 1 },
    options: { unique: true, name: "idx_scope_tenant_unique" },
    purpose: "Đảm bảo 1 global config + 1 config per tenant",
  },

  // ─────────────────────────────────────────
  // bingo18_tickets
  // ─────────────────────────────────────────
  {
    collection: Bingo18Collections.Tickets,
    key: { accountId: 1, ticketNo: 1 },
    options: { unique: true, name: "idx_account_ticketNo_unique" },
    purpose: "Mã vé unique per account",
  },
  {
    collection: Bingo18Collections.Tickets,
    key: { tenantId: 1, accountId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_account_status_created" },
    purpose: "Player pending/completed tickets",
  },
  {
    collection: Bingo18Collections.Tickets,
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
    collection: Bingo18Collections.Tickets,
    key: { "drawPlan.drawIds": 1 },
    options: { name: "idx_drawPlan_drawIds" },
    purpose: "Query tickets by drawId trong drawPlan",
  },
  {
    collection: Bingo18Collections.Tickets,
    key: { tenantId: 1, status: 1, createdAt: -1 },
    options: { name: "idx_tenant_status_created" },
    purpose: "Báo cáo vé theo tenant",
  },

  // ─────────────────────────────────────────
  // bingo18_ticket_entries
  // ─────────────────────────────────────────
  {
    collection: Bingo18Collections.TicketEntries,
    key: { ticketId: 1, drawId: 1 },
    options: { unique: true, name: "idx_ticket_draw_unique" },
    purpose: "Idempotent: 1 entry per ticket per draw",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: { drawId: 1, status: 1 },
    options: { name: "idx_draw_status" },
    purpose: "Settle batch: lấy tất cả entries cho 1 draw",
  },
  {
    collection: Bingo18Collections.TicketEntries,
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
    collection: Bingo18Collections.TicketEntries,
    key: {
      drawId: 1,
      status: 1,
      "voidInfo.refundTx": 1,
    },
    options: { name: "idx_draw_refundTx", sparse: true },
    purpose: "Enqueue dispatch refunds: paginate voided entries theo refundTx ASC",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: { drawId: 1, _id: 1 },
    options: { name: "idx_draw_id" },
    purpose:
      "Ops stats insert-stream: đọc entries mới 1 draw theo watermark _id (drawId equality + _id range, index-only cursor).",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: { tenantId: 1, accountId: 1, financialDate: -1 },
    options: { name: "idx_tenant_account_financialDate" },
    purpose: "Lịch sử chơi: player xem entries gần đây",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: { tenantId: 1, financialDate: 1, status: 1 },
    options: { name: "idx_tenant_financialDate_status" },
    purpose: "Báo cáo tenant: doanh thu theo ngày",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: { financialDate: 1, status: 1 },
    options: { name: "idx_financialDate_status" },
    purpose: "Báo cáo megawin: doanh thu toàn hệ thống theo ngày",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: { ticketId: 1 },
    options: { name: "idx_ticketId" },
    purpose: "Lookup entries theo ticket",
  },
  {
    collection: Bingo18Collections.TicketEntries,
    key: { version: 1 },
    options: { name: "idx_version" },
    purpose: "Feed sync worker: scan entries thay đổi",
  },

  // ─────────────────────────────────────────
  // bingo18_draws
  // ─────────────────────────────────────────
  {
    collection: Bingo18Collections.Draws,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "DrawId unique",
  },
  {
    collection: Bingo18Collections.Draws,
    key: { status: 1, drawTime: 1 },
    options: { name: "idx_status_drawTime" },
    purpose: "Scheduler: tìm draws sắp quay",
  },
  {
    collection: Bingo18Collections.Draws,
    key: { status: 1, drawId: -1 },
    options: { name: "idx_status_drawId_desc" },
    purpose:
      "Settle order guard: findUnfinishedDrawBefore (status ∈ 6 trạng thái chưa hoàn thành + drawId < T) — ESR equality+range, IXSCAN không scan kỳ Settled/Void cũ. " +
      "Đồng thời phục vụ getUnfinishedDraws (status $in DRAW_UNFINISHED_STATUSES, sort drawId desc) — nguồn dữ liệu chung cho GetCurrentDraw + GetDrawSelector, không lookback ngày.",
  },
  {
    collection: Bingo18Collections.Draws,
    key: { drawDate: 1, drawNo: 1 },
    options: { name: "idx_drawDate_drawNo" },
    purpose: "UI: hiển thị danh sách draws theo ngày",
  },
  {
    collection: Bingo18Collections.Draws,
    key: { drawDate: -1, drawNo: -1 },
    options: { name: "idx_drawDate_drawNo_desc" },
    purpose: "getLatestDraw: O(1) lookup kỳ mới nhất",
  },
  {
    collection: Bingo18Collections.Draws,
    key: { "vietlottRef.drawPeriod": 1 },
    options: { name: "idx_vietlott_drawPeriod", sparse: true },
    purpose: "Lookup draw theo mã kỳ quay Vietlott",
  },

  // ─────────────────────────────────────────
  // bingo18_draw_counters
  // ─────────────────────────────────────────
  {
    collection: Bingo18Collections.DrawCounters,
    key: { drawDate: 1 },
    options: { unique: true, name: "idx_drawDate_unique" },
    purpose: "Atomic counter: 1 document per ngày",
  },

  // ─────────────────────────────────────────
  // bingo18_draw_betting_stats
  // ─────────────────────────────────────────
  {
    collection: Bingo18Collections.BettingStats,
    key: { drawId: 1 },
    options: { unique: true, name: "idx_drawId_unique" },
    purpose: "Ops dashboard: findOne pre-aggregated stats theo drawId (1 doc/draw, O(1))",
  },
  {
    collection: Bingo18Collections.BettingStats,
    key: { final: 1 },
    options: { name: "idx_final" },
    purpose:
      "Worker stats-sync: hàng đợi việc `findNotFinal({final:false})` — nguồn điều phối DUY NHẤT " +
      "thay cho getUnfinishedDraws(status). Bền với mọi tốc độ chuyển status draw (F4-e). " +
      "Selectivity thấp (chỉ 2 giá trị) nhưng số doc `final:false` luôn nhỏ (kỳ đang mở + vừa đóng) " +
      "→ Mongo nhảy thẳng tập nhỏ này thay vì scan toàn bộ kỳ đã `final:true`. KHÔNG có index này " +
      "thì mỗi tick là 1 collection scan khi số kỳ lên hàng trăm nghìn (DrawBettingStatsBase.final JSDoc).",
  },
  {
    collection: Bingo18Collections.BettingStats,
    key: { updatedAt: 1 },
    options: { name: "idx_updatedAt" },
    purpose:
      "Ops-alerts worker cursor: findChangedSince(updatedAt) — quét kỳ có stats đổi. Sort updatedAt ASC, IXSCAN.",
  },

  // ─────────────────────────────────────────
  // bingo18_draw_account_stats
  // ─────────────────────────────────────────
  {
    collection: Bingo18Collections.AccountStats,
    key: { drawId: 1, accountId: 1 },
    options: { unique: true, name: "idx_drawId_accountId_unique" },
    purpose:
      "Worker `$inc` upsert tích luỹ cược theo account/kỳ. Unique vừa bảo đảm 1 doc/(draw × " +
      "account), vừa là cơ chế idempotent: batch đã áp → filter `lastEntryId:{$lt}` không khớp " +
      "→ insert → 11000 = no-op (xem `DeltaAccumulatedDoc`). " +
      "Cũng phục vụ tra outstanding theo player/kỳ (link từ alert large_bet).",
  },
  {
    collection: Bingo18Collections.AccountStats,
    key: { drawId: 1, amount: -1 },
    options: { name: "idx_drawId_amount" },
    purpose:
      "Derive `topAccounts` lúc đọc: sort({amount:-1}).limit(topAccountsK) — THAY mảng top-K " +
      "trong stats doc vốn drift tỷ lệ thuận số người chơi. Chính xác tuyệt đối.",
  },
  {
    collection: Bingo18Collections.AccountStats,
    key: { createdAt: 1 },
    options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
    purpose: "TTL retention 90 ngày — cùng chuẩn Keno account stats (mongodb.mdc §7).",
  },

  // ─────────────────────────────────────────
  // bingo18_ops_alerts
  // ─────────────────────────────────────────
  {
    collection: Bingo18Collections.OpsAlerts,
    key: { status: 1, createdAt: -1 },
    options: { name: "idx_status_createdAt" },
    purpose: "List/count alert theo status (badge snapshot index-only count)",
  },
  {
    collection: Bingo18Collections.OpsAlerts,
    key: { drawId: 1, dedupeKey: 1 },
    options: { unique: true, name: "idx_drawId_dedupeKey_unique" },
    purpose: "Chống bắn trùng: 1 alert/(draw × dedupeKey), evaluator upsert idempotent",
  },
];

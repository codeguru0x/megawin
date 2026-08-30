import { MODULES } from "./modules";

const MODULE = MODULES.mega645;

export const mega645Keys = {
  /** Invalidate toàn bộ cache liên quan Mega 6/45 */
  all: [MODULE] as const,

  /** Cấu hình game toàn cục (global config) */
  config: [MODULE, "config"] as const,

  /** Danh sách cấu hình theo tenant */
  tenantConfigs: [MODULE, "tenant-configs"] as const,

  /** Kỳ quay hiện tại */
  currentDraw: [MODULE, "current-draw"] as const,

  /** Danh sách kỳ quay (có phân trang / filter) */
  draws: (params?: Record<string, unknown>) =>
    params ? ([MODULE, "draws", params] as const) : ([MODULE, "draws"] as const),

  /** Jackpot hiện tại */
  jackpotCurrent: [MODULE, "jackpot-current"] as const,

  /** Danh sách chu kỳ jackpot (có phân trang / filter) */
  jackpotCycles: (params?: Record<string, unknown>) =>
    params ? ([MODULE, "jackpot-cycles", params] as const) : ([MODULE, "jackpot-cycles"] as const),

  /** Tất cả cycle options cho selector dropdown (limit 10 mới nhất) */
  jackpotCycleOptions: [MODULE, "jackpot-cycle-options"] as const,

  /** Lịch sử draws trong 1 cycle cụ thể (cycle selector + phân trang) */
  jackpotHistoryByCycle: (params: { cycleNo: number; page: number; size: number }) =>
    [MODULE, "jackpot-history-by-cycle", params] as const,

  // ─── Operations Dashboard ──────────────────────────────────────────────────

  /**
   * Snapshot vận hành gộp (stats + top-K + alert count + exposure) — p0-03.
   * Nguồn cho timer 1 duy nhất (KPI + heatmap + topCombos + topAccounts + badge alert).
   */
  opsSnapshot: (drawId: string) => [MODULE, "ops-snapshot", drawId] as const,

  /** List alert 1 kỳ (on-demand khi mở panel), lọc theo status optional. */
  opsAlerts: (drawId: string, status?: string) =>
    status ? ([MODULE, "ops-alerts", drawId, status] as const) : ([MODULE, "ops-alerts", drawId] as const),

  /** Operations dashboard – live feed entries cho 1 kỳ quay */
  opsLiveEntries: (drawId: string) => [MODULE, "ops-live-entries", drawId] as const,

  /** Draw selector – danh sách các kỳ active + scheduled + recent (48h) */
  opsDrawSelector: [MODULE, "ops-draw-selector"] as const,

  /** Chi tiết 1 kỳ quay (full entity gồm result, financial, jackpot, stats) */
  drawDetail: (drawId: string) => [MODULE, "draw-detail", drawId] as const,

  /** Gợi ý mã kỳ Vietlott cho dialog công bố kết quả (P4) */
  vietlottSuggestion: (drawId: string) => [MODULE, "vietlott-suggestion", drawId] as const,

  /** Operations dashboard – winning entries của 1 kỳ quay (cursor-based) */
  opsWinningEntries: (drawId: string) => [MODULE, "ops-winning-entries", drawId] as const,

  // ─── Financial Reports ─────────────────────────────────────────────────────

  /** Summary KPI draw list (date range) */
  reportDrawsSummary: (params: { from: string; to: string }) => [MODULE, "report-draws-summary", params] as const,

  /** Danh sách kỳ quay đã settle (phân trang) */
  reportDraws: (params: { from: string; to: string; page: number }) => [MODULE, "report-draws", params] as const,

  /** Danh sách tenant của 1 kỳ quay đã settle */
  reportDrawTenants: (drawId: string) => [MODULE, "report-draw-tenants", drawId] as const,

  /** Danh sách tenant tổng hợp (date range) */
  reportTenants: (params: { from: string; to: string }) => [MODULE, "report-tenants", params] as const,

  /** Danh sách kỳ quay của 1 tenant (date range) */
  reportTenantDraws: (params: { tenantId: string; from: string; to: string }) =>
    [MODULE, "report-tenant-draws", params] as const,

  /** Player breakdown của 1 tenant trong 1 kỳ quay */
  reportPlayers: (params: { drawId: string; tenantId: string }) => [MODULE, "report-players", params] as const,

  /** Entry list của 1 player trong 1 kỳ quay */
  reportEntries: (params: { drawId: string; tenantId: string; accountId: string }) =>
    [MODULE, "report-entries", params] as const,

  /** Chi tiết 1 entry theo entryId — dùng cho dialog jackpot winner detail */
  reportEntryById: (entryId: string) => [MODULE, "report-entry", entryId] as const,

  // ─── Outstanding ───────────────────────────────────────────────────────────

  /** Invalidate toàn bộ outstanding (draws + tenants + players + entries) */
  outstanding: [MODULE, "outstanding"] as const,

  /** Level 1: danh sách draws outstanding (live, refetch 60s) */
  outstandingDraws: [MODULE, "outstanding", "draws"] as const,

  /** Level 2: tenant breakdown của 1 draw */
  outstandingTenants: (drawId: string) => [MODULE, "outstanding", "tenants", { drawId }] as const,

  /** Level 3: player breakdown của 1 draw × 1 tenant */
  outstandingPlayers: (p: { drawId: string; tenantId: string }) => [MODULE, "outstanding", "players", p] as const,

  /** Level 4: entries của 1 draw × 1 tenant × 1 player */
  outstandingEntries: (p: { drawId: string; tenantId: string; accountId: string }) =>
    [MODULE, "outstanding", "entries", p] as const,

  // ─── Void Reports ──────────────────────────────────────────────────────────

  /** Kỳ quay đã void (date range) */
  voidReports: (params: { from: string; to: string }) => [MODULE, "void-reports", params] as const,

  // ─── Void Reports (drill-down) ─────────────────────────────────────────────

  /** Level 2: tenant breakdown của 1 draw void */
  voidDrawTenants: (drawId: string) => [MODULE, "void", "tenants", { drawId }] as const,

  /** Level 3: player breakdown của 1 draw × 1 tenant void */
  voidTenantPlayers: (p: { drawId: string; tenantId: string }) => [MODULE, "void", "players", p] as const,

  /** Level 4: entries void của 1 draw × 1 tenant × 1 player */
  voidPlayerEntries: (p: { drawId: string; tenantId: string; accountId: string }) =>
    [MODULE, "void", "entries", p] as const,
};

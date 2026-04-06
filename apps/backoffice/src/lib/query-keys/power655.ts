import { MODULES } from "./modules";

const MODULE = MODULES.power655;

export const power655Keys = {
  /** Invalidate toàn bộ cache liên quan Power 6/55 */
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

  /** Chi tiết 1 kỳ quay (dùng cho operations dashboard) */
  drawDetail: (drawId: string) => [MODULE, "draw-detail", drawId] as const,

  /** Jackpot hiện tại */
  jackpotCurrent: [MODULE, "jackpot-current"] as const,

  /** Danh sách cycle options cho selector "Lịch sử Jackpot" (tối đa 10 vòng). */
  jackpotCycleOptions: [MODULE, "jackpot-cycle-options"] as const,

  /** Lịch sử jackpot theo cycle (có phân trang). */
  jackpotHistoryByCycle: (params: Record<string, unknown>) =>
    [MODULE, "jackpot-history-by-cycle", params] as const,

  /** Danh sách chu kỳ jackpot (có phân trang / filter) */
  jackpotCycles: (params?: Record<string, unknown>) =>
    params ? ([MODULE, "jackpot-cycles", params] as const) : ([MODULE, "jackpot-cycles"] as const),

  // ─── Operations Dashboard ─────────────────────────────────────────────────

  /** Dropdown chọn kỳ quay trên trang vận hành. */
  opsDrawSelector: [MODULE, "ops-draw-selector"] as const,

  /** KPI tổng hợp theo financialDate / drawId. */
  opsSummary: (params: Record<string, unknown>) => [MODULE, "ops-summary", params] as const,

  /** Phân tích theo đại lý. */
  opsTenantBreakdown: (params: Record<string, unknown>) =>
    [MODULE, "ops-tenant-breakdown", params] as const,

  /** Tần suất số cược. */
  opsNumberFrequency: (params: Record<string, unknown>) =>
    [MODULE, "ops-number-frequency", params] as const,

  /** Phân bổ kiểu chơi. */
  opsPlayTypeDistribution: (params: Record<string, unknown>) =>
    [MODULE, "ops-playtype-distribution", params] as const,

  /** Live feed entries (refetch 30s khi kỳ đang bán). */
  opsLiveEntries: (drawId: string) => [MODULE, "ops-live-entries", drawId] as const,

  /** Top combos (bộ số phổ biến nhất). */
  opsTopCombos: (drawId: string) => [MODULE, "ops-top-combos", drawId] as const,

  /** Danh sách entries trúng thưởng. */
  opsWinningEntries: (drawId: string) => [MODULE, "ops-winning-entries", drawId] as const,

  // ─── Financial Reports ─────────────────────────────────────────────────────

  /** Summary KPI draw list (date range) */
  reportDrawsSummary: (params: { from: string; to: string }) =>
    [MODULE, "report-draws-summary", params] as const,

  /** Danh sách kỳ quay đã settle (phân trang) */
  reportDraws: (params: { from: string; to: string; page: number }) =>
    [MODULE, "report-draws", params] as const,

  /** Danh sách tenant của 1 kỳ quay đã settle */
  reportDrawTenants: (drawId: string) => [MODULE, "report-draw-tenants", drawId] as const,

  /** Danh sách tenant tổng hợp (date range) */
  reportTenants: (params: { from: string; to: string }) =>
    [MODULE, "report-tenants", params] as const,

  /** Danh sách kỳ quay của 1 tenant (date range) */
  reportTenantDraws: (params: { tenantId: string; from: string; to: string }) =>
    [MODULE, "report-tenant-draws", params] as const,

  /** Player breakdown của 1 tenant trong 1 kỳ quay */
  reportPlayers: (params: { drawId: string; tenantId: string }) =>
    [MODULE, "report-players", params] as const,

  /** Entry list của 1 player trong 1 kỳ quay */
  reportEntries: (params: { drawId: string; tenantId: string; accountId: string }) =>
    [MODULE, "report-entries", params] as const,

  /** Chi tiết 1 entry theo entryId — dùng cho dialog jackpot winner detail */
  reportEntryById: (entryId: string) => [MODULE, "report-entry", entryId] as const,

  // ─── Outstanding ───────────────────────────────────────────────────────────

  /**
   * Prefix key cho toàn bộ outstanding.
   * Dùng để invalidate tất cả: `qc.invalidateQueries({ queryKey: power655Keys.outstanding })`.
   */
  outstanding: [MODULE, "outstanding"] as const,

  /** Level 1: danh sách draws outstanding (live, refetch 60s). */
  outstandingDraws: [MODULE, "outstanding", "draws"] as const,

  /** Level 2: tenant breakdown của 1 draw outstanding. */
  outstandingTenants: (drawId: string) => [MODULE, "outstanding", "tenants", { drawId }] as const,

  /** Level 3: player breakdown của 1 draw × 1 tenant outstanding. */
  outstandingPlayers: (p: { drawId: string; tenantId: string }) =>
    [MODULE, "outstanding", "players", p] as const,

  /** Level 4: entries của 1 draw × 1 tenant × 1 player outstanding. */
  outstandingEntries: (p: { drawId: string; tenantId: string; accountId: string }) =>
    [MODULE, "outstanding", "entries", p] as const,

  // ─── Void Reports ──────────────────────────────────────────────────────────

  /** Kỳ quay đã void (date range) */
  voidReports: (params: { from: string; to: string }) => [MODULE, "void-reports", params] as const,

  // ─── Void Reports (drill-down) ─────────────────────────────────────────────

  /** Level 2: tenant breakdown của 1 draw void */
  voidDrawTenants: (drawId: string) => [MODULE, "void", "tenants", { drawId }] as const,

  /** Level 3: player breakdown của 1 draw × 1 tenant void */
  voidTenantPlayers: (p: { drawId: string; tenantId: string }) =>
    [MODULE, "void", "players", p] as const,

  /** Level 4: entries void của 1 draw × 1 tenant × 1 player */
  voidPlayerEntries: (p: { drawId: string; tenantId: string; accountId: string }) =>
    [MODULE, "void", "entries", p] as const,
};

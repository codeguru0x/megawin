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

  /** Lịch sử jackpot (có phân trang / filter) */
  jackpotHistory: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "jackpot-history", params] as const)
      : ([MODULE, "jackpot-history"] as const),

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
};

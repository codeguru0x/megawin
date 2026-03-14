import { MODULES } from "./modules";

const MODULE = MODULES.bingo18;

export const bingo18Keys = {
  /** Invalidate toàn bộ cache liên quan Bingo 18 */
  all: [MODULE] as const,

  /** Cấu hình game toàn cục */
  config: [MODULE, "config"] as const,

  /** Danh sách cấu hình theo tenant */
  tenantConfigs: [MODULE, "tenant-configs"] as const,

  /** Kỳ quay hiện tại (active draws) */
  currentDraw: [MODULE, "current-draw"] as const,

  /** Danh sách kỳ quay (có phân trang / filter) */
  draws: (params?: Record<string, unknown>) =>
    params ? ([MODULE, "draws", params] as const) : ([MODULE, "draws"] as const),

  // ─── Operations Dashboard ──────────────────────────────────────────────────

  /** Draw selector – danh sách kỳ active + upcoming + recent */
  opsDrawSelector: [MODULE, "ops-draw-selector"] as const,

  /** Chi tiết 1 kỳ quay (full entity: result, financial, stats) */
  drawDetail: (drawId: string) => [MODULE, "draw-detail", drawId] as const,

  /** Operations dashboard – summary KPI */
  opsSummary: (params?: Record<string, unknown>) =>
    params ? ([MODULE, "ops-summary", params] as const) : ([MODULE, "ops-summary"] as const),

  /** Operations dashboard – tenant breakdown */
  opsTenantBreakdown: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "ops-tenant-breakdown", params] as const)
      : ([MODULE, "ops-tenant-breakdown"] as const),

  /** Operations dashboard – dice frequency (histogram 6 mặt xúc xắc) */
  opsDiceFrequency: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "ops-dice-frequency", params] as const)
      : ([MODULE, "ops-dice-frequency"] as const),

  /** Operations dashboard – play type distribution */
  opsPlayTypeDistribution: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "ops-playtype-dist", params] as const)
      : ([MODULE, "ops-playtype-dist"] as const),

  /** Operations dashboard – live feed entries cho 1 kỳ quay */
  opsLiveEntries: (drawId: string) => [MODULE, "ops-live-entries", drawId] as const,

  /** Operations dashboard – top combos cho 1 kỳ quay */
  opsTopCombos: (drawId: string) => [MODULE, "ops-top-combos", drawId] as const,

  /** Operations dashboard – winning entries của 1 kỳ quay */
  opsWinningEntries: (drawId: string, cursor: string) =>
    [MODULE, "ops-winning-entries", drawId, cursor] as const,
};

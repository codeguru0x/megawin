import { MODULES } from "./modules";

const MODULE = MODULES["max3dpro"];

export const max3dproKeys = {
  /** Invalidate toàn bộ cache liên quan Max 3D Pro */
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

  /** Chi tiết 1 kỳ quay (full entity gồm result, financial, stats) */
  drawDetail: (drawId: string) => [MODULE, "draw-detail", drawId] as const,

  /** Operations dashboard – draw selector dropdown */
  opsDrawSelector: [MODULE, "ops-draw-selector"] as const,

  /** Operations dashboard – summary KPI */
  opsSummary: (params?: Record<string, unknown>) =>
    params ? ([MODULE, "ops-summary", params] as const) : ([MODULE, "ops-summary"] as const),

  /** Operations dashboard – tenant breakdown */
  opsTenantBreakdown: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "ops-tenant-breakdown", params] as const)
      : ([MODULE, "ops-tenant-breakdown"] as const),

  /** Operations dashboard – triplet frequency */
  opsTripletFrequency: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "ops-triplet-frequency", params] as const)
      : ([MODULE, "ops-triplet-frequency"] as const),

  /** Operations dashboard – play type distribution */
  opsPlayTypeDistribution: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "ops-playtype-dist", params] as const)
      : ([MODULE, "ops-playtype-dist"] as const),

  /** Operations dashboard – live feed entries cho 1 kỳ quay */
  opsLiveEntries: (drawId: string) => [MODULE, "ops-live-entries", drawId] as const,

  /** Operations dashboard – top combos cho 1 kỳ quay */
  opsTopCombos: (drawId: string) => [MODULE, "ops-top-combos", drawId] as const,

  /** Operations dashboard – winning entries của 1 kỳ quay (cursor-based) */
  opsWinningEntries: (drawId: string, cursor: string) =>
    [MODULE, "ops-winning-entries", drawId, cursor] as const,
};

import { MODULES } from "./modules";

const MODULE = MODULES.lotto535;

export const lotto535Keys = {
  /** Invalidate toàn bộ cache liên quan Lotto 5/35 */
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

  /** Lịch sử jackpot (có phân trang / filter) */
  jackpotHistory: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "jackpot-history", params] as const)
      : ([MODULE, "jackpot-history"] as const),

  /** Danh sách chu kỳ jackpot (có phân trang / filter) */
  jackpotCycles: (params?: Record<string, unknown>) =>
    params ? ([MODULE, "jackpot-cycles", params] as const) : ([MODULE, "jackpot-cycles"] as const),

  /** Operations dashboard – summary KPI */
  opsSummary: (params?: Record<string, unknown>) =>
    params ? ([MODULE, "ops-summary", params] as const) : ([MODULE, "ops-summary"] as const),

  /** Operations dashboard – tenant breakdown */
  opsTenantBreakdown: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "ops-tenant-breakdown", params] as const)
      : ([MODULE, "ops-tenant-breakdown"] as const),

  /** Operations dashboard – number frequency */
  opsNumberFrequency: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "ops-number-frequency", params] as const)
      : ([MODULE, "ops-number-frequency"] as const),

  /** Operations dashboard – play type distribution */
  opsPlayTypeDistribution: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "ops-playtype-dist", params] as const)
      : ([MODULE, "ops-playtype-dist"] as const),
};

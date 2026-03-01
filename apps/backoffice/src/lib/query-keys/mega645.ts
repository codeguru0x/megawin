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
    params
      ? ([MODULE, "draws", params] as const)
      : ([MODULE, "draws"] as const),

  /** Jackpot hiện tại */
  jackpotCurrent: [MODULE, "jackpot-current"] as const,

  /** Lịch sử jackpot (có phân trang / filter) */
  jackpotHistory: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "jackpot-history", params] as const)
      : ([MODULE, "jackpot-history"] as const),

  /** Danh sách chu kỳ jackpot (có phân trang / filter) */
  jackpotCycles: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "jackpot-cycles", params] as const)
      : ([MODULE, "jackpot-cycles"] as const),
};

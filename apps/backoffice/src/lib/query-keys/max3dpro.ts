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
    params
      ? ([MODULE, "draws", params] as const)
      : ([MODULE, "draws"] as const),
};

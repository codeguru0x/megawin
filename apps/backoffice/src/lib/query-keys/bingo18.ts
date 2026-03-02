import { MODULES } from "./modules";

const MODULE = MODULES.bingo18;

export const bingo18Keys = {
  all: [MODULE] as const,

  config: [MODULE, "config"] as const,

  tenantConfigs: [MODULE, "tenant-configs"] as const,

  currentDraw: [MODULE, "current-draw"] as const,

  draws: (params?: Record<string, unknown>) =>
    params
      ? ([MODULE, "draws", params] as const)
      : ([MODULE, "draws"] as const),
};

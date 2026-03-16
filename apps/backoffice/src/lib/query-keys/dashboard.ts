import { MODULES } from "./modules";

const MODULE = MODULES.dashboard;

/**
 * Query keys cho Dashboard page.
 *
 * Naming convention: [module, "sub-key", params?] as const
 */
export const dashboardKeys = {
  all: [MODULE] as const,

  /** KPI + per-game data cho 1 ngày tài chính (+ optional compare date). */
  kpis: (fd: string) => [MODULE, "kpis", fd] as const,

  /** Revenue trend chart cho date range N ngày. */
  trend: (params: { from: string; to: string }) => [MODULE, "trend", params] as const,

  /** Jackpot pool hiện tại cho 3 game có jackpot (live). */
  jackpots: [MODULE, "jackpots"] as const,

  /** Draw timeline — settling / settled / upcoming (live, refetch 30s). */
  draws: [MODULE, "draws"] as const,
} as const;

/**
 * Centralized React Query Key Factory
 *
 * Quản lý tất cả query keys cho backoffice app tại 1 nơi duy nhất.
 * Tránh trùng key khi cùng 1 API được gọi ở nhiều nơi.
 *
 * Usage:
 *   import { queryKeys } from "@/lib/query-keys";
 *   useQuery({ queryKey: queryKeys.lotto535.currentDraw, ... });
 *   qc.invalidateQueries({ queryKey: queryKeys.lotto535.all });
 */

// ─────────────────────────────────────────────
// Lotto 5/35
// ─────────────────────────────────────────────

export const lotto535Keys = {
  all: ["lotto535"] as const,
  config: ["lotto535", "config"] as const,
  tenantConfigs: ["lotto535", "tenant-configs"] as const,
  currentDraw: ["lotto535", "current-draw"] as const,
  draws: (params?: Record<string, unknown>) =>
    params
      ? (["lotto535", "draws", params] as const)
      : (["lotto535", "draws"] as const),
  jackpotCurrent: ["lotto535", "jackpot-current"] as const,
  jackpotHistory: (params?: Record<string, unknown>) =>
    params
      ? (["lotto535", "jackpot-history", params] as const)
      : (["lotto535", "jackpot-history"] as const),
  jackpotCycles: (params?: Record<string, unknown>) =>
    params
      ? (["lotto535", "jackpot-cycles", params] as const)
      : (["lotto535", "jackpot-cycles"] as const),
};

// ─────────────────────────────────────────────
// Keno
// ─────────────────────────────────────────────

export const kenoKeys = {
  all: ["keno"] as const,
  config: ["keno", "config"] as const,
  tenantConfigs: ["keno", "tenant-configs"] as const,
  currentDraw: ["keno", "current-draw"] as const,
  draws: (params?: Record<string, unknown>) =>
    params
      ? (["keno", "draws", params] as const)
      : (["keno", "draws"] as const),
};

// ─────────────────────────────────────────────
// Aggregate export
// ─────────────────────────────────────────────

export const queryKeys = {
  lotto535: lotto535Keys,
  keno: kenoKeys,
} as const;

"use client";

/**
 * Mega 6/45 Draws page — client-side hooks
 *
 * useCurrentDraw: kỳ đang active (refetch 15s).
 * useDrawsList: danh sách kỳ quay có filter + offset pagination.
 *
 * Mega 6/45 dùng offset pagination (page/size), khác với lotto535 dùng cursor.
 */

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import type { DrawStatus } from "@megawin/game-core/entities";
import type {
  CurrentDrawInfo,
  GetCurrentDrawOutput,
  DrawSummary,
  ListDrawsOutput,
} from "@megawin/game-mega645-application/use-cases/draws";
import { mega645Keys } from "@/lib/query-keys";

export type { CurrentDrawInfo, DrawSummary };

export interface ListDrawsParams {
  status?: DrawStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  size?: number;
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/** Kỳ đang active — refetch tự động mỗi 15s. */
export function useCurrentDraw() {
  return useQuery({
    queryKey: mega645Keys.currentDraw,
    queryFn: () => apiClient.get<GetCurrentDrawOutput>("/mega645/draws/current"),
    refetchInterval: 15_000,
  });
}

/** Danh sách kỳ quay có filter + offset pagination. */
export function useDrawsList(params: ListDrawsParams) {
  return useQuery({
    queryKey: mega645Keys.draws(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListDrawsOutput>("/mega645/draws", {
        params: {
          status: params.status,
          fromDate: params.fromDate,
          toDate: params.toDate,
          page: params.page,
          size: params.size,
        },
      }),
  });
}

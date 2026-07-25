"use client";

/**
 * Power 6/55 — Draws page hooks.
 *
 * Chỉ bao gồm các query cần thiết cho trang Kỳ quay (read-only).
 * Các mutations (open-sales, close-sales, publish-result, ...) đã chuyển
 * sang trang Vận hành (operations page).
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type {
  DrawSummary,
  GetCurrentDrawOutput,
  ListDrawsOutput,
} from "@megawin/game-power655-application/use-cases/draws";
import { apiClient } from "@megawin/next/client";
import { useQuery } from "@tanstack/react-query";

import { power655Keys } from "@/lib/query-keys";

export type { DrawSummary };

export interface ListDrawsParams {
  status?: DrawStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  size?: number;
}

export function useCurrentDraw() {
  return useQuery({
    queryKey: power655Keys.currentDraw,
    queryFn: () => apiClient.get<GetCurrentDrawOutput>("/power655/draws/current"),
    refetchInterval: 15_000,
  });
}

export function useDrawsList(params: ListDrawsParams) {
  return useQuery({
    queryKey: power655Keys.draws(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListDrawsOutput>("/power655/draws", {
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

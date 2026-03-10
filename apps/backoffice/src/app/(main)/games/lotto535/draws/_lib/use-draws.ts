"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import type { DrawStatus } from "@megawin/game-core/entities";
import type {
  CurrentDrawInfo,
  GetCurrentDrawOutput,
  DrawSummary,
  ListDrawsOutput,
} from "@megawin/game-lotto535-application/use-cases/draws";
import { lotto535Keys } from "@/lib/query-keys";

export type { CurrentDrawInfo, DrawSummary };

export interface ListDrawsParams {
  status?: DrawStatus;
  fromDate?: string;
  toDate?: string;
  cursor?: string;
  size?: number;
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

export function useCurrentDraw() {
  return useQuery({
    queryKey: lotto535Keys.currentDraw,
    queryFn: () => apiClient.get<GetCurrentDrawOutput>("/lotto535/draws/current"),
    refetchInterval: 15_000,
  });
}

export function useDrawsList(params: ListDrawsParams) {
  return useQuery({
    queryKey: lotto535Keys.draws(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListDrawsOutput>("/lotto535/draws", {
        params: {
          status: params.status,
          fromDate: params.fromDate,
          toDate: params.toDate,
          cursor: params.cursor,
          size: params.size,
        },
      }),
  });
}

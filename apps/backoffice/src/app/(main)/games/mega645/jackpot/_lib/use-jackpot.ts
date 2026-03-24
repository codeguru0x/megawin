"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { Pagination } from "@megawin/shared/constants";
import { mega645Keys } from "@/lib/query-keys";
import type {
  GetJackpotCurrentOutput,
  ListJackpotHistoryOutput,
  ListJackpotCyclesOutput,
} from "@megawin/game-mega645-application/use-cases/jackpot";

export type { GetJackpotCurrentOutput, ListJackpotHistoryOutput, ListJackpotCyclesOutput };
export type {
  JackpotHistoryItem,
  JackpotCycleSummary,
  JackpotWinnerSummary,
} from "@megawin/game-mega645-application/use-cases/jackpot";

export function useJackpotCurrent() {
  return useQuery({
    queryKey: mega645Keys.jackpotCurrent,
    queryFn: () => apiClient.get<GetJackpotCurrentOutput>("/mega645/jackpot/current"),
    refetchInterval: 30_000,
  });
}

export interface JackpotHistoryParams {
  page: number;
}

export function useJackpotHistory(params: JackpotHistoryParams) {
  return useQuery({
    queryKey: mega645Keys.jackpotHistory(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListJackpotHistoryOutput>("/mega645/jackpot", {
        params: { page: params.page, size: Pagination.Default.Size },
      }),
  });
}

export interface JackpotCyclesParams {
  page: number;
}

export function useJackpotCycles(params: JackpotCyclesParams) {
  return useQuery({
    queryKey: mega645Keys.jackpotCycles(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListJackpotCyclesOutput>("/mega645/jackpot/cycles", {
        params: { page: params.page, size: Pagination.Default.Size },
      }),
  });
}

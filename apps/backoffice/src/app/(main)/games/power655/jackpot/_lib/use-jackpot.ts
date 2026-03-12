"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { Pagination } from "@megawin/shared/constants/pagination";
import { power655Keys } from "@/lib/query-keys";
import type {
  GetJackpotCurrentOutput,
  ListJackpotHistoryOutput,
  ListJackpotCyclesOutput,
} from "@megawin/game-power655-application/use-cases/jackpot";

export type { GetJackpotCurrentOutput, ListJackpotHistoryOutput, ListJackpotCyclesOutput };
export type {
  JackpotHistoryItem,
  JackpotCycleSummary,
  JackpotWinnerSummary,
} from "@megawin/game-power655-application/use-cases/jackpot";

export function useJackpotCurrent() {
  return useQuery({
    queryKey: power655Keys.jackpotCurrent,
    queryFn: () => apiClient.get<GetJackpotCurrentOutput>("/power655/jackpot/current"),
    refetchInterval: 30_000,
  });
}

export interface JackpotHistoryParams {
  page: number;
}

export function useJackpotHistory(params: JackpotHistoryParams) {
  const size = Pagination.Default.Size;
  return useQuery({
    queryKey: power655Keys.jackpotHistory({ page: params.page, size }),
    queryFn: () =>
      apiClient.get<ListJackpotHistoryOutput>("/power655/jackpot", {
        params: { page: params.page, size },
      }),
  });
}

export interface JackpotCyclesParams {
  page: number;
}

export function useJackpotCycles(params: JackpotCyclesParams) {
  const size = Pagination.Default.Size;
  return useQuery({
    queryKey: power655Keys.jackpotCycles({ page: params.page, size }),
    queryFn: () =>
      apiClient.get<ListJackpotCyclesOutput>("/power655/jackpot/cycles", {
        params: { page: params.page, size },
      }),
  });
}

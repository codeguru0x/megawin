"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { lotto535Keys } from "@/lib/query-keys";
import type {
  GetJackpotCurrentOutput,
  ListJackpotHistoryOutput,
  ListJackpotCyclesOutput,
} from "@megawin/game-lotto535-application/use-cases/jackpot";

export type {
  GetJackpotCurrentOutput,
  ListJackpotHistoryOutput,
  ListJackpotCyclesOutput,
};
export type {
  JackpotHistoryItem,
  JackpotCycleSummary,
  JackpotWinnerSummary,
} from "@megawin/game-lotto535-application/use-cases/jackpot";

export function useJackpotCurrent() {
  return useQuery({
    queryKey: lotto535Keys.jackpotCurrent,
    queryFn: () =>
      apiClient.get<GetJackpotCurrentOutput>("/lotto535/jackpot/current"),
    refetchInterval: 30_000,
  });
}

export interface JackpotHistoryParams {
  page: number;
  size: number;
}

export function useJackpotHistory(params: JackpotHistoryParams) {
  return useQuery({
    queryKey: lotto535Keys.jackpotHistory(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListJackpotHistoryOutput>("/lotto535/jackpot", {
        params: { page: params.page, size: params.size },
      }),
  });
}

export interface JackpotCyclesParams {
  page: number;
  size: number;
}

export function useJackpotCycles(params: JackpotCyclesParams) {
  return useQuery({
    queryKey: lotto535Keys.jackpotCycles(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListJackpotCyclesOutput>("/lotto535/jackpot/cycles", {
        params: { page: params.page, size: params.size },
      }),
  });
}

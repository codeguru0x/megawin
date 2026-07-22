"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import type { DrawStatus } from "@megawin/game-core/entities";
import { bingo18Keys } from "@/lib/query-keys";

export interface CurrentDrawInfo {
  drawId: string;
  drawNo: number;
  drawDate: string;
  drawTime: string;
  status: string;
  sales: {
    openAt: string | null;
    closeAt: string;
  };
  result?: {
    numbers: number[];
    sum: number;
    publishedAt?: string;
  };
  stats?: {
    ticketEntryCount: number;
    totalSalesAmount: number;
  };
}

export interface Bingo18DrawSummary {
  id: string;
  drawId: string;
  drawNo: number;
  drawDate: string;
  financialDate?: string;
  drawTime: string;
  closeAt?: string;
  openAt?: string;
  status: string;
  hasResult: boolean;
  result?: {
    diceNumbers: number[];
    sum: number;
  };
  ticketEntryCount?: number;
  totalRevenue?: number;
  totalPayout?: number;
  financial?: {
    totalPrizes: number;
    totalAgentCommission: number;
    companyTake: number;
  };
}

interface GetCurrentDrawOutput {
  activeDraws: CurrentDrawInfo[];
}

interface ListDrawsOutput {
  draws: Bingo18DrawSummary[];
  page: number;
  size: number;
}

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

export function useBingo18CurrentDraw() {
  return useQuery({
    queryKey: bingo18Keys.currentDraw,
    queryFn: () => apiClient.get<GetCurrentDrawOutput>("/bingo18/draws/current"),
    refetchInterval: 15_000,
  });
}

export function useBingo18DrawsList(params: ListDrawsParams) {
  return useQuery({
    queryKey: bingo18Keys.draws(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListDrawsOutput>("/bingo18/draws", {
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

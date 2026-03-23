"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { dashboardKeys } from "@/lib/query-keys/dashboard";
import type { GetDashboardKpisOutput } from "@megawin/game-core-application/use-cases/reports";
import type { GetSystemOutstandingOutput } from "@megawin/game-core-application/use-cases/reports";
import type { GetDashboardJackpotsOutput } from "@/app/api/dashboard/jackpots/_lib/types";
import type { GetDashboardDrawsOutput } from "@/app/api/dashboard/draws/_lib/types";

/**
 * Fetch per-game settle data cho dashboard KPIs + Game Performance table.
 *
 * 1 query phục vụ Hero KPIs, Game Table, Game Mix donut, Payout Ratio.
 * fd và compareDate (optional) gộp thành $in query ở backend để tối thiểu round-trip.
 * staleTime = 5 phút — data đã settle không thay đổi (trừ ngày hôm nay đang chạy).
 */
export function useDashboardKpis(fd: string, compareDate?: string) {
  return useQuery({
    queryKey: dashboardKeys.kpis(fd),
    queryFn: () =>
      apiClient
        .get<GetDashboardKpisOutput>("/dashboard/kpis", {
          params: {
            fd,
            ...(compareDate ? { compare: compareDate } : {}),
          },
        })
        .then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: !!fd,
  });
}

/**
 * Fetch draw timeline — active / settled / scheduled (live, refetch mỗi 30s).
 *
 * Orchestrate 7 game draw repos. Keno + Bingo18 → summary gộp.
 * 5 game còn lại → events chi tiết với drawId thật từ DB.
 */
export function useDashboardDraws() {
  return useQuery({
    queryKey: dashboardKeys.draws,
    queryFn: () => apiClient.get<GetDashboardDrawsOutput>("/dashboard/draws"),
    refetchInterval: 30_000,
    staleTime: 0,
  });
}

/** Fetch jackpot pool hiện tại cho 3 game có jackpot (live, refetch mỗi 30s). */
export function useDashboardJackpots() {
  return useQuery({
    queryKey: dashboardKeys.jackpots,
    queryFn: () => apiClient.get<GetDashboardJackpotsOutput>("/dashboard/jackpots"),
    refetchInterval: 30_000,
    staleTime: 0,
  });
}

/**
 * Fetch outstanding system — tiền cược pending cross-game (live, refetch mỗi 30s).
 *
 * Trả SystemOutstandingGameDaily[] — 1 doc/game.
 * Client-side compute tổng + per-game % breakdown.
 */
export function useDashboardOutstanding() {
  return useQuery({
    queryKey: dashboardKeys.outstanding,
    queryFn: () =>
      apiClient.get<GetSystemOutstandingOutput>("/dashboard/outstanding").then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 0,
  });
}

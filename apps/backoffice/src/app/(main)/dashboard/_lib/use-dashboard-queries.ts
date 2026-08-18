"use client";

import type {
  GetDashboardKpisOutput,
  GetSystemOutstandingOutput,
} from "@megawin/game-core-application/use-cases/reports";
import { apiClient } from "@megawin/next/client";
import { useQuery } from "@tanstack/react-query";

import type { GetDashboardDrawsOutput } from "@/server/use-cases/draws/types";
import type { GetDashboardJackpotsOutput } from "@/app/api/dashboard/jackpots/_lib/types";
import { dashboardKeys } from "@/lib/query-keys/dashboard";

/**
 * Fetch per-game settle data cho dashboard KPIs + Game Performance table.
 *
 * Gộp todayFd + yesterdayFd + compareFd vào 1 query — backend xử lý $in.
 * refetchInterval = 2 phút cho dữ liệu hôm nay (partial, thay đổi liên tục khi settle).
 * yesterdayFd + compareFd cache lâu hơn (data đã đóng) nhưng gộp chung 1 request.
 */
export function useDashboardKpis(todayFd: string, yesterdayFd: string, compareFd: string) {
  return useQuery({
    queryKey: dashboardKeys.kpis(todayFd),
    queryFn: () =>
      apiClient
        .get<GetDashboardKpisOutput>("/dashboard/kpis", {
          params: {
            fd: todayFd,
            compare: [yesterdayFd, compareFd].join(","),
          },
        })
        .then((r) => r.data),
    // Data hôm nay thay đổi liên tục khi settle → refresh mỗi 2 phút
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60 * 1000,
    enabled: !!todayFd,
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
    queryFn: () => apiClient.get<GetSystemOutstandingOutput>("/dashboard/outstanding").then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 0,
  });
}

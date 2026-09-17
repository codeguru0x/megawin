"use client";

import type {
  GetDashboardKpisOutput,
  GetSystemOutstandingOutput,
} from "@megawin/game-core-application/use-cases/reports";
import { apiClient } from "@megawin/next/client";
import { noop, useQuery, type QueryClient } from "@tanstack/react-query";

import type { GetDashboardJackpotsOutput } from "@/app/api/dashboard/jackpots/_lib/types";
import { dashboardKeys } from "@/lib/query-keys/dashboard";
import type { GetDashboardDrawsOutput } from "@/server/use-cases/draws/types";

import { getDashboardFdRange } from "./use-dashboard-filters";

/** Payload KPI sau unwrap `{ data }` — đúng shape mà `useDashboardKpis` trả cho UI. */
export type DashboardKpisData = GetDashboardKpisOutput["data"];

/** Payload outstanding dashboard sau unwrap `{ data }`. */
export type DashboardOutstandingData = GetSystemOutstandingOutput["data"];

/** staleTime KPI hôm nay — dùng chung cho useQuery và prefetch (p1-02). */
export const DASHBOARD_KPI_STALE_MS = 60 * 1000;

/** refetchInterval KPI hôm nay. */
export const DASHBOARD_KPI_REFETCH_MS = 2 * 60 * 1000;

/** refetchInterval live widgets (draws / jackpots / outstanding). */
export const DASHBOARD_LIVE_REFETCH_MS = 30_000;

/**
 * Fetch per-game settle data cho dashboard KPIs + Game Performance table.
 *
 * Gộp todayFd + yesterdayFd + compareFd vào 1 query — backend xử lý $in.
 * Unwrap `{ data }` — khớp shape cũ của `useDashboardKpis` (UI nhận mảng raw).
 */
export async function fetchDashboardKpis(
  todayFd: string,
  yesterdayFd: string,
  compareFd: string,
): Promise<DashboardKpisData> {
  const result = await apiClient.get<GetDashboardKpisOutput>("/dashboard/kpis", {
    params: {
      fd: todayFd,
      compare: [yesterdayFd, compareFd].join(","),
    },
  });
  return result.data;
}

/**
 * Fetch draw timeline — active / settled / scheduled.
 *
 * Orchestrate 7 game draw repos. Keno + Bingo18 → summary gộp.
 * 5 game còn lại → events chi tiết với drawId thật từ DB.
 */
export function fetchDashboardDraws(): Promise<GetDashboardDrawsOutput> {
  return apiClient.get<GetDashboardDrawsOutput>("/dashboard/draws");
}

/** Fetch jackpot pool hiện tại cho 3 game có jackpot. */
export function fetchDashboardJackpots(): Promise<GetDashboardJackpotsOutput> {
  return apiClient.get<GetDashboardJackpotsOutput>("/dashboard/jackpots");
}

/**
 * Fetch outstanding system — tiền cược pending cross-game.
 *
 * Unwrap `{ data }` — khớp shape cũ của `useDashboardOutstanding`.
 */
export async function fetchDashboardOutstanding(): Promise<DashboardOutstandingData> {
  const result = await apiClient.get<GetSystemOutstandingOutput>("/dashboard/outstanding");
  return result.data;
}

/**
 * Prefetch 4 query Dashboard — KPI (stale 60s) + 3 live widget (stale 0).
 * Fd range khớp `useDashboardFilters` / `getDashboardFdRange`.
 */
export function prefetchDashboardQueries(qc: QueryClient): void {
  const { todayFd, yesterdayFd, compareFd } = getDashboardFdRange();

  void qc
    .query({
      queryKey: dashboardKeys.kpis(todayFd),
      queryFn: () => fetchDashboardKpis(todayFd, yesterdayFd, compareFd),
      staleTime: DASHBOARD_KPI_STALE_MS,
    })
    .catch(noop);
  void qc
    .query({
      queryKey: dashboardKeys.draws,
      queryFn: fetchDashboardDraws,
      staleTime: 0,
    })
    .catch(noop);
  void qc
    .query({
      queryKey: dashboardKeys.jackpots,
      queryFn: fetchDashboardJackpots,
      staleTime: 0,
    })
    .catch(noop);
  void qc
    .query({
      queryKey: dashboardKeys.outstanding,
      queryFn: fetchDashboardOutstanding,
      staleTime: 0,
    })
    .catch(noop);
}

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
    queryFn: () => fetchDashboardKpis(todayFd, yesterdayFd, compareFd),
    // Data hôm nay thay đổi liên tục khi settle → refresh mỗi 2 phút
    refetchInterval: DASHBOARD_KPI_REFETCH_MS,
    staleTime: DASHBOARD_KPI_STALE_MS,
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
    queryFn: fetchDashboardDraws,
    refetchInterval: DASHBOARD_LIVE_REFETCH_MS,
    staleTime: 0,
  });
}

/** Fetch jackpot pool hiện tại cho 3 game có jackpot (live, refetch mỗi 30s). */
export function useDashboardJackpots() {
  return useQuery({
    queryKey: dashboardKeys.jackpots,
    queryFn: fetchDashboardJackpots,
    refetchInterval: DASHBOARD_LIVE_REFETCH_MS,
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
    queryFn: fetchDashboardOutstanding,
    refetchInterval: DASHBOARD_LIVE_REFETCH_MS,
    staleTime: 0,
  });
}

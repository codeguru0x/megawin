"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { dashboardKeys } from "@/lib/query-keys/dashboard";
import type { GetDashboardKpisOutput } from "@megawin/game-core-application/use-cases/reports";
import type { GetDashboardJackpotsOutput } from "@/app/api/dashboard/jackpots/_lib/types";
import type { GetDashboardDrawsOutput } from "@/app/api/dashboard/draws/route";

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
 * Fetch draw timeline — settling / settled / upcoming (live, refetch mỗi 30s).
 *
 * Kết hợp system outstanding (đang settle) + upcoming draw schedule.
 * Dùng cho DrawTimeline card ở Zone 6.
 */
export function useDashboardDraws() {
  return useQuery({
    queryKey: dashboardKeys.draws,
    queryFn: () => apiClient.get<GetDashboardDrawsOutput>("/dashboard/draws"),
    refetchInterval: 30_000,
    staleTime: 0,
  });
}
export function useDashboardJackpots() {
  return useQuery({
    queryKey: dashboardKeys.jackpots,
    queryFn: () => apiClient.get<GetDashboardJackpotsOutput>("/dashboard/jackpots"),
    refetchInterval: 30_000,
    staleTime: 0,
  });
}

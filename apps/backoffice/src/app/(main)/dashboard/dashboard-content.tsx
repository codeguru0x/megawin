"use client";

import { LayoutDashboard, LoaderCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { dashboardKeys } from "@/lib/query-keys/dashboard";
import { useDashboardFilters } from "./_lib/use-dashboard-filters";
import {
  useDashboardKpis,
  useDashboardJackpots,
  useDashboardDraws,
  useDashboardOutstanding,
} from "./_lib/use-dashboard-queries";
import { computeDayKpis } from "./_lib/compute";
import { HeroKpis } from "./_components/hero-kpis";
import { JackpotPools } from "./_components/jackpot-pools";
import { OutstandingStrip } from "./_components/outstanding-strip";
import { GameOverview, PayoutRatioChart } from "./_components/game-performance";
import { DrawTimeline } from "./_components/draw-timeline";
import { HeroKpisSkeleton } from "./_components/skeletons";

/**
 * DashboardContent — Client Component chính của trang dashboard.
 *
 * Phương án C — today-only monitoring:
 * - Hero KPIs: hôm nay (live) + hôm qua (đã đóng) + trend vs cùng thứ tuần trước
 * - Outstanding / Jackpot / Draws: live data (refetch 30s)
 * - Game Performance / Payout Ratio: dữ liệu hôm nay
 * - KHÔNG có date picker — dashboard = "what's happening now"
 *
 * Refresh: live dot bên cạnh subtitle = clickable.
 * Click → invalidate all queries. Đang fetch → dot chuyển thành spinner.
 * Fetch xong → trở lại pulse animation. Không cần button riêng.
 */
export function DashboardContent() {
  const qc = useQueryClient();
  const { todayFd, yesterdayFd, compareFd } = useDashboardFilters();

  const kpisQuery = useDashboardKpis(todayFd, yesterdayFd, compareFd);
  const jackpotsQuery = useDashboardJackpots();
  const drawsQuery = useDashboardDraws();
  const outstandingQuery = useDashboardOutstanding();

  // Compute KPIs cho 3 ngày từ cùng 1 response
  const todayKpis = kpisQuery.data ? computeDayKpis(kpisQuery.data, todayFd) : undefined;
  const yesterdayKpis = kpisQuery.data ? computeDayKpis(kpisQuery.data, yesterdayFd) : undefined;
  const compareKpis = kpisQuery.data ? computeDayKpis(kpisQuery.data, compareFd) : undefined;

  const isAnyFetching =
    kpisQuery.isFetching ||
    jackpotsQuery.isFetching ||
    drawsQuery.isFetching ||
    outstandingQuery.isFetching;

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: dashboardKeys.all });
  }

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-indigo-600 shadow-sm">
          <LayoutDashboard className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Dashboard</h1>
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-muted-foreground">Tổng quan hệ thống</p>
            {/* Live dot — click để force refresh, đang fetch → spinner */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isAnyFetching}
                  className="group relative flex size-4 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-125 disabled:cursor-default disabled:hover:scale-100"
                >
                  {isAnyFetching ? (
                    <LoaderCircle className="size-3 animate-spin text-emerald-500" />
                  ) : (
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 group-hover:opacity-100" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {isAnyFetching ? "Đang cập nhật..." : "Nhấn để làm mới dữ liệu"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* ── Zone 1: Hero KPI Cards ──────────────────────────────────── */}
      {kpisQuery.isLoading ? (
        <HeroKpisSkeleton />
      ) : (
        todayKpis && (
          <HeroKpis
            todayKpis={todayKpis}
            yesterdayKpis={yesterdayKpis}
            compareKpis={compareKpis}
            isLoading={false}
          />
        )
      )}

      {/* ── Zone 2: Outstanding Strip (LIVE) ─────────────────────── */}
      <OutstandingStrip data={outstandingQuery.data} isLoading={outstandingQuery.isLoading} />

      {/* ── Zone 3: Jackpot Pools ───────────────────────────────────── */}
      <JackpotPools data={jackpotsQuery.data} isLoading={jackpotsQuery.isLoading} />

      {/* ── Zone 4: Tỷ lệ trả thưởng (1/3) + Hiệu suất game (2/3) ── */}
      {/* Chỉ render grid khi có dữ liệu — tránh gap trống giữa Jackpot và Lịch quay */}
      {todayKpis && todayKpis.byGame.length > 0 && todayKpis.totalStake > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-1">
            <PayoutRatioChart kpis={todayKpis} isLoading={kpisQuery.isLoading} />
          </div>
          <div className="xl:col-span-2">
            <GameOverview kpis={todayKpis} isLoading={kpisQuery.isLoading} />
          </div>
        </div>
      )}

      {/* ── Zone 5: Lịch quay số — full width, multi-column ────────── */}
      <DrawTimeline data={drawsQuery.data} isLoading={drawsQuery.isLoading} />
    </div>
  );
}

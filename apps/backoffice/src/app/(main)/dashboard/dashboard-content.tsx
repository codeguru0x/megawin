"use client";

import { LayoutDashboard, RefreshCw } from "lucide-react";
import { format, subDays } from "date-fns";
import { vi } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { FinancialDatePicker } from "@/components/date-picker";

/**
 * DashboardContent — Client Component chính của trang dashboard.
 *
 * Quản lý filter state (nuqs), orchestrate React Query hooks, layout 6 zones.
 * financialDate persist trên URL — hard refresh vẫn xem đúng ngày đã chọn.
 */
export function DashboardContent() {
  const qc = useQueryClient();
  const { fd, setFd, todayFd, isClosedDay, compareDate } = useDashboardFilters();

  const kpisQuery = useDashboardKpis(fd, compareDate);
  const jackpotsQuery = useDashboardJackpots();
  const drawsQuery = useDashboardDraws();
  const outstandingQuery = useDashboardOutstanding();

  const currentKpis = kpisQuery.data ? computeDayKpis(kpisQuery.data, fd) : undefined;

  const compareKpis =
    isClosedDay && compareDate && kpisQuery.data
      ? computeDayKpis(kpisQuery.data, compareDate)
      : undefined;

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: dashboardKeys.all });
  }

  // Hiển thị label ngày tài chính
  const fdLabel = (() => {
    if (fd === todayFd) return "Hôm nay";
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
    if (fd === yesterday) return "Hôm qua";
    return format(new Date(fd + "T12:00:00"), "dd/MM/yyyy", { locale: vi });
  })();

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-indigo-600 shadow-sm">
            <LayoutDashboard className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Dashboard</h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Tổng quan hệ thống — ngày tài chính{" "}
                <span className="font-medium text-foreground">{fdLabel}</span>
              </p>
              {!isClosedDay && (
                <Badge variant="outline" className="text-[10px]">
                  Đang cập nhật
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FinancialDatePicker value={fd} onChange={setFd} label="Ngày tài chính:" />
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={
              kpisQuery.isFetching ||
              jackpotsQuery.isFetching ||
              drawsQuery.isFetching ||
              outstandingQuery.isFetching
            }
            title="Làm mới dữ liệu"
          >
            <RefreshCw
              className={`size-4 ${kpisQuery.isFetching || jackpotsQuery.isFetching || drawsQuery.isFetching || outstandingQuery.isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* ── Zone 1: Hero KPI Cards ──────────────────────────────────── */}
      {kpisQuery.isLoading ? (
        <HeroKpisSkeleton />
      ) : (
        currentKpis && (
          <HeroKpis
            currentKpis={currentKpis}
            compareKpis={compareKpis}
            showTrend={isClosedDay}
            isLoading={false}
          />
        )
      )}

      {/* ── Zone 2: Outstanding Strip (LIVE) ─────────────────────── */}
      <OutstandingStrip data={outstandingQuery.data} isLoading={outstandingQuery.isLoading} />

      {/* ── Zone 3: Jackpot Pools ───────────────────────────────────── */}
      <JackpotPools data={jackpotsQuery.data} isLoading={jackpotsQuery.isLoading} />

      {/* ── Zone 4: Tỷ lệ trả thưởng (1/3) + Hiệu suất game (2/3) ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <PayoutRatioChart kpis={currentKpis} isLoading={kpisQuery.isLoading} />
        </div>
        <div className="xl:col-span-2">
          <GameOverview kpis={currentKpis} isLoading={kpisQuery.isLoading} />
        </div>
      </div>

      {/* ── Zone 4: Lịch quay số — full width, multi-column ────────── */}
      <DrawTimeline data={drawsQuery.data} isLoading={drawsQuery.isLoading} />
    </div>
  );
}

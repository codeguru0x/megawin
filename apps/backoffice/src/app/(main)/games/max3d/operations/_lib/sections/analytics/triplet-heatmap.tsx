"use client";

/**
 * Max 3D — Triplet Analytics Panel
 *
 * Redesign cho monitoring vận hành với 1000 triplets (000-999).
 * Layout: Summary ribbon → Ranked bar chart (top 20) → Top combos → Tenants.
 *
 * Khác biệt căn bản với heatmap grid (Lotto/Mega/Power/Keno):
 * - 1000 triplets → không thể grid hóa, dùng ranked list + bar intensity
 * - 2 play modes (basic + plus) → tách section top combos
 * - Concentration metrics giúp staff detect cược tập trung bất thường
 */

import { useMemo } from "react";

import { formatNumber } from "@megawin/shared/utils";
import { AlertTriangle, Hash, Layers, TrendingUp } from "lucide-react";

import { TripletDisplay } from "@/components/games/max3d/triplet-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { TenantRow, TripletFreq } from "../../types";
import type { TopPlusComboItem, TopSingleComboItem } from "../../use-operations";
import { TenantBreakdown } from "./analytics-panels";

// ─── Heat Intensity ──────────────────────────────────────────────────────────

type HeatLevel = "cold" | "low" | "mid" | "warm" | "hot";

function getHeatLevel(count: number, maxCount: number): HeatLevel {
  if (count === 0 || maxCount === 0) return "cold";
  const ratio = count / maxCount;
  if (ratio >= 0.8) return "hot";
  if (ratio >= 0.55) return "warm";
  if (ratio >= 0.3) return "mid";
  if (ratio >= 0.1) return "low";
  return "cold";
}

const BAR_COLORS: Record<HeatLevel, string> = {
  cold: "bg-slate-300/60 dark:bg-slate-600/40",
  low: "bg-violet-300/60 dark:bg-violet-700/40",
  mid: "bg-violet-400/70 dark:bg-violet-600/50",
  warm: "bg-violet-500/80 dark:bg-violet-500/60",
  hot: "bg-amber-500 dark:bg-amber-500/80",
};

const RANK_STYLES: Record<HeatLevel, string> = {
  cold: "text-muted-foreground",
  low: "text-violet-500/70 dark:text-violet-400/70",
  mid: "text-violet-600 dark:text-violet-400",
  warm: "text-violet-700 dark:text-violet-300",
  hot: "text-amber-600 dark:text-amber-400",
};

const MEDALS = ["🥇", "🥈", "🥉"];

// ─── Summary Ribbon ──────────────────────────────────────────────────────────

function SummaryRibbon({ triplets, totalRevenue }: { triplets: TripletFreq[]; totalRevenue: number }) {
  const uniqueCount = triplets.length;
  const totalBets = triplets.reduce((a, t) => a + t.count, 0);

  // Concentration: top 10 triplets chiếm bao nhiêu % tổng cược
  const top10Revenue = triplets.slice(0, 10).reduce((a, t) => a + t.revenue, 0);
  const concentrationPct = totalRevenue > 0 ? (top10Revenue / totalRevenue) * 100 : 0;
  const isHighConcentration = concentrationPct > 70;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-center">
        <p className="text-xs text-muted-foreground">Unique triplets</p>
        <p className="text-lg font-bold tabular-nums text-foreground">{uniqueCount}</p>
        <p className="text-xs text-muted-foreground tabular-nums">/ 1.000</p>
      </div>
      <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-center">
        <p className="text-xs text-muted-foreground">Tổng boards</p>
        <p className="text-lg font-bold tabular-nums text-foreground">{formatNumber(totalBets)}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{formatNumber(totalRevenue)}</p>
      </div>
      <div
        className={cn(
          "rounded-lg border px-3 py-2.5 text-center",
          isHighConcentration
            ? "border-amber-200 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/20"
            : "bg-muted/20",
        )}
      >
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          {isHighConcentration && <AlertTriangle className="size-3 text-amber-500" />}
          Top 10 tập trung
        </p>
        <p
          className={cn(
            "text-lg font-bold tabular-nums",
            isHighConcentration ? "text-amber-600 dark:text-amber-400" : "text-foreground",
          )}
        >
          {concentrationPct.toFixed(0)}%
        </p>
        <p className="text-xs text-muted-foreground">doanh thu</p>
      </div>
    </div>
  );
}

// ─── Ranked Triplet List ─────────────────────────────────────────────────────

function RankedTripletList({ triplets }: { triplets: TripletFreq[] }) {
  const maxCount = triplets.length > 0 ? triplets[0]!.count : 1;
  const maxRevenue = triplets.length > 0 ? Math.max(...triplets.map((t) => t.revenue)) : 1;
  const top = triplets.slice(0, 20);

  if (top.length === 0) {
    return <p className="text-xs text-muted-foreground/50 text-center py-6">Chưa có dữ liệu</p>;
  }

  return (
    <div className="space-y-0.5">
      {top.map((item, i) => {
        const heat = getHeatLevel(item.count, maxCount);
        const widthPct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
        const medal = MEDALS[i];

        return (
          <TooltipProvider key={item.triplet} delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "group grid items-center gap-x-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40",
                    heat === "hot" && "bg-amber-50/30 dark:bg-amber-950/10",
                  )}
                  style={{ gridTemplateColumns: "1.5rem 2.5rem 1fr 4rem 5rem" }}
                >
                  {/* Rank */}
                  <span className={cn("text-xs font-bold tabular-nums text-center", RANK_STYLES[heat])}>
                    {medal ?? `#${i + 1}`}
                  </span>

                  {/* Triplet badge */}
                  <TripletDisplay
                    value={item.triplet}
                    variant="default"
                    size="sm"
                    className={cn(
                      heat === "hot" &&
                        "!bg-amber-100 !text-amber-800 dark:!bg-amber-900/60 dark:!text-amber-200 ring-1 ring-amber-300/50",
                      heat === "warm" && "!bg-violet-100 !text-violet-800 dark:!bg-violet-900/60 dark:!text-violet-200",
                    )}
                  />

                  {/* Bar */}
                  <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", BAR_COLORS[heat])}
                      style={{ width: `${Math.max(widthPct, 2)}%` }}
                    />
                  </div>

                  {/* Count */}
                  <span className="text-xs tabular-nums text-muted-foreground text-right">
                    {formatNumber(item.count)}
                  </span>

                  {/* Revenue */}
                  <span className="text-xs tabular-nums font-semibold text-foreground text-right">
                    {formatNumber(item.revenue)}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs space-y-1">
                <p className="font-semibold">Bộ ba: {item.triplet}</p>
                <p>Boards: {formatNumber(item.count)}</p>
                <p>Doanh thu: {formatNumber(item.revenue)}</p>
                <p className="text-muted-foreground">
                  Chiếm {maxRevenue > 0 ? ((item.revenue / maxRevenue) * 100).toFixed(1) : 0}% top
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

// ─── Top Combos ──────────────────────────────────────────────────────────────

function TopBasicCombos({ combos }: { combos: TopSingleComboItem[] }) {
  if (combos.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-emerald-500/50 shrink-0" />
        Top bộ ba Basic
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {combos.slice(0, 10).map((c) => (
          <div key={c.triplet} className="flex items-center gap-2 rounded-lg border bg-muted/15 px-2.5 py-1.5">
            <span className="text-xs font-bold tabular-nums text-muted-foreground w-4">
              {MEDALS[c.rank - 1] ?? `#${c.rank}`}
            </span>
            <TripletDisplay value={c.triplet} variant="default" size="sm" />
            <span className="text-xs tabular-nums text-muted-foreground ml-auto">×{formatNumber(c.boardCount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopPlusCombos({ combos }: { combos: TopPlusComboItem[] }) {
  if (combos.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-rose-500/50 shrink-0" />
        Top cặp 3D+
      </p>
      <div className="space-y-1">
        {combos.slice(0, 5).map((c) => (
          <div
            key={`${c.triplet1}-${c.triplet2}`}
            className="flex items-center gap-2 rounded-lg border bg-muted/15 px-2.5 py-1.5"
          >
            <span className="text-xs font-bold tabular-nums text-muted-foreground w-4">
              {MEDALS[c.rank - 1] ?? `#${c.rank}`}
            </span>
            <TripletDisplay value={c.triplet1} variant="default" size="sm" />
            <span className="text-xs text-muted-foreground">+</span>
            <TripletDisplay value={c.triplet2} variant="default" size="sm" />
            <span className="text-xs tabular-nums text-muted-foreground ml-auto">×{formatNumber(c.boardCount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface TripletHeatmapProps {
  triplets: TripletFreq[];
  singleCombos?: TopSingleComboItem[];
  plusCombos?: TopPlusComboItem[];
  tenants: TenantRow[];
}

export function TripletHeatmap({ triplets, singleCombos, plusCombos, tenants }: TripletHeatmapProps) {
  const totalRevenue = useMemo(() => triplets.reduce((a, t) => a + t.revenue, 0), [triplets]);

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="size-4 text-muted-foreground shrink-0" />
            <CardTitle className="text-sm font-semibold">Phân tích bộ ba số</CardTitle>
          </div>
          {triplets.length > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              Top {Math.min(triplets.length, 20)} / {triplets.length}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0 space-y-4">
        {triplets.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 text-center py-8">Chưa có dữ liệu</p>
        ) : (
          <>
            {/* Summary ribbon */}
            <SummaryRibbon triplets={triplets} totalRevenue={totalRevenue} />

            {/* Column headers */}
            <div
              className="grid items-center gap-x-2 px-2 text-xs text-muted-foreground uppercase tracking-wider font-medium"
              style={{ gridTemplateColumns: "1.5rem 2.5rem 1fr 4rem 5rem" }}
            >
              <span className="text-center">#</span>
              <span>Số</span>
              <span>Phân bổ</span>
              <span className="text-right">Boards</span>
              <span className="text-right">Doanh thu</span>
            </div>

            {/* Ranked list */}
            <RankedTripletList triplets={triplets} />
          </>
        )}

        {/* Top combos */}
        <div className="grid gap-4 lg:grid-cols-2">
          {singleCombos && singleCombos.length > 0 && <TopBasicCombos combos={singleCombos} />}
          {plusCombos && plusCombos.length > 0 && <TopPlusCombos combos={plusCombos} />}
        </div>

        {/* Tenant breakdown */}
        <TenantBreakdown tenants={tenants} />
      </CardContent>
    </Card>
  );
}

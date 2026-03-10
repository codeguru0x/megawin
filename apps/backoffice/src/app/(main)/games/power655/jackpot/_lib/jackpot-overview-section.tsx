"use client";

import {
  ArrowRight,
  CircleDollarSign,
  Clock,
  Flame,
  Hash,
  Layers,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatVND, formatVNDCompact } from "@megawin/shared/utils/number";
import { useJackpotCurrent } from "./use-jackpot";

export function JackpotOverviewSection() {
  const { data, isLoading } = useJackpotCurrent();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[280px] rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { cycle, config, totalJackpotProgress, jackpot1Progress, jackpot2Progress, nextDraw } =
    data;
  const jp1 = cycle.jackpot1Current;
  const jp2 = cycle.jackpot2Current;
  const totalJp = jp1 + jp2;
  const pct = totalJackpotProgress?.percentage ?? 0;
  const isHot = pct >= 80;
  const isWarm = pct >= 50;

  const jp1Ratio = config.splitRatios?.tier1 ?? 90;
  const jp2Ratio = 100 - jp1Ratio;

  return (
    <div className="space-y-4">
      {/* Hero Jackpot Card */}
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 p-6",
          "bg-linear-to-br from-red-50/90 via-orange-50/70 to-amber-50/50",
          "dark:from-red-950/50 dark:via-orange-950/40 dark:to-amber-950/30",
          isHot ? "border-red-300 dark:border-red-800/60" : "border-red-200 dark:border-red-800/50",
        )}
      >
        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-linear-to-br from-red-300/25 to-orange-300/15 blur-3xl dark:from-red-500/10 dark:to-orange-500/5" />
        <div className="pointer-events-none absolute -left-8 bottom-0 size-32 rounded-full bg-linear-to-tr from-amber-200/20 to-yellow-200/10 blur-2xl dark:from-amber-600/10 dark:to-yellow-600/5" />

        <div className="relative space-y-5">
          {/* Top row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-red-500 to-orange-500 shadow-lg shadow-red-500/30">
                <Trophy className="size-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-red-700/70 dark:text-red-400/60">
                  Power 6/55 Jackpot — Cycle #{cycle.cycleNo}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/50 dark:text-red-300">
                      JP1
                    </span>
                    <span className="text-2xl font-extrabold tabular-nums tracking-tight text-red-900 dark:text-red-100">
                      {formatVND(jp1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                      JP2
                    </span>
                    <span className="text-2xl font-extrabold tabular-nums tracking-tight text-blue-900 dark:text-blue-100">
                      {formatVND(jp2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {isHot && (
                <Badge className="gap-1 border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300">
                  <Flame className="size-3" />
                  Nóng
                </Badge>
              )}
              {nextDraw?.splitCycleIntent && (
                <Badge className="gap-1 border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                  <Sparkles className="size-3" />
                  Sắp chia
                </Badge>
              )}
            </div>
          </div>

          {/* Total progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-red-800/70 dark:text-red-300/70">
                Tiến trình đến ngưỡng chia —{" "}
                {formatVNDCompact(totalJackpotProgress?.threshold ?? 0)}
              </span>
              <span className="font-bold tabular-nums text-red-900 dark:text-red-200">
                {pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-red-200/60 dark:bg-red-900/50">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${Math.min(pct, 100)}%`,
                  background: isHot
                    ? "linear-gradient(90deg, #ef4444, #dc2626, #b91c1c)"
                    : isWarm
                      ? "linear-gradient(90deg, #f87171, #ef4444, #dc2626)"
                      : "linear-gradient(90deg, #fca5a5, #f87171, #ef4444)",
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-red-700/60 dark:text-red-400/50">
              <span>
                Còn {formatVNDCompact(totalJackpotProgress?.remaining ?? 0)} để đạt ngưỡng
              </span>
              {nextDraw && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  Kỳ tiếp: #{nextDraw.drawNo} —{" "}
                  {new Date(nextDraw.drawTime).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>

          {/* JP1 / JP2 individual progress bars */}
          <div className="grid gap-3 sm:grid-cols-2">
            <JpProgressBar
              label="JP1"
              labelColor="text-red-700 dark:text-red-400"
              barColor="bg-red-500"
              current={jp1}
              seed={jackpot1Progress.seed}
            />
            <JpProgressBar
              label="JP2"
              labelColor="text-blue-700 dark:text-blue-400"
              barColor="bg-blue-500"
              current={jp2}
              seed={jackpot2Progress.seed}
            />
          </div>

          {/* Split contribution ratios */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-red-700/50 dark:text-red-400/40">
              Đóng góp mỗi kỳ
            </span>
            <div className="flex flex-1 items-center gap-1.5">
              <div className="flex h-5 flex-1 overflow-hidden rounded-full bg-white/50 dark:bg-white/10">
                <div
                  className="flex h-full items-center justify-center rounded-l-full bg-red-400/80 text-[9px] font-bold text-white"
                  style={{ width: `${jp1Ratio}%` }}
                >
                  JP1 {jp1Ratio}%
                </div>
                <div
                  className="flex h-full items-center justify-center rounded-r-full bg-blue-400/80 text-[9px] font-bold text-white"
                  style={{ width: `${jp2Ratio}%` }}
                >
                  JP2 {jp2Ratio}%
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {config.splitRatios &&
                Object.entries(config.splitRatios).map(([tier, ratio]) => (
                  <span
                    key={tier}
                    className="rounded-md bg-white/70 px-2 py-0.5 text-[10px] font-medium text-red-800/80 dark:bg-white/10 dark:text-red-300/80"
                  >
                    {tier.replace("tier", "T")}: {ratio as number}%
                  </span>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Layers}
          iconBg="bg-blue-100 dark:bg-blue-900/50"
          iconColor="text-blue-600 dark:text-blue-400"
          label="Tích luỹ liên tiếp"
          value={`${cycle.drawCount} kỳ`}
          sub={`Từ ${cycle.startDrawId}`}
        />
        <KpiCard
          icon={CircleDollarSign}
          iconBg="bg-emerald-100 dark:bg-emerald-900/50"
          iconColor="text-emerald-600 dark:text-emerald-400"
          label="Tổng JP"
          value={formatVNDCompact(totalJp)}
          sub={`JP1: ${formatVNDCompact(jp1)} · JP2: ${formatVNDCompact(jp2)}`}
        />
        <KpiCard
          icon={TrendingUp}
          iconBg="bg-purple-100 dark:bg-purple-900/50"
          iconColor="text-purple-600 dark:text-purple-400"
          label="Ngưỡng chia"
          value={formatVNDCompact(totalJackpotProgress?.threshold ?? 0)}
          sub={`Còn ${formatVNDCompact(totalJackpotProgress?.remaining ?? 0)}`}
        />
        <KpiCard
          icon={Target}
          iconBg="bg-amber-100 dark:bg-amber-900/50"
          iconColor="text-amber-600 dark:text-amber-400"
          label="Seed JP1 / JP2"
          value={formatVNDCompact(jackpot1Progress.seed)}
          sub={`JP2: ${formatVNDCompact(jackpot2Progress.seed)}`}
        />
      </div>
    </div>
  );
}

function JpProgressBar({
  label,
  labelColor,
  barColor,
  current,
  seed,
}: {
  label: string;
  labelColor: string;
  barColor: string;
  current: number;
  seed: number;
}) {
  const growth = seed > 0 ? ((current - seed) / seed) * 100 : 0;

  return (
    <div className="rounded-lg bg-white/60 px-3 py-2.5 dark:bg-white/5">
      <div className="flex items-center justify-between mb-1.5">
        <span className={cn("text-[11px] font-bold", labelColor)}>{label}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {formatVNDCompact(current)}
          {growth > 0 && (
            <span className="ml-1 text-emerald-600 dark:text-emerald-400">
              +{growth.toFixed(0)}%
            </span>
          )}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{
            width: seed > 0 ? `${Math.min((current / (seed * 10)) * 100, 100)}%` : "0%",
          }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Seed: {formatVNDCompact(seed)}</span>
        <span className="flex items-center gap-0.5">
          <ArrowRight className="size-2.5" />
          {formatVNDCompact(current)}
        </span>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
  trend,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
  trend?: { value: number; isPositive: boolean };
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-1.5">
          <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
          {trend && (
            <span
              className={cn(
                "text-xs font-semibold",
                trend.isPositive
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {trend.isPositive ? "+" : ""}
              {trend.value}%
            </span>
          )}
        </div>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

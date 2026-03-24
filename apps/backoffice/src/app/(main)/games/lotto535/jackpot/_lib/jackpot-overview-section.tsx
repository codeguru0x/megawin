"use client";

import { CircleDollarSign, Flame, Layers, Target, TrendingUp, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatVND, formatVNDCompact } from "@megawin/shared/utils";
import { useJackpotCurrent } from "./use-jackpot";

// ─── JackpotHeroCard ──────────────────────────────────────────────────────────

/**
 * Hero card hiển thị jackpot hiện tại: số tiền, tiến trình, badge trạng thái.
 * Dùng độc lập — không kèm KPI stats.
 */
export function JackpotHeroCard() {
  const { data, isLoading } = useJackpotCurrent();

  if (isLoading) return <Skeleton className="h-[200px] rounded-2xl" />;
  if (!data) return null;

  const { cycle, progress } = data;
  const pct = progress.percentage;
  const isHot = pct >= 80;
  const isWarm = pct >= 50;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 p-6",
        "bg-linear-to-br from-amber-50/90 via-yellow-50/70 to-orange-50/50",
        "dark:from-amber-950/50 dark:via-yellow-950/40 dark:to-orange-950/30",
        isHot
          ? "border-red-300 dark:border-red-800/60"
          : "border-amber-200 dark:border-amber-800/50",
      )}
    >
      {/* Decorative orbs */}
      <div className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-linear-to-br from-yellow-300/25 to-orange-300/15 blur-3xl dark:from-yellow-500/10 dark:to-orange-500/5" />
      <div className="pointer-events-none absolute -left-8 bottom-0 size-32 rounded-full bg-linear-to-tr from-amber-200/20 to-yellow-200/10 blur-2xl dark:from-amber-600/10 dark:to-yellow-600/5" />

      <div className="relative space-y-5">
        {/* Top row: icon + amount + badge */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30">
              <Trophy className="size-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-amber-700/70 dark:text-amber-400/60">
                Jackpot hiện tại — Cycle #{cycle.cycleNo}
              </p>
              <p className="mt-0.5 text-3xl font-extrabold tabular-nums tracking-tight text-amber-900 dark:text-amber-100">
                {formatVND(cycle.currentAmount)}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isHot && (
              <Badge className="gap-1 border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300">
                <Flame className="size-3" />
                Nóng
              </Badge>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-amber-800/70 dark:text-amber-300/70">
              Tiến trình đến ngưỡng chia —{" "}
              <span className="font-semibold">{formatVNDCompact(progress.threshold)}</span>
            </span>
            <span className="font-bold tabular-nums text-amber-900 dark:text-amber-200">
              {pct.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-amber-200/60 dark:bg-amber-900/50">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(pct, 100)}%`,
                background: isHot
                  ? "linear-gradient(90deg, #f59e0b, #ef4444, #dc2626)"
                  : isWarm
                    ? "linear-gradient(90deg, #fbbf24, #f59e0b, #d97706)"
                    : "linear-gradient(90deg, #fde68a, #fbbf24, #f59e0b)",
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-amber-700/60 dark:text-amber-400/50">
            <span>
              {progress.remaining > 0
                ? `Còn thiếu ${formatVNDCompact(progress.remaining)}`
                : "Đã đạt ngưỡng chia"}
            </span>
            <span>Seed {formatVNDCompact(cycle.seedAmount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── JackpotKpiCards ──────────────────────────────────────────────────────────

/**
 * Grid 4 KPI cards: tích luỹ, đóng góp, đỉnh cao, ngưỡng chia.
 * Dùng độc lập — không kèm hero card.
 */
export function JackpotKpiCards() {
  const { data, isLoading } = useJackpotCurrent();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const { cycle, progress } = data;
  const growthPct =
    cycle.seedAmount > 0
      ? Math.round(((cycle.currentAmount - cycle.seedAmount) / cycle.seedAmount) * 100)
      : 0;

  return (
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
        label="Tổng đóng góp"
        value={formatVNDCompact(cycle.totalContribution)}
        sub={
          growthPct > 0
            ? `+${growthPct}% so với seed`
            : `Seed: ${formatVNDCompact(cycle.seedAmount)}`
        }
        trend={growthPct > 0 ? { value: growthPct, isPositive: true } : undefined}
      />
      <KpiCard
        icon={TrendingUp}
        iconBg="bg-purple-100 dark:bg-purple-900/50"
        iconColor="text-purple-600 dark:text-purple-400"
        label="Đỉnh cao nhất"
        value={formatVNDCompact(cycle.peakAmount)}
        sub={`Cycle #${cycle.cycleNo}`}
      />
      <KpiCard
        icon={Target}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label="Ngưỡng chia"
        value={formatVNDCompact(progress.threshold)}
        sub={
          progress.remaining > 0
            ? `Còn thiếu ${formatVNDCompact(progress.remaining)}`
            : "Đã đạt ngưỡng"
        }
      />
    </div>
  );
}

// ─── JackpotOverviewSection ───────────────────────────────────────────────────

/**
 * Section đầy đủ = JackpotHeroCard + JackpotKpiCards.
 * Dùng cho trang /jackpot.
 */
export function JackpotOverviewSection() {
  const { isLoading } = useJackpotCurrent();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[200px] rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <JackpotHeroCard />
      <JackpotKpiCards />
    </div>
  );
}

// ─── KpiCard (internal) ───────────────────────────────────────────────────────

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

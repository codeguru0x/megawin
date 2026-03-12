"use client";

import { CircleDollarSign, Flame, Layers, MoveUpRight, Sigma, Target, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatVND, formatVNDCompact } from "@megawin/shared/utils/number";
import { useJackpotCurrent } from "./use-jackpot";

// ─────────────────────────────────────────────
// Public exports (dùng lại ở trang Operations)
// ─────────────────────────────────────────────

export function JackpotOverviewSection() {
  const { data, isLoading } = useJackpotCurrent();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[220px] rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <JackpotHeroCard data={data} />
      <JackpotKpiCards data={data} />
    </div>
  );
}

// ─────────────────────────────────────────────
// Hero Card
// ─────────────────────────────────────────────

export function JackpotHeroCard({
  data,
}: {
  data: import("./use-jackpot").GetJackpotCurrentOutput;
}) {
  const { cycle, progress } = data;

  // Guard: progress có thể undefined nếu response từ cache cũ chưa có field này.
  const pct = progress?.percentage ?? 0;
  // "Nóng" khi đã đạt ≥ 90% ngưỡng milestone hiện tại.
  const isHot = pct >= 90;
  const isWarm = pct >= 60;

  const growthPct =
    cycle.seedAmount > 0
      ? Math.round(((cycle.currentAmount - cycle.seedAmount) / cycle.seedAmount) * 100)
      : 0;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 p-6",
        "bg-linear-to-br from-teal-50/90 via-cyan-50/70 to-emerald-50/50",
        "dark:from-teal-950/50 dark:via-cyan-950/40 dark:to-emerald-950/30",
        isHot
          ? "border-teal-400 dark:border-teal-700/70"
          : "border-teal-200 dark:border-teal-800/50",
      )}
    >
      {/* Decorative glows */}
      <div className="pointer-events-none absolute -right-10 -top-10 size-52 rounded-full bg-linear-to-br from-teal-300/25 to-cyan-300/15 blur-3xl dark:from-teal-500/10 dark:to-cyan-500/5" />
      <div className="pointer-events-none absolute -left-8 bottom-0 size-36 rounded-full bg-linear-to-tr from-emerald-200/20 to-teal-200/10 blur-2xl dark:from-emerald-600/10 dark:to-teal-600/5" />

      <div className="relative space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-teal-400 to-emerald-500 shadow-lg shadow-teal-500/30">
              <Trophy className="size-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-teal-700/70 dark:text-teal-400/60">
                Jackpot Mega 6/45 — Cycle #{cycle.cycleNo}
              </p>
              <p className="mt-0.5 text-3xl font-extrabold tabular-nums tracking-tight text-teal-900 dark:text-teal-100">
                {formatVND(cycle.currentAmount)}
              </p>
              {growthPct > 0 && (
                <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-emerald-700/80 dark:text-emerald-400/70">
                  <MoveUpRight className="size-3.5" />+{growthPct}% so với seed
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isHot && (
              <Badge className="gap-1 border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300">
                <Flame className="size-3" />
                Nóng
              </Badge>
            )}
            <Badge
              variant="outline"
              className="border-teal-300/60 bg-teal-50/80 text-teal-700 dark:border-teal-700/60 dark:bg-teal-950/50 dark:text-teal-300"
            >
              Tích lũy vô hạn
            </Badge>
          </div>
        </div>

        {/* Milestone progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-teal-800/70 dark:text-teal-300/70">
              Tiến trình đến{" "}
              <span className="font-semibold">
                {formatVNDCompact(progress?.milestoneThreshold ?? 0)}
              </span>
            </span>
            <span className="font-bold tabular-nums text-teal-900 dark:text-teal-200">
              {pct.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-teal-200/60 dark:bg-teal-900/50">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(pct, 100)}%`,
                background: isHot
                  ? "linear-gradient(90deg, #0d9488, #0891b2, #06b6d4)"
                  : isWarm
                    ? "linear-gradient(90deg, #14b8a6, #0d9488, #059669)"
                    : "linear-gradient(90deg, #5eead4, #2dd4bf, #14b8a6)",
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-teal-700/60 dark:text-teal-400/50">
            <span>
              {(progress?.remaining ?? 0) > 0
                ? `Còn thiếu ${formatVNDCompact(progress!.remaining)}`
                : progress
                  ? `Đã vượt mốc ×${progress.currentMultiple}`
                  : "Đang tải..."}
            </span>
            <span>
              Mốc ×{progress?.nextMultiple ?? "?"} · Seed {formatVNDCompact(cycle.seedAmount)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// KPI Cards
// ─────────────────────────────────────────────

export function JackpotKpiCards({
  data,
}: {
  data: import("./use-jackpot").GetJackpotCurrentOutput;
}) {
  const { cycle, progress } = data;

  const growthPct =
    cycle.seedAmount > 0
      ? Math.round(((cycle.currentAmount - cycle.seedAmount) / cycle.seedAmount) * 100)
      : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={Layers}
        iconBg="bg-teal-100 dark:bg-teal-900/50"
        iconColor="text-teal-600 dark:text-teal-400"
        label="Tích luỹ liên tiếp"
        value={`${cycle.drawCount} kỳ`}
        sub={cycle.startDrawId ? `Từ ${cycle.startDrawId}` : "Chưa bắt đầu"}
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
        icon={Sigma}
        iconBg="bg-cyan-100 dark:bg-cyan-900/50"
        iconColor="text-cyan-600 dark:text-cyan-400"
        label="Đỉnh cao nhất"
        value={formatVNDCompact(cycle.peakAmount)}
        sub={`Cycle #${cycle.cycleNo}`}
      />
      <KpiCard
        icon={Target}
        iconBg="bg-teal-100 dark:bg-teal-900/50"
        iconColor="text-teal-600 dark:text-teal-400"
        label="Mốc tiếp theo"
        value={formatVNDCompact(progress?.milestoneThreshold ?? 0)}
        sub={`×${progress?.nextMultiple ?? "?"} seed — mốc tham chiếu`}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Internal: KPI Card
// ─────────────────────────────────────────────

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

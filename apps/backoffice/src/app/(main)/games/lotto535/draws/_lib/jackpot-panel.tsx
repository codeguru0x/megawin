"use client";

import { Flame, Layers, Target, TrendingUp, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatVND, formatVNDCompact } from "@megawin/shared/utils/number";
import { useJackpotCurrent } from "../../jackpot/_lib/use-jackpot";

export function JackpotPanel() {
  const { data, isLoading } = useJackpotCurrent();

  if (isLoading) {
    return <Skeleton className="h-[140px] rounded-xl" />;
  }

  if (!data) return null;

  const { cycle, progress } = data;
  const pct = progress.percentage;
  const isHot = pct >= 80;
  const isWarm = pct >= 50;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-4",
        "bg-linear-to-br from-amber-50/80 via-yellow-50/60 to-orange-50/40",
        "dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-orange-950/20",
        "dark:border-amber-800/50"
      )}
    >
      {/* Decorative shimmer */}
      <div className="pointer-events-none absolute -right-6 -top-6 size-32 rounded-full bg-linear-to-br from-yellow-300/20 to-orange-300/10 blur-2xl dark:from-yellow-500/10 dark:to-orange-500/5" />

      <div className="relative space-y-3.5">
        {/* Header + Amount */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-linear-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-500/25">
              <Trophy className="size-4.5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-amber-700/70 dark:text-amber-400/70">
                Jackpot hiện tại
              </p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-amber-900 dark:text-amber-100">
                {formatVND(cycle.currentAmount)}
              </p>
            </div>
          </div>

          {isHot && (
            <Badge className="gap-1 border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300">
              <Flame className="size-3" />
              Nóng
            </Badge>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-muted-foreground">
              Tiến trình chia giải
            </span>
            <span className="font-semibold tabular-nums text-amber-800 dark:text-amber-300">
              {pct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-amber-200/50 dark:bg-amber-900/40">
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
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-white/60 px-2.5 py-2 dark:bg-white/5">
            <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <Layers className="size-2.5" />
              Tích luỹ
            </div>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
              {cycle.drawCount} kỳ
            </p>
          </div>
          <div className="rounded-lg bg-white/60 px-2.5 py-2 dark:bg-white/5">
            <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <Target className="size-2.5" />
              Ngưỡng chia
            </div>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
              {formatVNDCompact(progress.threshold)}
            </p>
          </div>
          <div className="rounded-lg bg-white/60 px-2.5 py-2 dark:bg-white/5">
            <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <TrendingUp className="size-2.5" />
              Đỉnh
            </div>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
              {formatVNDCompact(cycle.peakAmount)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

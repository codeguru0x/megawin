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
  const pct = progress?.percentage ?? 0;
  const isHot = pct >= 80;
  const isWarm = pct >= 50;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-4",
        "bg-linear-to-br from-orange-50/80 via-amber-50/60 to-yellow-50/40",
        "dark:from-orange-950/40 dark:via-amber-950/30 dark:to-yellow-950/20",
        "dark:border-orange-800/50",
      )}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 size-32 rounded-full bg-linear-to-br from-orange-300/20 to-amber-300/10 blur-2xl dark:from-orange-500/10 dark:to-amber-500/5" />

      <div className="relative space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-linear-to-br from-orange-400 to-amber-500 shadow-md shadow-orange-500/25">
              <Trophy className="size-4.5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-orange-700/70 dark:text-orange-400/70">
                Jackpot hiện tại
              </p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-orange-900 dark:text-orange-100">
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

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-muted-foreground">Tiến trình chia giải</span>
            <span className="font-semibold tabular-nums text-orange-800 dark:text-orange-300">
              {pct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-orange-200/50 dark:bg-orange-900/40">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(pct, 100)}%`,
                background: isHot
                  ? "linear-gradient(90deg, #f97316, #ef4444, #dc2626)"
                  : isWarm
                    ? "linear-gradient(90deg, #fb923c, #f97316, #ea580c)"
                    : "linear-gradient(90deg, #fdba74, #fb923c, #f97316)",
              }}
            />
          </div>
        </div>

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
              {formatVNDCompact(progress?.threshold ?? 0)}
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

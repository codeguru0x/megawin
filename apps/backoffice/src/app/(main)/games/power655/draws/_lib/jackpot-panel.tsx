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
    return <Skeleton className="h-[180px] rounded-xl" />;
  }

  if (!data) return null;

  const { cycle, totalJackpotProgress: progress } = data;
  const totalJp = cycle.jackpot1Current + cycle.jackpot2Current;
  const pct = progress?.percentage ?? 0;
  const isHot = pct >= 80;
  const isWarm = pct >= 50;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-4",
        "bg-linear-to-br from-red-50/80 via-orange-50/60 to-amber-50/40",
        "dark:from-red-950/40 dark:via-orange-950/30 dark:to-amber-950/20",
        "dark:border-red-800/50",
      )}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 size-32 rounded-full bg-linear-to-br from-red-300/20 to-orange-300/10 blur-2xl dark:from-red-500/10 dark:to-orange-500/5" />

      <div className="relative space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-linear-to-br from-red-500 to-orange-500 shadow-md shadow-red-500/25">
              <Trophy className="size-4.5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-red-700/70 dark:text-red-400/70">
                Jackpot hiện tại
              </p>
              <div className="flex items-center gap-3 mt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/50 dark:text-red-300">
                    JP1
                  </span>
                  <span className="text-lg font-bold tabular-nums tracking-tight text-red-900 dark:text-red-100">
                    {formatVND(cycle.jackpot1Current)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    JP2
                  </span>
                  <span className="text-lg font-bold tabular-nums tracking-tight text-blue-900 dark:text-blue-100">
                    {formatVND(cycle.jackpot2Current)}
                  </span>
                </div>
              </div>
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
            <span className="font-semibold tabular-nums text-red-800 dark:text-red-300">
              {pct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-red-200/50 dark:bg-red-900/40">
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
              {formatVNDCompact(progress?.remaining ?? 0)}
            </p>
          </div>
          <div className="rounded-lg bg-white/60 px-2.5 py-2 dark:bg-white/5">
            <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <TrendingUp className="size-2.5" />
              Tổng JP
            </div>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
              {formatVNDCompact(totalJp)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

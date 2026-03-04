"use client";

import { Loader2, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatVND, formatVNDCompact, formatNumber } from "@megawin/shared/utils/number";
import { useJackpotCurrent } from "../../jackpot/_lib/use-jackpot";

export function JackpotBanner() {
  const { data, isLoading } = useJackpotCurrent();

  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border bg-linear-to-r from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20">
        <Loader2 className="size-5 animate-spin text-amber-600" />
      </div>
    );
  }

  if (!data) return null;

  const { cycle, progress } = data;
  const isNearSplit = progress.percentage >= 80;
  const isCritical = progress.percentage >= 95;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-4 transition-colors",
        isCritical
          ? "border-red-300 bg-linear-to-r from-red-50 to-orange-50 dark:border-red-800 dark:from-red-950/40 dark:to-orange-950/30"
          : isNearSplit
            ? "border-amber-300 bg-linear-to-r from-amber-50 to-yellow-50 dark:border-amber-800 dark:from-amber-950/30 dark:to-yellow-950/20"
            : "border-amber-200 bg-linear-to-r from-amber-50/60 to-yellow-50/40 dark:border-amber-900 dark:from-amber-950/20 dark:to-yellow-950/10",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-lg",
              isCritical ? "bg-red-200 dark:bg-red-900/60" : "bg-amber-200 dark:bg-amber-900/60",
            )}
          >
            <Sparkles
              className={cn(
                "size-5",
                isCritical
                  ? "text-red-700 dark:text-red-300"
                  : "text-amber-700 dark:text-amber-300",
              )}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
                {formatVNDCompact(cycle.currentAmount)}
              </span>
              {isNearSplit && (
                <Badge
                  variant="outline"
                  className={cn(
                    "border-0 text-[10px]",
                    isCritical
                      ? "bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200"
                      : "bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
                  )}
                >
                  {isCritical ? "Sắp Split" : "Gần Split"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Jackpot Cycle #{cycle.cycleNo} · {formatNumber(cycle.drawCount)} kỳ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs">
          <div className="text-center">
            <p className="text-muted-foreground">Peak</p>
            <p className="font-semibold tabular-nums">{formatVNDCompact(cycle.peakAmount)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">Contribution</p>
            <p className="font-semibold tabular-nums">
              {formatVNDCompact(cycle.totalContribution)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">Ngưỡng Split</p>
            <p className="font-semibold tabular-nums">{formatVNDCompact(progress.threshold)}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Progress
          value={progress.percentage}
          className={cn(
            "h-2",
            isCritical
              ? "*:data-[slot=progress-indicator]:bg-red-500"
              : isNearSplit
                ? "*:data-[slot=progress-indicator]:bg-amber-500"
                : "*:data-[slot=progress-indicator]:bg-amber-400",
          )}
        />
        <span className="min-w-14 text-right text-xs font-medium tabular-nums text-muted-foreground">
          {progress.percentage.toFixed(1)}%
        </span>
      </div>

      {data.nextDraw?.splitCycleIntent && (
        <div className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
          <TrendingUp className="size-3.5" />
          Kỳ tiếp theo (Kỳ {data.nextDraw.drawNo}) dự kiến chia Jackpot
        </div>
      )}
    </div>
  );
}

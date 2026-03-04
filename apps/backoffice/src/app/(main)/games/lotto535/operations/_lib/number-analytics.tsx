"use client";

import { Hash, Loader2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, formatVND } from "@megawin/shared/utils/number";
import {
  useOpsNumberFrequency,
  useOpsPlayTypeDistribution,
  useOpsSummary,
  type OpsQueryParams,
} from "./use-operations";

const MAIN_TOTAL = 35;
const SPECIAL_TOTAL = 12;

const PLAY_TYPE_LABELS: Record<string, string> = {
  standard: "Chuẩn",
  mainCover4: "Bao 4",
  mainCover: "Bao số chính",
  specialCover: "Bao số ĐB",
  quickPick: "Chọn nhanh",
};

export function NumberAnalytics({ params }: { params: OpsQueryParams }) {
  const { data: summaryData } = useOpsSummary(params);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/50">
            <Hash className="size-3.5 text-purple-600 dark:text-purple-400" />
          </div>
          <h2 className="text-sm font-semibold">Thống kê con số & kiểu chơi</h2>
        </div>

        {summaryData && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">
                {formatNumber(summaryData.totalEntries)}
              </span>{" "}
              entries
            </span>
            <span>
              <span className="font-medium text-foreground">
                {formatNumber(summaryData.totalLines)}
              </span>{" "}
              lines
            </span>
            <span>
              <span className="font-medium text-foreground">
                {formatVND(summaryData.totalRevenue)}
              </span>{" "}
              cược
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NumberHeatmaps params={params} />
        <PlayTypeChart params={params} />
      </div>
    </div>
  );
}

function NumberHeatmaps({ params }: { params: OpsQueryParams }) {
  const { data, isLoading } = useOpsNumberFrequency(params);

  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center rounded-xl border bg-card">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const mainNumbers = data?.mainNumbers ?? [];
  const specialNumbers = data?.specialNumbers ?? [];

  const mainMap = new Map(mainNumbers.map((n) => [n.number, n.count]));
  const specialMap = new Map(specialNumbers.map((n) => [n.number, n.count]));

  const mainMax = Math.max(1, ...mainNumbers.map((n) => n.count));
  const specialMax = Math.max(1, ...specialNumbers.map((n) => n.count));

  const mainTotal = mainNumbers.reduce((s, n) => s + n.count, 0);
  const specialTotal = specialNumbers.reduce((s, n) => s + n.count, 0);

  const mainTop5 = [...mainNumbers].sort((a, b) => b.count - a.count).slice(0, 5);
  const specialTop3 = [...specialNumbers].sort((a, b) => b.count - a.count).slice(0, 3);
  const mainTop5Set = new Set(mainTop5.map((n) => n.number));
  const specialTop3Set = new Set(specialTop3.map((n) => n.number));

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">Số chính (1–35)</p>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {formatNumber(mainTotal)} lượt chọn
            </span>
          </div>
          {mainTop5.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Hot:</span>
              {mainTop5.map((n) => (
                <Badge
                  key={n.number}
                  variant="outline"
                  className="h-5 border-amber-300 bg-amber-50 px-1.5 text-[10px] tabular-nums text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                >
                  {String(n.number).padStart(2, "0")}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <HeatmapGrid
          total={MAIN_TOTAL}
          cols={7}
          countMap={mainMap}
          maxCount={mainMax}
          totalCount={mainTotal}
          hotSet={mainTop5Set}
          variant="main"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">Số đặc biệt (1–12)</p>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {formatNumber(specialTotal)} lượt chọn
            </span>
          </div>
          {specialTop3.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Hot:</span>
              {specialTop3.map((n) => (
                <Badge
                  key={n.number}
                  variant="outline"
                  className="h-5 border-violet-300 bg-violet-50 px-1.5 text-[10px] tabular-nums text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300"
                >
                  {String(n.number).padStart(2, "0")}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <HeatmapGrid
          total={SPECIAL_TOTAL}
          cols={6}
          countMap={specialMap}
          maxCount={specialMax}
          totalCount={specialTotal}
          hotSet={specialTop3Set}
          variant="special"
        />
      </div>
    </div>
  );
}

function HeatmapGrid({
  total,
  cols,
  countMap,
  maxCount,
  totalCount,
  hotSet,
  variant,
}: {
  total: number;
  cols: number;
  countMap: Map<number, number>;
  maxCount: number;
  totalCount: number;
  hotSet: Set<number>;
  variant: "main" | "special";
}) {
  const numbers = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {numbers.map((num) => {
          const count = countMap.get(num) ?? 0;
          const intensity = maxCount > 0 ? count / maxCount : 0;
          const isHot = hotSet.has(num);
          const pct = totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : "0";

          return (
            <Tooltip key={num}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "relative flex cursor-default flex-col items-center justify-center rounded-md border px-1 py-1.5 text-center transition-colors",
                    isHot &&
                      (variant === "main"
                        ? "ring-1 ring-amber-400 dark:ring-amber-600"
                        : "ring-1 ring-violet-400 dark:ring-violet-600"),
                  )}
                  style={{
                    backgroundColor:
                      count === 0
                        ? undefined
                        : variant === "main"
                          ? `rgba(245, 158, 11, ${0.08 + intensity * 0.45})`
                          : `rgba(139, 92, 246, ${0.08 + intensity * 0.45})`,
                  }}
                >
                  <span className="text-xs font-semibold tabular-nums">
                    {String(num).padStart(2, "0")}
                  </span>
                  <span className="text-[9px] tabular-nums text-muted-foreground">
                    {count > 0 ? formatNumber(count) : "–"}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p className="font-semibold">Số {String(num).padStart(2, "0")}</p>
                <p>
                  {formatNumber(count)} lượt chọn · {pct}%
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function PlayTypeChart({ params }: { params: OpsQueryParams }) {
  const { data, isLoading } = useOpsPlayTypeDistribution(params);

  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center rounded-xl border bg-card">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = data?.distribution ?? [];

  if (items.length === 0) {
    return (
      <div className="flex h-60 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20">
        <BarChart3 className="size-5 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">Chưa có dữ liệu kiểu chơi.</p>
      </div>
    );
  }

  const totalBoards = items.reduce((s, i) => s + i.boardCount, 0);
  const totalLines = items.reduce((s, i) => s + i.lineCount, 0);

  const COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-rose-500"];

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">Phân bố kiểu chơi</p>
        </div>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {formatNumber(totalBoards)} boards · {formatNumber(totalLines)} lines
        </span>
      </div>

      <div className="space-y-2.5">
        {items.map((item, idx) => {
          const pct = totalBoards > 0 ? ((item.boardCount / totalBoards) * 100).toFixed(1) : "0";
          const linePct = totalLines > 0 ? ((item.lineCount / totalLines) * 100).toFixed(1) : "0";

          return (
            <div key={item.playType} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  {PLAY_TYPE_LABELS[item.playType] ?? item.playType}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatNumber(item.boardCount)} boards · {formatNumber(item.lineCount)} lines
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("rounded-full transition-all", COLORS[idx % COLORS.length])}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{pct}% boards</span>
                <span>{linePct}% lines</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

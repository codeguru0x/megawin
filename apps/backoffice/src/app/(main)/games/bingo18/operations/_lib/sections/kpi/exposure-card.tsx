"use client";

/**
 * Bingo 18 – Exposure Card (tab Giám sát)
 *
 * KHÁC Keno: exposure là số CHÍNH XÁC per-outcome (216 kết quả), không proxy:
 * - Worst-case (đỏ) + 3 dice badge outcome đạt max + tổng.
 * - Expected payout so revenue → margin dự kiến kỳ (âm → đỏ).
 * - Gauge `worstCase / revenue` tô theo `exposureWarnRevenuePct` (thresholds từ
 *   snapshot — KHÔNG hardcode client; dưới sàn `exposureWarnMinAmount` → luôn xanh).
 * - Collapse "Top 5 outcome trả nặng".
 */

import { useState } from "react";

import type { Bingo18ExposureResult } from "@megawin/game-bingo18/rules";
import { formatNumber } from "@megawin/shared/utils";
import { ChevronDown, ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** 3 dice badge nhỏ cho 1 outcome. */
function DiceBadges({ numbers }: { numbers: [number, number, number] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {numbers.map((n, i) => (
        <span
          key={i}
          className="inline-flex size-5 items-center justify-center rounded bg-red-500/10 text-[11px] font-bold tabular-nums text-red-700 dark:text-red-300"
        >
          {n}
        </span>
      ))}
    </span>
  );
}

export function ExposureCard({
  exposure,
  revenue,
  warnRevenuePct,
  warnMinAmount,
}: {
  exposure: Bingo18ExposureResult;
  /** Doanh thu kỳ (VND) — mẫu số gauge (Bingo 18 không có cap kỳ). */
  revenue: number;
  /** Ngưỡng % doanh thu từ `snapshot.thresholds` (fallback loading ở caller). */
  warnRevenuePct: number;
  /** Sàn tuyệt đối (VND) — worst-case dưới sàn thì gauge luôn xanh (chống noise kỳ vắng). */
  warnMinAmount: number;
}) {
  const [showTop, setShowTop] = useState(false);

  const worst = exposure.worstCase.amount;
  const expected = Math.round(exposure.expectedPayout);
  const margin = revenue - expected;
  const pct = revenue > 0 ? (worst / revenue) * 100 : 0;

  // Màu gauge theo ngưỡng config: dưới sàn tuyệt đối → xanh (kỳ vắng, % không có nghĩa);
  // ≥ ngưỡng % → đỏ; ≥ 1/2 ngưỡng → amber; còn lại xanh.
  const underFloor = worst < warnMinAmount;
  const gaugeColor = underFloor
    ? "bg-emerald-500"
    : pct >= warnRevenuePct
      ? "bg-red-500"
      : pct >= warnRevenuePct / 2
        ? "bg-amber-500"
        : "bg-emerald-500";
  // Gauge scale: 100% thanh = ngưỡng cảnh báo (worst chạm ngưỡng % = full bar).
  const gaugeWidth = Math.min(100, warnRevenuePct > 0 ? (pct / warnRevenuePct) * 100 : 0);

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50 shrink-0">
              <ShieldAlert className="size-3.5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Rủi ro chi trả</p>
              <p className="text-xs text-muted-foreground">
                Chính xác trên 216 kết quả có thể xảy ra
              </p>
            </div>
          </div>

          {/* Worst-case + outcome đạt max */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Worst-case</p>
              <p className="text-base font-bold tabular-nums text-red-600 dark:text-red-400">
                {formatNumber(worst)}
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center gap-0.5 cursor-help">
                  <DiceBadges numbers={exposure.worstCase.numbers} />
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    Tổng {exposure.worstCase.sum}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-72 text-xs">
                Kết quả xấu nhất cho nhà cái: nếu 3 xúc xắc ra đúng bộ này, kỳ phải trả nhiều tiền
                nhất. Tính chính xác từ toàn bộ cược hiện tại — không phải ước lượng.
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Expected + margin dự kiến */}
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Kỳ vọng trả · Margin dự kiến</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatNumber(expected)}
              <span className="mx-1 text-muted-foreground">·</span>
              <span
                className={cn(
                  margin < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {margin >= 0 ? "+" : ""}
                {formatNumber(margin)}
              </span>
            </p>
          </div>
        </div>

        {/* Gauge worst-case / doanh thu */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>
              Worst-case / Doanh thu:{" "}
              <span className="font-semibold text-foreground">{Math.round(pct)}%</span>
              {underFloor && (
                <span className="ml-1.5 text-muted-foreground/70">
                  (dưới sàn {formatNumber(warnMinAmount)} — chưa xét cảnh báo)
                </span>
              )}
            </span>
            <span>Ngưỡng cảnh báo {warnRevenuePct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", gaugeColor)}
              style={{ width: `${gaugeWidth}%` }}
            />
          </div>
        </div>

        {/* Top 5 outcome trả nặng — collapse */}
        <div>
          <button
            type="button"
            onClick={() => setShowTop((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", showTop && "rotate-180")} />
            Top 5 kết quả trả nặng nhất
          </button>
          {showTop && (
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
              {exposure.topOutcomes.map((o, i) => (
                <div
                  key={`${o.numbers.join("-")}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/10 px-2.5 py-1.5"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                      #{i + 1}
                    </span>
                    <DiceBadges numbers={o.numbers} />
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-red-600/90 dark:text-red-400">
                    {formatNumber(o.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

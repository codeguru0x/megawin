"use client";

import type { CSSProperties } from "react";

/**
 * Keno – Exposure Card (tab Giám sát)
 *
 * Proxy liability worst-case của kỳ. Snapshot KHÔNG trả money cap → hiển thị
 * `worstCaseTotal` prominently + 3 dòng capSets pick8/9/10 tô màu theo tỉ lệ với
 * `maxSetsForFixed` (mẫu số mặc định). KHÔNG dựng gauge tiền/cap giả — honest.
 *
 * Click card → chuyển sang tab Phân tích cược (nơi có combo list/heatmap để đào sâu).
 */
import { KENO_PLAY_TYPE_LABELS } from "@megawin/game-keno/labels";
import { formatNumber } from "@megawin/shared/utils";
import { ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { ExposureCapRow, ExposureView } from "../../types";

/**
 * Màu theo tỉ lệ sets/max: <0.6 xanh (an toàn), 0.6–<1 amber (gần cap), ≥1 đỏ (cap kích hoạt).
 */
function capColor(ratio: number): { text: string; bar: string } {
  if (ratio >= 1) {
    return { text: "text-red-600 dark:text-red-400", bar: "bg-red-500" };
  }
  if (ratio >= 0.6) {
    return { text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" };
  }
  return { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" };
}

function CapRow({ row }: { row: ExposureCapRow }) {
  const ratio = row.max > 0 ? row.sets / row.max : 0;
  const c = capColor(ratio);
  const pct = Math.min(ratio, 1) * 100;

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-14 shrink-0 text-xs">{KENO_PLAY_TYPE_LABELS[row.playType]}</span>
      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          className={cn("w-(--bar-w)", "h-full rounded-full transition-all", c.bar)}
          style={{ "--bar-w": `${pct}%` } as CSSProperties}
        />
      </div>
      <span className={cn("w-16 shrink-0 text-right text-xs font-semibold tabular-nums", c.text)}>
        {formatNumber(row.sets)}/{formatNumber(row.max)}
      </span>
    </div>
  );
}

export function ExposureCard({
  exposure,
  warnPct,
  onOpenAnalysis,
}: {
  exposure: ExposureView;
  /** Ngưỡng cảnh báo exposure (%) từ config — hiển thị dưới worstCaseTotal. */
  warnPct: number;
  onOpenAnalysis?: () => void;
}) {
  const clickable = !!onOpenAnalysis;

  return (
    <Card
      className={cn("gap-0 py-0", clickable && "hover:bg-muted/20 cursor-pointer transition-colors")}
      onClick={onOpenAnalysis}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenAnalysis?.();
              }
            }
          : undefined
      }
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
              <ShieldAlert className="size-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">Rủi ro chi trả (worst-case)</p>
              <p className="text-foreground text-lg leading-tight font-bold tabular-nums">
                {formatNumber(exposure.worstCaseTotal)}
              </p>
              <p className="text-muted-foreground/70 text-xs">
                Tổng phải trả nếu mọi vé trúng tối đa · ngưỡng cảnh báo {warnPct}%
              </p>
            </div>
          </div>
          <div className="max-w-xs min-w-40 flex-1 space-y-1.5">
            <p className="text-muted-foreground/50 text-xs font-semibold tracking-wider uppercase">
              Số bộ trọn bậc / cap
            </p>
            {exposure.capRows.map((row) => (
              <CapRow key={row.playType} row={row} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

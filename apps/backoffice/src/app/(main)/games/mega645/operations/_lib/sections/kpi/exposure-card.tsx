"use client";

/**
 * Mega 6/45 – Exposure Card (tab Giám sát)
 *
 * KHÁC Power 6/55: chỉ 1 Jackpot ĐƠN (không JP1+JP2) — 2 khối rủi ro tách biệt:
 * 1. Giải cố định — `fixedWorstCase` (VND tuyệt đối, RAW không cap) so với ngưỡng cảnh báo
 *    tuyệt đối `warnAmount` (KHÔNG phải %) — tô màu theo tỉ lệ so ngưỡng.
 * 2. Jackpot — pool hiện hành, KHÔNG so ngưỡng (jackpot tự chặn bởi pool, không tăng
 *    theo số vé bán thêm) — chỉ hiển thị tham khảo.
 *
 * Click card → chuyển sang tab Phân tích cược (nơi có combo lookup/heatmap để đào sâu).
 */
import { formatNumber } from "@megawin/shared/utils";
import { CircleDollarSign, ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { ExposureView } from "../../types";

/** Màu theo tỉ lệ fixedWorstCase/warnAmount: <0.6 xanh, 0.6–<1 amber, ≥1 đỏ (vượt ngưỡng). */
function riskColor(ratio: number): string {
  if (ratio >= 1) {
    return "text-red-600 dark:text-red-400";
  }
  if (ratio >= 0.6) {
    return "text-amber-600 dark:text-amber-400";
  }
  return "text-emerald-600 dark:text-emerald-400";
}

export function ExposureCard({
  exposure,
  warnAmount,
  onOpenAnalysis,
}: {
  exposure: ExposureView;
  /** Ngưỡng cảnh báo exposure giải cố định (VND tuyệt đối) từ config. */
  warnAmount: number;
  onOpenAnalysis?: () => void;
}) {
  const clickable = !!onOpenAnalysis;
  const ratio = warnAmount > 0 ? exposure.fixedWorstCase / warnAmount : 0;

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
              <p className="text-muted-foreground text-xs font-medium">Rủi ro chi trả giải cố định (worst-case)</p>
              <p className={cn("text-lg leading-tight font-bold tabular-nums", riskColor(ratio))}>
                {formatNumber(exposure.fixedWorstCase)}
              </p>
              <p className="text-muted-foreground/70 text-xs">
                Tổng phải trả nếu mọi bộ trúng giải cố định tối đa · ngưỡng cảnh báo {formatNumber(warnAmount)}
              </p>
            </div>
          </div>
          <div className="max-w-xs min-w-40 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/50">
                <CircleDollarSign className="size-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-xs font-medium">Exposure Jackpot</p>
                <p className="text-foreground text-lg leading-tight font-bold tabular-nums">
                  {formatNumber(exposure.jackpotExposure)}
                </p>
                <p className="text-muted-foreground/70 text-xs">Pool hiện hành, không cap theo số vé</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

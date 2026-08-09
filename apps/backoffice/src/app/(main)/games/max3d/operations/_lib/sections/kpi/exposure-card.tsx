"use client";

/**
 * Max 3D – Exposure Card (tab Giám sát)
 *
 * KHÁC Bingo18: exposure gồm 3 thành phần ghi nhãn trung thực —
 * - Basic (CHÍNH XÁC — greedy per-tier trên tripletStakes).
 * - Cặp ĐB max (CHÍNH XÁC có điều kiện — units × 1 tỷ của cặp nặng nhất).
 * - Đuôi plus Năm/Sáu (ƯỚC TÍNH thiên cao).
 * Gauge so ngưỡng TUYỆT ĐỐI `exposureWarnAmount` từ `snapshot.thresholds`
 * (kỳ bán nhiều ngày — doanh thu không làm mẫu số).
 */

import type { Max3dExposureResult } from "@megawin/game-max3d/rules";
import { formatNumber } from "@megawin/shared/utils";
import { ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function ComponentStat({ label, value, tip, danger }: { label: string; value: number; tip: string; danger?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p
            className={cn(
              "text-sm font-bold tabular-nums leading-tight",
              danger ? "text-red-600 dark:text-red-400" : "text-foreground",
            )}
          >
            {formatNumber(value)}
          </p>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 text-xs">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

export function ExposureCard({
  exposure,
  revenue,
  warnAmount,
}: {
  exposure: Max3dExposureResult;
  /** Doanh thu kỳ (VND) — hiển thị tham chiếu (KHÔNG phải mẫu số gauge). */
  revenue: number;
  /** Ngưỡng tuyệt đối (VND) từ `snapshot.thresholds.exposureWarnAmount`. */
  warnAmount: number;
}) {
  const worst = exposure.worstCaseTotal;
  const maxPair = exposure.topPairLiabilities[0];

  // Gauge scale: 100% thanh = ngưỡng tuyệt đối; ≥ ngưỡng → đỏ, ≥ 1/2 → amber.
  const ratio = warnAmount > 0 ? worst / warnAmount : 0;
  const gaugeColor = ratio >= 1 ? "bg-red-500" : ratio >= 0.5 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
              <ShieldAlert className="size-3.5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Rủi ro chi trả</p>
              <p className="text-xs text-muted-foreground">
                Basic chính xác · Cặp ĐB có điều kiện · Đuôi plus ước tính
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Worst-case tổng</p>
            <p className="text-base font-bold tabular-nums text-red-600 dark:text-red-400">{formatNumber(worst)}</p>
          </div>
        </div>

        {/* 3 thành phần + doanh thu tham chiếu */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ComponentStat
            label="Basic (chính xác)"
            value={exposure.basicWorstCase.total}
            tip="Worst-case giải cơ bản: mỗi tier (ĐB×2/Nhất×4/Nhì×6/Ba×8 slot) chọn các bộ ba có liability cao nhất — tính CHÍNH XÁC từ stake per-triplet, không ước lượng."
            danger
          />
          <ComponentStat
            label="Cặp ĐB nặng nhất"
            value={maxPair?.liability ?? 0}
            tip={
              maxPair
                ? `Cặp ${maxPair.triplet1}–${maxPair.triplet2}: ${formatNumber(maxPair.units)} bộ × 1 tỷ = ${formatNumber(maxPair.liability)} VND nếu cặp này ra ĐB. Chính xác CÓ ĐIỀU KIỆN (chỉ trả khi đúng cặp ra).`
                : "Chưa có cược Max 3D+ nào."
            }
            danger
          />
          <ComponentStat
            label="Đuôi plus (ước tính)"
            value={exposure.plusTailProxy}
            tip="Giải Năm/Sáu Max 3D+ (điều kiện 1 bộ khớp) — ước lượng THIÊN CAO: giả định mọi đơn vị plus cùng trúng đuôi. Giải cặp Nhất→Tư KHÔNG cộng đồng loạt (chỉ cặp khớp pool mới trả)."
          />
          <ComponentStat
            label="Doanh thu kỳ"
            value={revenue}
            tip="Tổng tiền cược đã vào kỳ này — tham chiếu so với worst-case. Kỳ bán nhiều ngày nên KHÔNG dùng làm mẫu số cảnh báo (ngưỡng tuyệt đối)."
          />
        </div>

        {/* Gauge vs ngưỡng tuyệt đối */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
            <span>
              Worst-case / Ngưỡng: <span className="font-semibold text-foreground">{Math.round(ratio * 100)}%</span>
            </span>
            <span>Ngưỡng cảnh báo {formatNumber(warnAmount)} VND</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", gaugeColor)}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

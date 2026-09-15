"use client";

import type { ReactNode } from "react";

import { formatNumber } from "@megawin/shared/utils";

import type { NumberHeatmapHoverItem } from "./use-number-heatmap-hover";

/**
 * Nội dung Data Hover Surface cho 1 ô số — badge do caller truyền (brand per game).
 */
export function NumberHeatmapCellDetail({ item, badge }: { item: NumberHeatmapHoverItem; badge: ReactNode }) {
  const isEmpty = item.sets === 0;

  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        {badge}
        <span className="text-xs font-semibold">Số {item.number}</span>
      </div>
      {isEmpty ? (
        <p className="text-xs text-muted-foreground">Chưa có cược</p>
      ) : (
        <div className="min-w-37 space-y-1">
          <div className="flex justify-between gap-8">
            <span className="text-xs text-muted-foreground">Số bộ cược chứa số</span>
            <span className="text-xs font-semibold tabular-nums text-foreground">{formatNumber(item.sets)}</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className="text-xs text-muted-foreground">Tổng cược</span>
            <span className="text-xs font-semibold tabular-nums text-foreground">{formatNumber(item.amount)}</span>
          </div>
        </div>
      )}
    </>
  );
}

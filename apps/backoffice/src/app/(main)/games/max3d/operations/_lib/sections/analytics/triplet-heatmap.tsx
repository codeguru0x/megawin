"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@megawin/shared/utils";
import { Hash } from "lucide-react";
import { TripletDisplay } from "@/components/games/max3d/triplet-display";
import { TenantBreakdown } from "./analytics-panels";
import type { TripletFreq, TenantRow } from "../../types";
import type { TopSingleComboItem, TopPlusComboItem } from "../../use-operations";

interface TripletHeatmapProps {
  triplets: TripletFreq[];
  singleCombos?: TopSingleComboItem[];
  plusCombos?: TopPlusComboItem[];
  tenants: TenantRow[];
}

export function TripletHeatmap({
  triplets,
  singleCombos,
  plusCombos,
  tenants,
}: TripletHeatmapProps) {
  const maxCount = triplets.length > 0 ? Math.max(...triplets.map((t) => t.count)) : 1;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Hash className="size-3.5 text-muted-foreground shrink-0" />
          <CardTitle className="text-sm font-semibold">Tần suất bộ ba số</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top triplets frequency */}
        {triplets.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 text-center py-4">Chưa có dữ liệu</p>
        ) : (
          <div className="space-y-1">
            {triplets.slice(0, 20).map((item) => {
              const widthPct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
              return (
                <div key={item.triplet} className="flex items-center gap-3">
                  <TripletDisplay value={item.triplet} variant="default" size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-500/60 transition-all"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] tabular-nums text-muted-foreground w-8 text-right shrink-0">
                        {formatNumber(item.count)}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs tabular-nums font-medium text-muted-foreground w-20 text-right shrink-0">
                    {formatNumber(item.revenue)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Top single combos (basic mode) */}
        {singleCombos && singleCombos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500/50 shrink-0" />
              Top bộ ba Basic
            </p>
            <div className="flex flex-wrap gap-1.5">
              {singleCombos.slice(0, 10).map((c) => (
                <div
                  key={c.triplet}
                  className="flex items-center gap-1 rounded-md border bg-muted/20 px-2 py-1"
                >
                  <TripletDisplay value={c.triplet} variant="default" size="sm" />
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    ×{formatNumber(c.boardCount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top plus combos */}
        {plusCombos && plusCombos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-rose-500/50 shrink-0" />
              Top cặp đôi Plus
            </p>
            <div className="flex flex-col gap-1">
              {plusCombos.slice(0, 5).map((c) => (
                <div
                  key={`${c.triplet1}-${c.triplet2}`}
                  className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1"
                >
                  <TripletDisplay value={c.triplet1} variant="default" size="sm" />
                  <span className="text-[10px] text-muted-foreground">+</span>
                  <TripletDisplay value={c.triplet2} variant="default" size="sm" />
                  <span className="text-[10px] tabular-nums text-muted-foreground ml-auto">
                    ×{formatNumber(c.boardCount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <TenantBreakdown tenants={tenants} />
      </CardContent>
    </Card>
  );
}

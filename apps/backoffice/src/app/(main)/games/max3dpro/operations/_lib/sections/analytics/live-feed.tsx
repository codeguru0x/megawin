"use client";

import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, displayVNTimeWithSeconds } from "@megawin/shared/utils";
import { Activity, Radio } from "lucide-react";
import { PLAY_MODE_COLORS } from "./analytics-panels";
import { TripletDisplay } from "@/components/games/max3d/triplet-display";
import type { LiveFeedEntry } from "../../types";
import { toTenantUsername } from "@megawin/shared/utils";

export function LiveFeed({
  entries,
  isSettled = false,
}: {
  entries: LiveFeedEntry[];
  isSettled?: boolean;
}) {
  return (
    <Card className="gap-0 py-0 shadow-sm flex flex-col">
      <CardHeader className="px-5 pb-2 pt-4 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground shrink-0" />
          <CardTitle className="text-sm font-semibold">Cược gần nhất</CardTitle>
          {!isSettled && (
            <span className="relative flex size-1.5 ml-auto">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
          )}
        </div>
      </CardHeader>
      <div className="overflow-y-auto px-5 pb-4" style={{ maxHeight: 950 }}>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50">
            <Radio className="size-5 mb-1.5" />
            <p className="text-xs">Chưa có cược</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {entries.map((e, i) => {
              const color = PLAY_MODE_COLORS[e.playMode];
              return (
                <div
                  key={e.entryId}
                  className={cn(
                    "rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/40",
                    i === 0 && "bg-muted/20",
                  )}
                >
                  <div className="grid gap-x-3" style={{ gridTemplateColumns: "1fr auto" }}>
                    {/* Row 1: play mode label */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className={cn(
                          "size-1.5 rounded-full shrink-0",
                          color?.dot ?? "bg-muted-foreground",
                        )}
                      />
                      <span
                        className={cn(
                          "text-[11px] font-semibold truncate",
                          color?.text ?? "text-muted-foreground",
                        )}
                      >
                        {e.playModeLabel}
                      </span>
                    </div>
                    <div />
                    {/* Row 2: triplets | amount */}
                    <div className="flex items-center gap-1 flex-wrap mt-0.5">
                      {e.triplets.slice(0, 4).map((t, idx) => (
                        <TripletDisplay key={idx} value={t} variant="default" size="sm" />
                      ))}
                      {e.triplets.length > 4 && (
                        <span className="text-[9px] text-muted-foreground">
                          +{e.triplets.length - 4}
                        </span>
                      )}
                      {e.lineCount > 1 && (
                        <span className="text-[9px] text-muted-foreground ml-0.5">
                          ({e.lineCount} cặp)
                        </span>
                      )}
                    </div>
                    <div className="flex items-start justify-end">
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {formatNumber(e.amount)}
                      </span>
                    </div>
                    {/* Row 3: username · tenant | time */}
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {e.username && (
                        <>
                          <span className="font-medium text-foreground/70">
                            {toTenantUsername(e.username)}
                          </span>
                          <span className="mx-1">·</span>
                        </>
                      )}
                      {e.tenant}
                    </div>
                    <div className="flex items-start justify-end">
                      <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                        {displayVNTimeWithSeconds(e.time)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

"use client";

/**
 * Mega 6/45 Operations — Live Feed
 *
 * Hiển thị N entries cược gần nhất của kỳ quay đang chạy.
 * Mega 6/45: chỉ có mainNumbers (01-45), không có specialNumbers.
 */

import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@megawin/shared/utils/number";
import { Activity, Radio } from "lucide-react";
import { PLAY_TYPE_COLORS } from "./analytics-panels";
import { NumberBadge } from "./number-heatmap";
import { displayVNTimeWithSeconds } from "@megawin/shared/utils/date";
import type { LiveFeedEntry } from "../../types";
import { parseUsername } from "@megawin/identity-application/shared";

// ─── Main Component ───────────────────────────────────────────────────────────

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
            <span className="ml-auto flex items-center gap-1 text-[10px] text-teal-500 font-medium">
              <span className="size-1.5 rounded-full bg-teal-500 animate-pulse" />
              Live
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
              const color = PLAY_TYPE_COLORS[e.playType];
              const { mainNumbers, suffix } = e;

              return (
                <div
                  key={e.entryId}
                  className={cn(
                    "rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/40",
                    i === 0 && "bg-muted/20",
                  )}
                >
                  <div className="grid gap-x-3" style={{ gridTemplateColumns: "1fr auto" }}>
                    {/* Row 1: play type */}
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
                        {e.playTypeLabel}
                      </span>
                    </div>
                    <div /> {/* empty right cell */}
                    {/* Row 2: numbers (left) | amount (right) */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {mainNumbers.map((n, idx) => (
                        <NumberBadge key={`m-${idx}`} num={n} />
                      ))}
                      {suffix && (
                        <span className="text-[9px] text-muted-foreground ml-0.5">{suffix}</span>
                      )}
                    </div>
                    <div className="flex items-start justify-end">
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {formatNumber(e.amount)}
                      </span>
                    </div>
                    {/* Row 3: username · tenant (left) | time (right) */}
                    <div className="text-[10px] text-muted-foreground truncate">
                      {e.username && (
                        <>
                          <span className="font-medium text-foreground/70">
                            {parseUsername(e.username)?.playerExternalId ?? e.username}
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

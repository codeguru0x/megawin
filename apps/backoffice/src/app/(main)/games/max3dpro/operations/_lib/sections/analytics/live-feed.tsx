"use client";

/**
 * Max 3D Pro — Live Feed
 *
 * Hiển thị entries cược gần nhất, pattern đồng nhất với Max3D và các game khác.
 * border-l-2 theo play mode color, font size minimum text-xs.
 */

import { displayVNTimeWithSeconds, formatNumber } from "@megawin/shared/utils";
import { Activity, Radio } from "lucide-react";

import { TripletDisplay } from "@/components/games/max3d/triplet-display";
import { PlayerName } from "@/components/player-name";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { LiveFeedEntry } from "../../types";

/** Màu theo play mode (multiNumber emerald / multiDigit violet) — UI-only, chuyển từ analytics-panels cũ. */
const PLAY_MODE_COLORS: Record<string, { dot: string; text: string; fill: string }> = {
  multiNumber: {
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    fill: "#10b981",
  },
  multiDigit: {
    dot: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
    fill: "#8b5cf6",
  },
};

/**
 * Ngưỡng "cược lớn" (VND) — đọc từ `snapshot.thresholds.largeBetAmount` (config thực,
 * KHÔNG hardcode). 0 khi chưa load → không tô. Đồng bộ với ngưỡng alert `large_bet`
 * worker sinh, tránh mâu thuẫn feed vs alert.
 */

export function LiveFeed({
  entries,
  isSettled = false,
  largeBetThreshold,
}: {
  entries: LiveFeedEntry[];
  isSettled?: boolean;
  /** Ngưỡng cược lớn (VND) từ `snapshot.thresholds` — 0 khi chưa load (không tô). */
  largeBetThreshold: number;
}) {
  return (
    <Card className="gap-0 py-0 shadow-sm flex flex-col">
      <CardHeader className="px-5 pb-2 pt-4 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground shrink-0" />
          <CardTitle className="text-sm font-semibold">Cược gần nhất</CardTitle>
          {!isSettled && (
            <span className="ml-auto flex items-center gap-1 text-xs text-pink-600 font-medium">
              <span className="size-1.5 rounded-full bg-pink-500 animate-pulse" />
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
              const color = PLAY_MODE_COLORS[e.playMode];
              const isLargeBet = largeBetThreshold > 0 && e.amount >= largeBetThreshold;
              return (
                <div
                  key={e.entryId}
                  className={cn(
                    "rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/40 border-l-2",
                    i === 0 && "bg-muted/20",
                    isLargeBet && "bg-red-500/5",
                  )}
                  style={{
                    borderLeftColor: isLargeBet ? "#ef4444" : (color?.fill ?? "transparent"),
                  }}
                >
                  <div className="grid gap-x-3" style={{ gridTemplateColumns: "1fr auto" }}>
                    {/* Row 1: play mode label */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={cn("size-1.5 rounded-full shrink-0", color?.dot ?? "bg-muted-foreground")} />
                      <span className={cn("text-xs font-semibold truncate", color?.text ?? "text-muted-foreground")}>
                        {e.playModeLabel}
                      </span>
                      {isLargeBet && (
                        <span className="inline-flex h-4 items-center rounded-full bg-red-500/15 px-1.5 text-[10px] font-semibold text-red-600 dark:text-red-400 shrink-0">
                          Cược lớn
                        </span>
                      )}
                    </div>
                    <div />

                    {/* Row 2: triplets + meta | amount */}
                    <div className="flex items-center gap-1 flex-nowrap overflow-hidden mt-0.5">
                      {e.triplets.slice(0, 4).map((t, idx) => (
                        <TripletDisplay key={idx} value={t} variant="default" size="sm" />
                      ))}
                      {e.triplets.length > 4 && (
                        <span className="text-xs text-muted-foreground shrink-0">+{e.triplets.length - 4}</span>
                      )}
                      {e.lineCount > 1 && (
                        <span className="text-xs text-muted-foreground shrink-0 ml-0.5">({e.lineCount} cặp)</span>
                      )}
                      {e.betCount > 1 && (
                        <span className="text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1 rounded shrink-0 ml-0.5">
                          ×{e.betCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-start justify-end">
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {formatNumber(e.amount)}
                      </span>
                    </div>

                    {/* Row 3: player (primary · tenant qua PlayerName) | time */}
                    <div className="min-w-0 truncate mt-0.5">
                      <PlayerName username={e.username} className="text-xs" />
                    </div>
                    <div className="flex items-start justify-end">
                      <span className="text-xs font-mono tabular-nums text-muted-foreground">
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

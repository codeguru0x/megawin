"use client";

/**
 * Max 3D — Live Feed
 *
 * Hiển thị entries cược gần nhất, pattern đồng nhất với các game khác.
 * border-l-2 theo play mode color, font size minimum text-xs.
 *
 * Label rule: Basic Straight và Plus Straight là default → KHÔNG hiển thị label.
 * Chỉ hiển thị label khi play type khác default (combo3, combo6).
 */
import { PlayMode, PlayType } from "@megawin/game-max3d/entities";
import { displayVNTimeWithSeconds, formatNumber } from "@megawin/shared/utils";
import { Activity, Radio } from "lucide-react";

import { TripletDisplay } from "@/components/games/max3d/triplet-display";
import { PlayerName } from "@/components/player-name";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { LiveFeedEntry } from "../../types";

/** Màu theo play mode (basic emerald / plus violet) — UI-only, chuyển từ analytics-panels cũ. */
const PLAY_MODE_COLORS: Record<string, { dot: string; text: string; fill: string }> = {
  [PlayMode.Basic]: {
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    fill: "#10b981",
  },
  [PlayMode.Plus]: {
    dot: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
    fill: "#8b5cf6",
  },
};

const COMBO_LABELS: Record<string, string> = {
  [PlayType.Combo3]: "Tổ hợp 3",
  [PlayType.Combo6]: "Tổ hợp 6",
};

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
    <Card className="flex flex-col gap-0 py-0 shadow-sm">
      <CardHeader className="shrink-0 px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="text-muted-foreground size-4 shrink-0" />
          <CardTitle className="text-sm font-semibold">Cược gần nhất</CardTitle>
          {!isSettled && (
            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-violet-600">
              <span className="size-1.5 animate-pulse rounded-full bg-violet-500" />
              Live
            </span>
          )}
        </div>
      </CardHeader>
      <div className="max-h-[950px] overflow-y-auto px-5 pb-4">
        {entries.length === 0 ? (
          <div className="text-muted-foreground/50 flex flex-col items-center justify-center py-8">
            <Radio className="mb-1.5 size-5" />
            <p className="text-xs">Chưa có cược</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {entries.map((e, i) => {
              const key = `${e.playMode}.${e.playType}`;
              const color = PLAY_MODE_COLORS[key];
              const isPlus = e.playMode === PlayMode.Plus;
              const isCombo = e.playType === PlayType.Combo3 || e.playType === PlayType.Combo6;
              const modeLabel = isPlus ? "3D+" : "";
              const comboLabel = COMBO_LABELS[e.playType] ?? "";
              const displayLabel = [modeLabel, comboLabel].filter(Boolean).join(" ");
              const isLargeBet = largeBetThreshold > 0 && e.amount >= largeBetThreshold;

              return (
                <div
                  key={e.entryId}
                  className={cn(
                    "hover:bg-muted/40 rounded-lg border-l-2 border-l-[var(--feed-border)] px-2.5 py-2 transition-colors",
                    i === 0 && "bg-muted/20",
                    isLargeBet && "bg-red-500/5",
                  )}
                  style={
                    { "--feed-border": isLargeBet ? "#ef4444" : (color?.fill ?? "transparent") } as React.CSSProperties
                  }
                >
                  <div className="grid [grid-template-columns:1fr_auto] gap-x-3">
                    {/* Row 1: play type label (chỉ hiển thị khi khác default) */}
                    {displayLabel || isLargeBet ? (
                      <>
                        <div className="flex min-w-0 items-center gap-1.5">
                          {displayLabel && (
                            <>
                              <div
                                className={cn("size-1.5 shrink-0 rounded-full", color?.dot ?? "bg-muted-foreground")}
                              />
                              <span
                                className={cn("truncate text-xs font-semibold", color?.text ?? "text-muted-foreground")}
                              >
                                {displayLabel}
                              </span>
                            </>
                          )}
                          {isLargeBet && (
                            <span className="text-3xs inline-flex h-4 shrink-0 items-center rounded-full bg-red-500/15 px-1.5 font-semibold text-red-600 dark:text-red-400">
                              Cược lớn
                            </span>
                          )}
                        </div>
                        <div />
                      </>
                    ) : null}

                    {/* Row 2: triplets + meta | amount */}
                    <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
                      {e.triplets.slice(0, 4).map((t, idx) => (
                        <TripletDisplay key={idx} value={t} variant="default" size="sm" />
                      ))}
                      {e.triplets.length > 4 && (
                        <span className="text-muted-foreground shrink-0 text-xs">+{e.triplets.length - 4}</span>
                      )}
                      {isCombo && e.lineCount > 1 && (
                        <span className="text-muted-foreground ml-0.5 shrink-0 text-xs">({e.lineCount} lines)</span>
                      )}
                      {e.betCount > 1 && (
                        <span className="ml-0.5 shrink-0 rounded bg-amber-100 px-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          ×{e.betCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-start justify-end">
                      <span className="text-foreground text-xs font-semibold tabular-nums">
                        {formatNumber(e.amount)}
                      </span>
                    </div>

                    {/* Row 3: player (primary · tenant qua PlayerName) | time */}
                    <div className="min-w-0 truncate">
                      <PlayerName username={e.username} className="text-xs" />
                    </div>
                    <div className="flex items-start justify-end">
                      <span className="text-muted-foreground font-mono text-xs tabular-nums">
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

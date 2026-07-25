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
import { displayVNTimeWithSeconds, formatNumber, toTenantUsername } from "@megawin/shared/utils";
import { Activity, Radio } from "lucide-react";

import { TripletDisplay } from "@/components/games/max3d/triplet-display";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { LiveFeedEntry } from "../../types";
import { PLAY_MODE_COLORS } from "./analytics-panels";

const COMBO_LABELS: Record<string, string> = {
  [PlayType.Combo3]: "Tổ hợp 3",
  [PlayType.Combo6]: "Tổ hợp 6",
};

/**
 * Ngưỡng "cược lớn" (VND): entry có amount ≥ ngưỡng được highlight border đỏ +
 * chip để người trực ca chú ý dòng tiền lớn bất thường. Max3D có giải ĐB Plus
 * tới 1 tỷ, cược multiNumber/multiDigit nhiều board × betCount có thể lên tới
 * vài triệu/kỳ — cao hơn game không-triplet (Keno/Bingo18). Đặt baseline
 * 2.000.000 (quan sát thực tế rồi tinh chỉnh, xem ghi chú ở Keno LiveFeed).
 */
const LARGE_BET_THRESHOLD = 2_000_000;

export function LiveFeed({ entries, isSettled = false }: { entries: LiveFeedEntry[]; isSettled?: boolean }) {
  return (
    <Card className="gap-0 py-0 shadow-sm flex flex-col">
      <CardHeader className="px-5 pb-2 pt-4 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground shrink-0" />
          <CardTitle className="text-sm font-semibold">Cược gần nhất</CardTitle>
          {!isSettled && (
            <span className="ml-auto flex items-center gap-1 text-xs text-violet-600 font-medium">
              <span className="size-1.5 rounded-full bg-violet-500 animate-pulse" />
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
              const key = `${e.playMode}.${e.playType}`;
              const color = PLAY_MODE_COLORS[key];
              const isPlus = e.playMode === PlayMode.Plus;
              const isCombo = e.playType === PlayType.Combo3 || e.playType === PlayType.Combo6;
              const modeLabel = isPlus ? "3D+" : "";
              const comboLabel = COMBO_LABELS[e.playType] ?? "";
              const displayLabel = [modeLabel, comboLabel].filter(Boolean).join(" ");
              const isLargeBet = e.amount >= LARGE_BET_THRESHOLD;

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
                    {/* Row 1: play type label (chỉ hiển thị khi khác default) */}
                    {displayLabel || isLargeBet ? (
                      <>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {displayLabel && (
                            <>
                              <div
                                className={cn("size-1.5 rounded-full shrink-0", color?.dot ?? "bg-muted-foreground")}
                              />
                              <span
                                className={cn("text-xs font-semibold truncate", color?.text ?? "text-muted-foreground")}
                              >
                                {displayLabel}
                              </span>
                            </>
                          )}
                          {isLargeBet && (
                            <span className="inline-flex h-4 items-center rounded-full bg-red-500/15 px-1.5 text-[10px] font-semibold text-red-600 dark:text-red-400 shrink-0">
                              Cược lớn
                            </span>
                          )}
                        </div>
                        <div />
                      </>
                    ) : null}

                    {/* Row 2: triplets + meta | amount */}
                    <div className="flex items-center gap-1 flex-nowrap overflow-hidden">
                      {e.triplets.slice(0, 4).map((t, idx) => (
                        <TripletDisplay key={idx} value={t} variant="default" size="sm" />
                      ))}
                      {e.triplets.length > 4 && (
                        <span className="text-xs text-muted-foreground shrink-0">+{e.triplets.length - 4}</span>
                      )}
                      {isCombo && e.lineCount > 1 && (
                        <span className="text-xs text-muted-foreground shrink-0 ml-0.5">({e.lineCount} lines)</span>
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

                    {/* Row 3: username · tenant | time */}
                    <div className="text-xs text-muted-foreground truncate">
                      {e.username && (
                        <>
                          <span className="font-medium text-foreground/70">{toTenantUsername(e.username)}</span>
                          <span className="mx-1">·</span>
                        </>
                      )}
                      {e.tenant}
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

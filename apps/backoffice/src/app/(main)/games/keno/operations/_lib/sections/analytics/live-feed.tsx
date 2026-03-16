"use client";

/**
 * Keno Operations — Live Feed
 *
 * Hiển thị entries cược gần nhất của kỳ Keno đang chạy.
 * Keno: entry có thể có nhiều boards (pick) + side bets.
 * Hiển thị board đầu tiên hoặc side bet đầu tiên.
 */

import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@megawin/shared/utils/number";
import { Activity, Radio } from "lucide-react";
import { displayVNTimeWithSeconds } from "@megawin/shared/utils/date";
import { parseUsername } from "@megawin/identity-application/shared";
import { KENO_PLAY_TYPE_LABELS } from "@megawin/game-keno/labels";
import { NumberBadge } from "./number-heatmap";
import type { LiveFeedEntry } from "../../types";

// ─── PlayType color map — Keno ───────────────────────────────────────────────

const PLAY_TYPE_COLORS: Record<string, { dot: string; text: string }> = {
  pick1: { dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400" },
  pick2: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  pick3: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  pick4: { dot: "bg-orange-400", text: "text-orange-600 dark:text-orange-400" },
  pick5: { dot: "bg-orange-500", text: "text-orange-600 dark:text-orange-400" },
  pick6: { dot: "bg-orange-500", text: "text-orange-600 dark:text-orange-400" },
  pick7: { dot: "bg-orange-600", text: "text-orange-600 dark:text-orange-400" },
  pick8: { dot: "bg-red-400", text: "text-red-600 dark:text-red-400" },
  pick9: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  pick10: { dot: "bg-red-600", text: "text-red-600 dark:text-red-400" },
  bigSmall: { dot: "bg-cyan-500", text: "text-cyan-600 dark:text-cyan-400" },
  evenOdd: { dot: "bg-teal-500", text: "text-teal-600 dark:text-teal-400" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function LiveFeed({
  entries,
  totalCount,
  isSettled = false,
}: {
  entries: LiveFeedEntry[];
  totalCount: number;
  isSettled?: boolean;
}) {
  return (
    <Card className="gap-0 py-0 shadow-sm flex flex-col">
      <CardHeader className="px-5 pb-2 pt-4 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground shrink-0" />
          <CardTitle className="text-sm font-semibold">Cược gần nhất</CardTitle>
          {!isSettled && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-orange-500 font-medium">
              <span className="size-1.5 rounded-full bg-orange-500 animate-pulse" />
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
              const label = KENO_PLAY_TYPE_LABELS[e.playType as keyof typeof KENO_PLAY_TYPE_LABELS] ?? e.playType;
              const isSideBet = e.playType === "bigSmall" || e.playType === "evenOdd";

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
                        {label}
                      </span>
                    </div>
                    <div />
                    {/* Row 2: numbers (left) | amount (right) */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {isSideBet ? (
                        // Side bets không có số cụ thể
                        <span className="text-[11px] text-muted-foreground italic">
                          (không có số cụ thể)
                        </span>
                      ) : (
                        e.numbers.map((n, idx) => <NumberBadge key={`n-${idx}`} num={n} />)
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

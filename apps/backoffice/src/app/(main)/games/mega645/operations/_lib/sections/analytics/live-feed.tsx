"use client";

/**
 * Mega 6/45 Operations — Live Feed
 *
 * Hiển thị N entries cược gần nhất của kỳ quay đang chạy.
 * Mega 6/45: chỉ có numbers (01-45), không có specialNumbers.
 */
import { displayVNTimeWithSeconds, formatNumber, toTenantUsername } from "@megawin/shared/utils";
import { Activity, Radio } from "lucide-react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { LiveFeedEntry } from "../../types";
import { PLAY_TYPE_COLORS } from "./analytics-panels";
import { NumbersWithTooltip } from "./number-heatmap";

/**
 * Ngưỡng (VND) đánh dấu "cược lớn" trong live feed — cược ≥ ngưỡng này được
 * highlight (nền đỏ nhạt + viền trái đỏ + chip "Cược lớn") để người trực ca
 * chú ý ngay.
 *
 * 5.000.000đ cho Mega 6/45: cao hơn Max3D (2tr) vì các kiểu Bao sinh nhiều
 * line/kỳ — ngưỡng thấp sẽ khiến chip hiện quá dày. Đây là baseline theo quan
 * sát, tinh chỉnh sau khi có dữ liệu vận hành thực tế.
 */
const LARGE_BET_THRESHOLD = 5_000_000;

// ─── Main Component ───────────────────────────────────────────────────────────

export function LiveFeed({ entries, isSettled = false }: { entries: LiveFeedEntry[]; isSettled?: boolean }) {
  return (
    <Card className="flex flex-col gap-0 py-0 shadow-sm">
      <CardHeader className="shrink-0 px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="text-muted-foreground size-4 shrink-0" />
          <CardTitle className="text-sm font-semibold">Cược gần nhất</CardTitle>
          {!isSettled && (
            <span className="text-game-mega645 ml-auto flex items-center gap-1 text-xs font-medium">
              <span className="bg-game-mega645 size-1.5 animate-pulse rounded-full" />
              Live
            </span>
          )}
        </div>
      </CardHeader>
      <div className="overflow-y-auto px-5 pb-4" style={{ maxHeight: 950 }}>
        {entries.length === 0 ? (
          <div className="text-muted-foreground/50 flex flex-col items-center justify-center py-8">
            <Radio className="mb-1.5 size-5" />
            <p className="text-xs">Chưa có cược</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {entries.map((e, i) => {
              const color = PLAY_TYPE_COLORS[e.playType];
              const { numbers, suffix } = e;
              const isLargeBet = e.amount >= LARGE_BET_THRESHOLD;

              return (
                <div
                  key={e.entryId}
                  className={cn(
                    "hover:bg-muted/40 rounded-lg border-l-2 px-2.5 py-2 transition-colors",
                    i === 0 && "bg-muted/20",
                    isLargeBet && "bg-loss/5",
                  )}
                  style={{
                    borderLeftColor: isLargeBet ? "#ef4444" : (color?.fill ?? "transparent"),
                  }}
                >
                  <div className="grid gap-x-3" style={{ gridTemplateColumns: "1fr auto" }}>
                    {/* Row 1: play type */}
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div className={cn("size-1.5 shrink-0 rounded-full", color?.dot ?? "bg-muted-foreground")} />
                      <span className={cn("truncate text-xs font-semibold", color?.text ?? "text-muted-foreground")}>
                        {e.playTypeLabel}
                      </span>
                      {isLargeBet && (
                        <span className="bg-loss/10 text-loss shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold">
                          Cược lớn
                        </span>
                      )}
                    </div>
                    <div /> {/* empty right cell */}
                    {/* Row 2: numbers (left) | amount (right) */}
                    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                      <NumbersWithTooltip numbers={numbers} variant="soft" />
                      {suffix && <span className="text-muted-foreground shrink-0 text-xs">{suffix}</span>}
                    </div>
                    <div className="flex items-start justify-end">
                      <span className="text-foreground text-xs font-semibold tabular-nums">
                        {formatNumber(e.amount)}
                      </span>
                    </div>
                    {/* Row 3: username · tenant (left) | time (right) */}
                    <div className="text-muted-foreground truncate text-xs">
                      {e.username && (
                        <>
                          <span className="text-foreground/70 font-medium">{toTenantUsername(e.username)}</span>
                          <span className="mx-1">·</span>
                        </>
                      )}
                      {e.tenant}
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

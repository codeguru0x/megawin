"use client";

/**
 * Lotto 5/35 Operations — Live Feed
 *
 * Hiển thị N entries cược gần nhất của kỳ quay đang chạy.
 * Lotto 5/35: mainNumbers (01-35) + specialNumbers (01-12, chỉ khi SpecialCover).
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
 * 5.000.000đ cho Lotto 5/35: cao hơn Max3D (2tr) vì các kiểu Bao sinh nhiều
 * line/kỳ (VD Bao 15 = 3.003 line × 10k ≈ 30tr/kỳ) — ngưỡng thấp sẽ khiến chip
 * hiện quá dày. Đây là baseline theo quan sát, tinh chỉnh sau khi có dữ liệu
 * vận hành thực tế.
 */
const LARGE_BET_THRESHOLD = 5_000_000;

// ─── Main Component ───────────────────────────────────────────────────────────

export function LiveFeed({ entries, isSettled = false }: { entries: LiveFeedEntry[]; isSettled?: boolean }) {
  return (
    <Card className="gap-0 py-0 shadow-sm flex flex-col">
      <CardHeader className="px-5 pb-2 pt-4 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground shrink-0" />
          <CardTitle className="text-sm font-semibold">Cược gần nhất</CardTitle>
          {!isSettled && (
            <span className="ml-auto flex items-center gap-1 text-xs text-amber-500 font-medium">
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
              Live
            </span>
          )}
        </div>
      </CardHeader>
      {/* Chiều cao cố định, scroll khi vượt */}
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
              const { mainNumbers, specialNumbers, suffix } = e;
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
                  {/* Grid 3 rows × 2 cols:
                      row1: play-type label | (empty)
                      row2: number badges   | amount
                      row3: footer          | time   */}
                  <div className="grid gap-x-3" style={{ gridTemplateColumns: "1fr auto" }}>
                    {/* Row 1: play type label (left) — right cell empty */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={cn("size-1.5 rounded-full shrink-0", color?.dot ?? "bg-muted-foreground")} />
                      <span className={cn("text-xs font-semibold truncate", color?.text ?? "text-muted-foreground")}>
                        {e.playTypeLabel}
                      </span>
                      {isLargeBet && (
                        <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                          Cược lớn
                        </span>
                      )}
                    </div>
                    <div /> {/* empty right cell for row 1 */}
                    {/* Row 2: number badges (left) | amount (right) */}
                    <div className="min-w-0 overflow-hidden flex items-center gap-1">
                      <NumbersWithTooltip numbers={mainNumbers} variant="soft" ballVariant="main" />
                      {suffix && <span className="text-xs text-muted-foreground shrink-0">{suffix}</span>}
                      {specialNumbers.length > 0 && (
                        <>
                          <span className="text-xs text-muted-foreground mx-0.5 shrink-0">+</span>
                          <NumbersWithTooltip numbers={specialNumbers} variant="soft" ballVariant="special" />
                        </>
                      )}
                    </div>
                    <div className="flex items-start justify-end">
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {formatNumber(e.amount)}
                      </span>
                    </div>
                    {/* Row 3: username · tenant (left) | time (right) */}
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

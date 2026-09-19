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

function resolveFeedBorder(isLargeBet: boolean, fill: string | undefined): string {
  if (isLargeBet) {
    return "#ef4444";
  }
  return fill ?? "transparent";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LiveFeed({ entries, isSettled = false }: { entries: LiveFeedEntry[]; isSettled?: boolean }) {
  return (
    <Card className="flex flex-col gap-0 py-0 shadow-sm">
      <CardHeader className="shrink-0 px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="text-muted-foreground size-4 shrink-0" />
          <CardTitle className="text-sm font-semibold">Cược gần nhất</CardTitle>
          {!isSettled && (
            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-amber-500">
              <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
              Live
            </span>
          )}
        </div>
      </CardHeader>
      {/* Chiều cao cố định, scroll khi vượt */}
      <div className="max-h-[950px] overflow-y-auto px-5 pb-4">
        {entries.length === 0 ? (
          <div className="text-muted-foreground/50 flex flex-col items-center justify-center py-8">
            <Radio className="mb-1.5 size-5" />
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
                    "hover:bg-muted/40 rounded-lg border-l-2 border-l-(--feed-border) px-2.5 py-2 transition-colors",
                    i === 0 && "bg-muted/20",
                    isLargeBet && "bg-red-500/5",
                  )}
                  style={{ "--feed-border": resolveFeedBorder(isLargeBet, color?.fill) } as React.CSSProperties}
                >
                  {/* Grid 3 rows × 2 cols:
                      row1: play-type label | (empty)
                      row2: number badges   | amount
                      row3: footer          | time   */}
                  <div className="grid [grid-template-columns:1fr_auto] gap-x-3">
                    {/* Row 1: play type label (left) — right cell empty */}
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div className={cn("size-1.5 shrink-0 rounded-full", color?.dot ?? "bg-muted-foreground")} />
                      <span className={cn("truncate text-xs font-semibold", color?.text ?? "text-muted-foreground")}>
                        {e.playTypeLabel}
                      </span>
                      {isLargeBet && (
                        <span className="text-3xs shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 font-semibold text-red-600 dark:text-red-400">
                          Cược lớn
                        </span>
                      )}
                    </div>
                    <div /> {/* empty right cell for row 1 */}
                    {/* Row 2: number badges (left) | amount (right) */}
                    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                      <NumbersWithTooltip numbers={mainNumbers} variant="soft" ballVariant="main" />
                      {suffix && <span className="text-muted-foreground shrink-0 text-xs">{suffix}</span>}
                      {specialNumbers.length > 0 && (
                        <>
                          <span className="text-muted-foreground mx-0.5 shrink-0 text-xs">+</span>
                          <NumbersWithTooltip numbers={specialNumbers} variant="soft" ballVariant="special" />
                        </>
                      )}
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

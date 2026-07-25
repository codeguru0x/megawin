"use client";

/**
 * Bingo 18 – Live Feed
 *
 * Hiển thị entries cược gần nhất của kỳ Bingo 18 đang chạy.
 * Bingo 18: entry có boards (singleNum/doubleMatch/tripleMatch) + sideBets (sumTotal/bigSmallDraw).
 * Hiển thị board đầu tiên hoặc sideBet đầu tiên làm preview.
 */

import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, displayVNTimeWithSeconds } from "@megawin/shared/utils";
import { Activity, Radio } from "lucide-react";
import { toTenantUsername } from "@megawin/shared/utils";
import {
  BINGO18_PLAY_TYPE_LABELS,
  BINGO18_TRIPLE_KIND_LABELS,
  BINGO18_BIG_SMALL_BET_LABELS,
} from "@megawin/game-bingo18/labels";
import type { LiveFeedEntry } from "../../types";

const PLAY_TYPE_COLORS: Record<string, { dot: string; text: string; fill: string }> = {
  singleNum: { dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400", fill: "#fbbf24" },
  doubleMatch: {
    dot: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
    fill: "#f97316",
  },
  "tripleMatch-specific": {
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    fill: "#ef4444",
  },
  "tripleMatch-any": {
    dot: "bg-rose-400",
    text: "text-rose-600 dark:text-rose-400",
    fill: "#fb7185",
  },
  sumTotal: { dot: "bg-cyan-500", text: "text-cyan-600 dark:text-cyan-400", fill: "#0ea5e9" },
  bigSmallDraw: { dot: "bg-teal-500", text: "text-teal-600 dark:text-teal-400", fill: "#14b8a6" },
};

/** Compound key labels for tripleMatch subtypes in live feed */
const BINGO18_ANALYTICS_LABELS: Record<string, string> = {
  ...BINGO18_PLAY_TYPE_LABELS,
  "tripleMatch-specific": BINGO18_TRIPLE_KIND_LABELS["specific"],
  "tripleMatch-any": BINGO18_TRIPLE_KIND_LABELS["any"],
};

/**
 * Ngưỡng "cược lớn" (VND): entry có amount ≥ ngưỡng được highlight border đỏ +
 * chip để người trực ca chú ý dòng tiền lớn bất thường trong 1 kỳ Bingo18 ~6 phút.
 *
 * Guideline chọn ngưỡng per-game (khi rollout sang game khác):
 * - Công thức gợi ý: `~100 × unitPrice` (mọi game hiện tại unitPrice = 10.000đ
 *   → 1.000.000đ). Tức 1 vé gấp ~100 lần mức cược phổ thông mới đáng chú ý.
 * - Game chu kỳ dài (mega645/power655/lotto535, 1 kỳ/ngày): doanh thu/kỳ lớn hơn
 *   nhiều → có thể nâng lên 2–5 triệu để tránh highlight quá dày.
 * - Game chu kỳ ngắn (keno/bingo18, 6–8 phút/kỳ): giữ 1 triệu — mỗi kỳ ít tiền,
 *   1 triệu đã là outlier thật sự.
 * - Mỗi game tự đặt const này trong live-feed.tsx của game đó; điều chỉnh sau khi
 *   quan sát phân phối amount thực tế trong vận hành.
 */
const LARGE_BET_THRESHOLD = 1_000_000;

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
            <span className="ml-auto flex items-center gap-1 text-xs text-green-600 font-medium">
              <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
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
              const label = BINGO18_ANALYTICS_LABELS[e.playType] ?? e.playType;
              const isSide = e.playType === "sumTotal" || e.playType === "bigSmallDraw";
              const isLargeBet = e.amount >= LARGE_BET_THRESHOLD;

              return (
                <div
                  key={e.entryId}
                  className={cn(
                    "rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/40 border-l-2",
                    i === 0 && "bg-muted/20",
                    // Cược lớn: nền đỏ nhạt + border đỏ để nổi bật ngay trong feed
                    isLargeBet && "bg-red-500/5",
                  )}
                  style={{
                    borderLeftColor: isLargeBet ? "#ef4444" : (color?.fill ?? "transparent"),
                  }}
                >
                  <div className="grid gap-x-3" style={{ gridTemplateColumns: "1fr auto" }}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className={cn(
                          "size-1.5 rounded-full shrink-0",
                          color?.dot ?? "bg-muted-foreground",
                        )}
                      />
                      <span
                        className={cn(
                          "text-xs font-semibold truncate",
                          color?.text ?? "text-muted-foreground",
                        )}
                      >
                        {label}
                      </span>
                      {isLargeBet && (
                        <span className="inline-flex h-4 items-center rounded-full bg-red-500/15 px-1.5 text-[10px] font-semibold text-red-600 dark:text-red-400 shrink-0">
                          Cược lớn
                        </span>
                      )}
                    </div>
                    <div />
                    <div className="flex items-center gap-1 flex-nowrap overflow-hidden">
                      {isSide
                        ? (() => {
                            if (e.playType === "sumTotal" && e.sum !== undefined) {
                              // sumTotal: hiển thị "Tổng 9", "Tổng 14", ...
                              return (
                                <span className="inline-flex h-5 items-center justify-center rounded-full bg-cyan-500/15 px-2 text-xs font-semibold text-cyan-700 dark:text-cyan-400 tabular-nums shrink-0">
                                  Tổng {e.sum}
                                </span>
                              );
                            }
                            if (e.playType === "bigSmallDraw" && e.bet !== undefined) {
                              // bigSmallDraw: hiển thị "Lớn" / "Hòa" / "Nhỏ"
                              const betLabel =
                                (BINGO18_BIG_SMALL_BET_LABELS as Record<string, string>)[e.bet] ??
                                e.bet;
                              return (
                                <span className="inline-flex h-5 items-center justify-center rounded-full bg-teal-500/15 px-2 text-xs font-semibold text-teal-700 dark:text-teal-400 shrink-0">
                                  {betLabel}
                                </span>
                              );
                            }
                            // fallback
                            return <span className="text-xs text-muted-foreground italic">—</span>;
                          })()
                        : e.numbers.length > 0
                          ? e.numbers.map((n, idx) => (
                              <span
                                key={`n-${idx}`}
                                className="inline-flex size-6 items-center justify-center rounded-full bg-green-500 text-white text-[11px] font-bold tabular-nums shrink-0"
                              >
                                {n}
                              </span>
                            ))
                          : null}
                    </div>
                    <div className="flex items-start justify-end">
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {formatNumber(e.amount)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
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

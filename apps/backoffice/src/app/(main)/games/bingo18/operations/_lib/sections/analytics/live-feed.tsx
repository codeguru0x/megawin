"use client";

/**
 * Bingo 18 – Live Feed (cột rộng, tab Phân tích cược)
 *
 * Chia 2 CỘT LỆCH theo luật chơi (guideline §5): **Cơ bản** cột rộng (`1.7fr` —
 * singleNum/doubleMatch/tripleMatch) | **Bổ sung** cột hẹp (`1fr` — sumTotal/bigSmallDraw,
 * chỉ 1 chip). Mỗi cột header (icon + count) + cuộn ĐỘC LẬP. Container query stack dọc
 * khi hẹp. Cược lớn (≥ `thresholds.largeBetAmount` từ snapshot — KHÔNG hardcode) tô
 * đỏ + chip. Username qua `PlayerName` (rule player-display-username).
 */
import {
  BINGO18_BIG_SMALL_BET_LABELS,
  BINGO18_PLAY_TYPE_LABELS,
  BINGO18_TRIPLE_KIND_LABELS,
} from "@megawin/game-bingo18/labels";
import { displayVNTimeWithSeconds, formatNumber } from "@megawin/shared/utils";
import { Activity, Layers, Radio } from "lucide-react";

import { PlayerName } from "@/components/player-name";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

const SIDE_PLAY_TYPES = new Set(["sumTotal", "bigSmallDraw"]);

/** 1 dòng entry trong feed — dùng chung cho cả 2 cột. */

function resolveFeedBorder(isLargeBet: boolean, fill: string | undefined): string {
  if (isLargeBet) {
    return "#ef4444";
  }
  return fill ?? "transparent";
}

function FeedRow({
  entry,
  isFirst,
  largeBetThreshold,
}: {
  entry: LiveFeedEntry;
  isFirst: boolean;
  largeBetThreshold: number;
}) {
  const color = PLAY_TYPE_COLORS[entry.playType];
  const label = BINGO18_ANALYTICS_LABELS[entry.playType] ?? entry.playType;
  const isSide = SIDE_PLAY_TYPES.has(entry.playType.split("-")[0] ?? entry.playType);
  const isLargeBet = largeBetThreshold > 0 && entry.amount >= largeBetThreshold;

  return (
    <div
      className={cn(
        "hover:bg-muted/40 rounded-lg border-l-2 border-l-(--feed-border) px-2.5 py-2 transition-colors",
        isFirst && "bg-muted/20",
        isLargeBet && "bg-red-500/5",
      )}
      style={{ "--feed-border": resolveFeedBorder(isLargeBet, color?.fill) } as React.CSSProperties}
    >
      <div className="grid [grid-template-columns:1fr_auto] gap-x-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className={cn("size-1.5 shrink-0 rounded-full", color?.dot ?? "bg-muted-foreground")} />
          <span className={cn("truncate text-xs font-semibold", color?.text ?? "text-muted-foreground")}>{label}</span>
          {isLargeBet && (
            <span className="text-3xs inline-flex h-4 shrink-0 items-center rounded-full bg-red-500/15 px-1.5 font-semibold text-red-600 dark:text-red-400">
              Cược lớn
            </span>
          )}
        </div>
        <div />
        <div className="flex flex-wrap items-center gap-1">
          {isSide ? (
            entry.playType === "sumTotal" && entry.sum !== undefined ? (
              <span className="inline-flex h-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 px-2 text-xs font-semibold text-cyan-700 tabular-nums dark:text-cyan-400">
                Tổng {entry.sum}
              </span>
            ) : entry.playType === "bigSmallDraw" && entry.bet !== undefined ? (
              <span className="inline-flex h-5 shrink-0 items-center justify-center rounded-full bg-teal-500/15 px-2 text-xs font-semibold text-teal-700 dark:text-teal-400">
                {(BINGO18_BIG_SMALL_BET_LABELS as Record<string, string>)[entry.bet] ?? entry.bet}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs italic">—</span>
            )
          ) : entry.numbers.length > 0 ? (
            entry.numbers.map((n, idx) => (
              <span
                key={`n-${idx}`}
                className="text-2xs inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-green-500 font-bold text-white tabular-nums"
              >
                {n}
              </span>
            ))
          ) : null}
        </div>
        <div className="flex items-start justify-end">
          <span className="text-foreground text-xs font-semibold tabular-nums">{formatNumber(entry.amount)}</span>
        </div>
        <div className="min-w-0">
          <PlayerName username={entry.username} className="text-xs" />
        </div>
        <div className="flex items-start justify-end">
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {displayVNTimeWithSeconds(entry.time)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 1 cột feed (header + count + cuộn độc lập). */
function FeedColumn({
  icon: Icon,
  title,
  entries,
  largeBetThreshold,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  entries: LiveFeedEntry[];
  largeBetThreshold: number;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-muted-foreground text-xs font-semibold">{title}</span>
        <span className="text-muted-foreground/60 text-2xs tabular-nums">{formatNumber(entries.length)}</span>
      </div>
      <div className="max-h-[560px] space-y-0.5 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <p className="text-muted-foreground/50 py-4 text-center text-xs">Chưa có cược</p>
        ) : (
          entries.map((e, i) => (
            <FeedRow key={e.entryId} entry={e} isFirst={i === 0} largeBetThreshold={largeBetThreshold} />
          ))
        )}
      </div>
    </div>
  );
}

export function LiveFeed({
  entries,
  totalCount,
  isSettled = false,
  largeBetThreshold,
}: {
  entries: LiveFeedEntry[];
  totalCount: number;
  isSettled?: boolean;
  /** Ngưỡng cược lớn (VND) từ `snapshot.thresholds` — 0 khi chưa load (không tô). */
  largeBetThreshold: number;
}) {
  const basicEntries = entries.filter((e) => !SIDE_PLAY_TYPES.has(e.playType.split("-")[0] ?? e.playType));
  const sideEntries = entries.filter((e) => SIDE_PLAY_TYPES.has(e.playType.split("-")[0] ?? e.playType));

  return (
    <Card className="@container/feed flex flex-col gap-0 py-0">
      <CardHeader className="shrink-0 px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="text-muted-foreground size-4 shrink-0" />
          <CardTitle className="text-sm font-semibold">Cược gần nhất</CardTitle>
          <span className="text-muted-foreground/60 text-2xs tabular-nums">{formatNumber(totalCount)} phiếu</span>
          {!isSettled && (
            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-green-600">
              <span className="size-1.5 animate-pulse rounded-full bg-green-500" />
              Live
            </span>
          )}
        </div>
      </CardHeader>
      <div className="px-5 pb-4">
        {entries.length === 0 ? (
          <div className="text-muted-foreground/50 flex flex-col items-center justify-center py-8">
            <Radio className="mb-1.5 size-5" />
            <p className="text-xs">Chưa có cược</p>
          </div>
        ) : (
          // 2 cột lệch: Cơ bản rộng (1.7fr) | Bổ sung hẹp (1fr); stack dọc khi hẹp.
          <div className="grid gap-4 @[32rem]/feed:[grid-template-columns:1.7fr_1fr]">
            <FeedColumn icon={Activity} title="Cơ bản" entries={basicEntries} largeBetThreshold={largeBetThreshold} />
            <FeedColumn icon={Layers} title="Bổ sung" entries={sideEntries} largeBetThreshold={largeBetThreshold} />
          </div>
        )}
      </div>
    </Card>
  );
}

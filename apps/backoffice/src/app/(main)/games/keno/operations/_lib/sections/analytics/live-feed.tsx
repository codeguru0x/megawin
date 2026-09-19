"use client";

/**
 * Keno Operations — Live Feed
 *
 * Cược gần nhất của kỳ Keno, chia 2 nhóm theo luật chơi: **Pick cơ bản** (cột rộng) và
 * **Side bet** (cột hẹp) — layout 2 cột LỆCH tận dụng đúng nhu cầu bề ngang mỗi nhóm
 * (pick nhiều số, side bet chỉ 1 chip). Mỗi cột cuộn độc lập, giữ thứ tự thời gian trong
 * nhóm. Màn hẹp → stack dọc (analysis §4.8).
 */
import { KENO_BIG_SMALL_BET_LABELS, KENO_EVEN_ODD_BET_LABELS, KENO_PLAY_TYPE_LABELS } from "@megawin/game-keno/labels";
import { displayVNTimeWithSeconds, formatNumber } from "@megawin/shared/utils";
import { Activity, Dices, Grid3x3, Radio } from "lucide-react";

import { PlayerName } from "@/components/player-name";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { LiveFeedEntry } from "../../types";
import { NumberBadge } from "./number-heatmap";

// ─── PlayType color map — Keno ───────────────────────────────────────────────

const PLAY_TYPE_COLORS: Record<string, { dot: string; text: string; fill: string }> = {
  pick1: { dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400", fill: "#fbbf24" },
  pick2: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", fill: "#f59e0b" },
  pick3: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", fill: "#f59e0b" },
  pick4: { dot: "bg-orange-400", text: "text-orange-600 dark:text-orange-400", fill: "#fb923c" },
  pick5: { dot: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", fill: "#f97316" },
  pick6: { dot: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", fill: "#f97316" },
  pick7: { dot: "bg-orange-600", text: "text-orange-600 dark:text-orange-400", fill: "#ea580c" },
  pick8: { dot: "bg-red-400", text: "text-red-600 dark:text-red-400", fill: "#f87171" },
  pick9: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400", fill: "#ef4444" },
  pick10: { dot: "bg-red-600", text: "text-red-600 dark:text-red-400", fill: "#dc2626" },
  bigSmall: { dot: "bg-cyan-500", text: "text-cyan-600 dark:text-cyan-400", fill: "#0ea5e9" },
  evenOdd: { dot: "bg-teal-500", text: "text-teal-600 dark:text-teal-400", fill: "#14b8a6" },
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Ngưỡng "cược lớn" (VND): entry có amount ≥ ngưỡng được highlight border đỏ +
 * chip để người trực ca chú ý dòng tiền lớn bất thường trong 1 kỳ Keno ~8 phút.
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

/** Phân loại 1 entry preview theo nhóm luật chơi: side bet (bigSmall/evenOdd) vs pick cơ bản. */
function isSideBetEntry(e: LiveFeedEntry): boolean {
  return e.playType === "bigSmall" || e.playType === "evenOdd";
}

/** 1 dòng entry trong feed — dùng chung cho cả 2 nhóm (Pick / Side bet). */
function FeedRow({ entry, highlightFirst }: { entry: LiveFeedEntry; highlightFirst: boolean }) {
  const color = PLAY_TYPE_COLORS[entry.playType];
  const label = KENO_PLAY_TYPE_LABELS[entry.playType as keyof typeof KENO_PLAY_TYPE_LABELS] ?? entry.playType;
  const isSideBet = isSideBetEntry(entry);
  const isLargeBet = entry.amount >= LARGE_BET_THRESHOLD;

  return (
    <div
      className={cn(
        "hover:bg-muted/40 rounded-lg border-l-2 border-l-[var(--feed-border)] px-2.5 py-2 transition-colors",
        highlightFirst && "bg-muted/20",
        isLargeBet && "bg-red-500/5",
      )}
      style={{ "--feed-border": isLargeBet ? "#ef4444" : (color?.fill ?? "transparent") } as React.CSSProperties}
    >
      <div className="grid [grid-template-columns:1fr_auto] gap-x-3">
        {/* Row 1: play type */}
        <div className="flex min-w-0 items-center gap-1.5">
          <div className={cn("size-1.5 shrink-0 rounded-full", color?.dot ?? "bg-muted-foreground")} />
          <span className={cn("truncate text-xs font-semibold", color?.text ?? "text-muted-foreground")}>{label}</span>
          {isLargeBet && (
            <span className="inline-flex h-4 shrink-0 items-center rounded-full bg-red-500/15 px-1.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
              Cược lớn
            </span>
          )}
        </div>
        <div />
        {/* Row 2: numbers/bet (left) | amount (right) */}
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {isSideBet ? (
            <SideBetChip playType={entry.playType} bet={entry.bet} />
          ) : (
            // Hiển thị ĐỦ số (wrap xuống dòng) — mỗi entry 1 khối riêng, không cắt.
            entry.numbers.map((num) => <NumberBadge key={num} num={num} variant="soft" />)
          )}
        </div>
        <div className="flex items-start justify-end">
          <span className="text-foreground text-xs font-semibold tabular-nums">{formatNumber(entry.amount)}</span>
        </div>
        {/* Row 3: username · tenant (left) | time (right) */}
        <PlayerName username={entry.username || entry.tenant} className="text-muted-foreground min-w-0 text-xs" />
        <div className="flex items-start justify-end">
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {displayVNTimeWithSeconds(entry.time)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Chip loại side bet (Lớn/Nhỏ, Chẵn/Lẻ) — màu theo cặp. */
function SideBetChip({ playType, bet }: { playType: string; bet?: string }) {
  if (playType === "bigSmall" && bet !== undefined) {
    const betLabel = (KENO_BIG_SMALL_BET_LABELS as Record<string, string>)[bet] ?? bet;
    return (
      <span className="inline-flex h-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 px-2 text-xs font-semibold text-cyan-700 dark:text-cyan-400">
        {betLabel}
      </span>
    );
  }
  if (playType === "evenOdd" && bet !== undefined) {
    const betLabel = (KENO_EVEN_ODD_BET_LABELS as Record<string, string>)[bet] ?? bet;
    return (
      <span className="inline-flex h-5 shrink-0 items-center justify-center rounded-full bg-teal-500/15 px-2 text-xs font-semibold text-teal-700 dark:text-teal-400">
        {betLabel}
      </span>
    );
  }
  return <span className="text-muted-foreground text-xs italic">—</span>;
}

/**
 * 1 nhóm feed (Pick cơ bản / Side bet) — header có icon + đếm, list entries cuộn theo thời gian.
 * Nhóm rỗng vẫn render header (count 0) để layout ổn định, người trực biết nhóm đó chưa có cược.
 */
function FeedGroup({
  title,
  icon: Icon,
  accent,
  entries,
  isFirstGroup,
}: {
  title: string;
  icon: typeof Dices;
  accent: string;
  entries: LiveFeedEntry[];
  isFirstGroup: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1.5 py-1">
        <Icon className={cn("size-3.5 shrink-0", accent)} />
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{title}</span>
        <span className="bg-muted text-muted-foreground ml-auto rounded-full px-1.5 text-[11px] font-medium tabular-nums">
          {entries.length}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-muted-foreground/50 px-2.5 py-1.5 text-xs">Chưa có cược nhóm này</p>
      ) : (
        // Mỗi nhóm cuộn ĐỘC LẬP → 2 cột không kéo nhau, thấy đồng thời cược mới nhất mỗi nhóm.
        <div className="max-h-[560px] space-y-0.5 overflow-y-auto pr-0.5">
          {entries.map((e, i) => (
            <FeedRow key={e.entryId} entry={e} highlightFirst={isFirstGroup && i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

export function LiveFeed({
  entries,
  totalCount,
  isSettled = false,
}: {
  entries: LiveFeedEntry[];
  totalCount: number;
  isSettled?: boolean;
}) {
  // Chia 2 nhóm theo luật chơi Keno (analysis §4.8): Pick cơ bản vs Side bet.
  // Giữ nguyên thứ tự thời gian trong mỗi nhóm (entries đã sort desc từ server).
  const pickEntries = entries.filter((e) => !isSideBetEntry(e));
  const sideBetEntries = entries.filter(isSideBetEntry);

  return (
    <Card className="flex flex-col gap-0 py-0 shadow-sm">
      <CardHeader className="shrink-0 px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="text-muted-foreground size-4 shrink-0" />
          <CardTitle className="text-sm font-semibold">Cược gần nhất</CardTitle>
          {totalCount > 0 && (
            <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-[11px] font-medium tabular-nums">
              {formatNumber(totalCount)}
            </span>
          )}
          {!isSettled && (
            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-sky-600">
              <span className="size-1.5 animate-pulse rounded-full bg-sky-500" />
              Live
            </span>
          )}
        </div>
      </CardHeader>
      <div className="@container/feed px-5 pb-4">
        {entries.length === 0 ? (
          <div className="text-muted-foreground/50 flex flex-col items-center justify-center py-8">
            <Radio className="mb-1.5 size-5" />
            <p className="text-xs">Chưa có cược</p>
          </div>
        ) : (
          // 2 cột LỆCH: Pick cơ bản rộng (nhiều số, pick10=10 badge) | Side bet hẹp (1 chip).
          // Mỗi nhóm cuộn độc lập → thấy cả 2 cùng lúc, không cuộn qua nhóm này mới tới nhóm kia.
          // Màn hẹp (feed container < 32rem) → stack dọc, Pick trên (analysis §4.8).
          <div className="grid items-start gap-4 @[32rem]/feed:grid-cols-[1.7fr_1fr]">
            <FeedGroup title="Pick cơ bản" icon={Grid3x3} accent="text-orange-500" entries={pickEntries} isFirstGroup />
            <FeedGroup
              title="Side bet"
              icon={Dices}
              accent="text-cyan-500"
              entries={sideBetEntries}
              isFirstGroup={false}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

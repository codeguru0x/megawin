"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { calcRelativeTime, formatNumber, formatVNDCompact } from "@megawin/shared/utils";
import { CalendarClock, CheckCircle2, Clock3, ExternalLink, Play, Zap } from "lucide-react";

import type { DrawTimelineEvent, GetDashboardDrawsOutput } from "@/app/api/dashboard/draws/_lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getGameColors } from "@/lib/game-colors";
import { cn } from "@/lib/utils";

import { getGameLabel } from "../_lib/compute";

interface DrawTimelineProps {
  data: GetDashboardDrawsOutput | undefined;
  isLoading: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useRelativeTime(isoDate: string): string {
  const [label, setLabel] = useState(() => calcRelativeTime(isoDate));

  useEffect(() => {
    setLabel(calcRelativeTime(isoDate));
    const id = setInterval(() => setLabel(calcRelativeTime(isoDate)), 15_000);
    return () => clearInterval(id);
  }, [isoDate]);

  return label;
}

/** Tạo URL đến trang vận hành của game với draw được chọn sẵn. */
function opsUrl(gameProduct: string, drawId: string) {
  return `/games/${gameProduct}/operations?draw=${encodeURIComponent(drawId)}`;
}

/**
 * Format drawDate (YYYY-MM-DD) thành DD/MM ngắn gọn.
 * Nếu drawDate cùng ngày hôm nay → bỏ qua ngày, chỉ hiện #drawNo.
 */
function formatDrawLabel(drawDate: string, drawNo: number): string {
  const today = new Date().toISOString().slice(0, 10);
  const dd = drawDate.slice(8, 10);
  const mm = drawDate.slice(5, 7);
  const prefix = drawDate === today ? "" : `${dd}/${mm} `;
  return `${prefix}#${String(drawNo).padStart(3, "0")}`;
}

// ─── Draw event row — clickable link ────────────────────────────────────────

function DrawEventRow({ event }: { event: DrawTimelineEvent }) {
  const relTime = useRelativeTime(event.drawAt);
  const c = getGameColors(event.gameProduct);
  const isActive = event.status === "active";
  const href = opsUrl(event.gameProduct, event.drawId);

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2 rounded-md px-2.5 py-2 transition-colors",
        "hover:bg-muted/60 dark:hover:bg-muted/30",
        isActive && "bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-100/60 dark:hover:bg-blue-950/30",
      )}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: c.hex }} />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {getGameLabel(event.gameProduct)}
      </span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {formatDrawLabel(event.drawDate, event.drawNo)}
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        {isActive && event.pendingEntries != null && (
          <span className="text-xs tabular-nums text-blue-600 dark:text-blue-400">
            {formatNumber(event.pendingEntries)} vé
            {event.pendingStake != null && event.pendingStake > 0 && <> · {formatVNDCompact(event.pendingStake)}</>}
          </span>
        )}
        <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">{relTime}</span>
        <ExternalLink className="size-3 shrink-0 text-muted-foreground/0 transition-opacity group-hover:text-muted-foreground/60" />
      </div>
    </Link>
  );
}

// ─── Column Component ────────────────────────────────────────────────────────

interface ColumnProps {
  title: string;
  icon: React.ReactNode;
  count: number;
  accent: "blue" | "emerald" | "muted";
  children: React.ReactNode;
  emptyText?: string;
}

/**
 * 1 cột trong layout 3 cột của DrawTimeline.
 *
 * Header: icon + title + count badge.
 * Body: danh sách draw events, scrollable nếu vượt max-height.
 */
function Column({ title, icon, count, accent, children, emptyText }: ColumnProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-border/50 bg-muted/20">
      {/* Column header */}
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        {icon}
        <span
          className={cn(
            "text-xs font-semibold",
            accent === "blue" && "text-blue-700 dark:text-blue-400",
            accent === "emerald" && "text-emerald-700 dark:text-emerald-400",
            accent === "muted" && "text-muted-foreground",
          )}
        >
          {title}
        </span>
        <Badge
          variant="secondary"
          className={cn(
            "ml-auto h-4 min-w-5 justify-center px-1.5 text-[10px] font-bold",
            accent === "blue" && "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
            accent === "emerald" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
            accent === "muted" && "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </Badge>
      </div>
      {/* Column body — scrollable */}
      <div className="flex flex-col gap-0.5 overflow-y-auto p-1" style={{ maxHeight: 260 }}>
        {count > 0 ? (
          children
        ) : (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">{emptyText ?? "Không có"}</p>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function DrawTimelineSkeleton() {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, c) => (
            <div key={c} className="space-y-2 rounded-lg border border-border/50 p-3">
              <Skeleton className="h-4 w-24" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-7 rounded-md" />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── DrawTimeline — full-width, 3-column layout ─────────────────────────────

/**
 * Lịch quay số — full-width card, 3 cột song song.
 *
 * Design:
 * - Row trên (inline): High-freq games (Keno, Bingo18) → compact badges ngang
 * - 3 cột: Đang diễn ra | Vừa hoàn thành | Sắp diễn ra
 * - Mỗi row là link → /games/:game/operations?draw=:drawId
 * - Mỗi cột scrollable độc lập (maxHeight 260px)
 *
 * Terminology theo nghiệp vụ:
 * - "Đang diễn ra" = active — chưa voided/settled
 * - "Vừa hoàn thành" = settled/voided trong 48h
 * - "Sắp diễn ra" = scheduled — chưa mở bao giờ
 */
export function DrawTimeline({ data, isLoading }: DrawTimelineProps) {
  if (isLoading) return <DrawTimelineSkeleton />;
  if (!data) return null;

  const active = data.events.filter((e) => e.status === "active");
  const settled = data.events.filter((e) => e.status === "settled");
  const scheduled = data.events.filter((e) => e.status === "scheduled");
  const hasHighFreq = data.highFreqGames.length > 0;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Lịch quay số</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-4 pt-0">
        {/* ── High-freq games — compact inline ─────────────────────── */}
        {hasHighFreq && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Zap className="size-3 text-amber-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quay nhanh</span>
            </div>
            {data.highFreqGames.map((g) => {
              const c = getGameColors(g.gameProduct);
              return (
                <Link
                  key={g.gameProduct}
                  href={`/games/${g.gameProduct}/operations`}
                  className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 transition-colors hover:bg-muted/60"
                >
                  <span className="size-1.5 rounded-full" style={{ background: c.hex }} />
                  <span className="text-xs font-medium">{getGameLabel(g.gameProduct)}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  {g.activeCount > 0 && (
                    <span className="text-xs tabular-nums text-blue-600 dark:text-blue-400">
                      {g.activeCount} kỳ đang diễn ra
                    </span>
                  )}
                  {g.scheduledCount > 0 && (
                    <>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {g.scheduledCount} kỳ sắp diễn ra
                      </span>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {/* ── 3-column layout ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Column
            title="Đang diễn ra"
            icon={
              active.length > 0 ? (
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
                </span>
              ) : (
                <Play className="size-3.5 fill-blue-500 text-blue-500" />
              )
            }
            count={active.length}
            accent="blue"
            emptyText="Không có kỳ nào đang diễn ra"
          >
            {active.map((e, i) => (
              <DrawEventRow key={`act-${e.gameProduct}-${i}`} event={e} />
            ))}
          </Column>

          <Column
            title="Vừa hoàn thành"
            icon={<CheckCircle2 className="size-3.5 text-emerald-500" />}
            count={settled.length}
            accent="emerald"
            emptyText="Chưa có kỳ nào hoàn thành"
          >
            {settled.map((e, i) => (
              <DrawEventRow key={`std-${e.gameProduct}-${i}`} event={e} />
            ))}
          </Column>

          <Column
            title="Sắp diễn ra"
            icon={<Clock3 className="size-3.5 text-muted-foreground" />}
            count={scheduled.length}
            accent="muted"
            emptyText="Không có kỳ sắp tới"
          >
            {scheduled.map((e, i) => (
              <DrawEventRow key={`sch-${e.gameProduct}-${i}`} event={e} />
            ))}
          </Column>
        </div>
      </CardContent>
    </Card>
  );
}

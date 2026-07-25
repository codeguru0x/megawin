"use client";

/**
 * Bingo 18 – Draw Selector
 *
 * Bingo 18 có ~160 kỳ/ngày, 1 kỳ mỗi 6 phút → danh sách lớn.
 * Dùng Command Palette pattern (Popover + search inline):
 * - Search/filter theo giờ quay hoặc số kỳ
 * - Group: Đang diễn ra | Kỳ sắp tới | Vừa hoàn thành
 * - Scroll 300px per group
 */

import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import { DrawSelectorGroup, DrawStatus } from "@megawin/game-core/entities";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  FolderOpen,
  Search,
  TriangleAlert,
  XCircle,
  Zap,
} from "lucide-react";

import { Bingo18DrawStatusBadge } from "@/components/games/bingo18/draw-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { DrawSelectorItem } from "./use-operations";

interface DrawSelectorProps {
  draws: DrawSelectorItem[];
  selectedDrawId: string;
  onSelect: (drawId: string) => void;
  /** Kỳ cũ ngoài danh sách selector (kỳ lịch sử). */
  historicalDraw?: DrawSelectorItem;
}

// ─── Status Icons ──────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, React.ReactNode> = {
  [DrawStatus.SalesOpen]: (
    <span className="relative flex size-1.5 shrink-0">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex size-1.5 rounded-full bg-green-500" />
    </span>
  ),
  [DrawStatus.SalesClosed]: <span className="size-1.5 rounded-full bg-amber-500 shrink-0 inline-block" />,
  [DrawStatus.Published]: <span className="size-1.5 rounded-full bg-violet-500 shrink-0 inline-block" />,
  [DrawStatus.Settling]: <Clock className="size-2.5 text-orange-500 animate-spin shrink-0" />,
  [DrawStatus.Scheduled]: <span className="size-1.5 rounded-full bg-slate-400 shrink-0 inline-block" />,
  [DrawStatus.Settled]: <CheckCircle2 className="size-2.5 text-emerald-500 shrink-0" />,
  [DrawStatus.Void]: <XCircle className="size-2.5 text-red-400 shrink-0" />,
  [DrawStatus.Voiding]: <XCircle className="size-2.5 text-red-500 animate-pulse shrink-0" />,
};

// ─── Group config ──────────────────────────────────────────────────────────

const GROUP_CONFIG = {
  [DrawSelectorGroup.Active]: {
    label: "Đang diễn ra",
    color: "text-green-600 dark:text-green-400",
    badgeClass: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 border-green-200",
    icon: (
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-green-500" />
      </span>
    ),
  },
  [DrawSelectorGroup.Future]: {
    label: "Kỳ sắp tới",
    color: "text-slate-500 dark:text-slate-400",
    badgeClass: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200",
    icon: <Circle className="size-1.5 fill-slate-400 text-slate-400" />,
  },
  [DrawSelectorGroup.Recent]: {
    label: "Vừa hoàn thành",
    color: "text-emerald-600 dark:text-emerald-400",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border-emerald-200",
    icon: <CheckCircle2 className="size-2.5 text-emerald-500" />,
  },
} as const;

// ─── Single Draw Row ────────────────────────────────────────────────────────

function DrawRow({
  draw,
  isSelected,
  onSelect,
}: {
  draw: DrawSelectorItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent",
        isSelected && "bg-accent font-medium",
      )}
    >
      {STATUS_DOT[draw.status] ?? <span className="size-1.5 rounded-full bg-slate-300 shrink-0 inline-block" />}

      {/* Giờ quay — thông tin quan trọng nhất */}
      <span className="font-mono font-semibold tabular-nums text-foreground w-12 shrink-0">{draw.drawTime}</span>

      {/* Số kỳ */}
      <span className="text-muted-foreground shrink-0">#{String(draw.drawNo).padStart(3, "0")}</span>

      {/* Status badge compact */}
      <span className="ml-auto shrink-0">
        <Bingo18DrawStatusBadge status={draw.status} />
      </span>

      {draw.status === DrawStatus.Void && <TriangleAlert className="size-3 text-red-400 shrink-0" />}
    </button>
  );
}

// ─── Group Section ──────────────────────────────────────────────────────────

function GroupSection({
  group,
  draws,
  selectedDrawId,
  onSelect,
}: {
  group: keyof typeof GROUP_CONFIG;
  draws: DrawSelectorItem[];
  selectedDrawId: string;
  onSelect: (id: string) => void;
}) {
  const cfg = GROUP_CONFIG[group];
  if (draws.length === 0) return null;

  const scrollable = draws.length >= 8;

  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 pb-1">
        {cfg.icon}
        <span className={cn("text-[11px] font-semibold uppercase tracking-wider", cfg.color)}>{cfg.label}</span>
        <Badge variant="outline" className={cn("ml-auto text-[10px] px-1.5 py-0 h-4 font-mono", cfg.badgeClass)}>
          {draws.length}
        </Badge>
      </div>

      <div className={cn(scrollable && "max-h-48 overflow-y-auto pr-0.5")}>
        {draws.map((draw) => (
          <DrawRow
            key={draw.drawId}
            draw={draw}
            isSelected={draw.drawId === selectedDrawId}
            onSelect={() => onSelect(draw.drawId)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Trigger button display ─────────────────────────────────────────────────

function TriggerLabel({ draw }: { draw: DrawSelectorItem | undefined }) {
  if (!draw) return <span className="text-muted-foreground">Chọn kỳ quay</span>;

  return (
    <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
      {STATUS_DOT[draw.status]}
      <span className="font-mono text-sm font-semibold tabular-nums shrink-0">{draw.drawTime}</span>
      <span className="text-muted-foreground text-xs shrink-0">#{String(draw.drawNo).padStart(3, "0")}</span>
      <span className="text-xs text-muted-foreground truncate hidden sm:block">· {draw.drawDate}</span>
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function DrawSelector({ draws, selectedDrawId, onSelect, historicalDraw }: DrawSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = draws.find((d) => d.drawId === selectedDrawId) ?? historicalDraw;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  const allActive = useMemo(() => draws.filter((d) => d.group === DrawSelectorGroup.Active), [draws]);
  const allFuture = useMemo(() => draws.filter((d) => d.group === DrawSelectorGroup.Future), [draws]);
  const allRecent = useMemo(() => draws.filter((d) => d.group === DrawSelectorGroup.Recent), [draws]);

  const filtered = useMemo(() => {
    if (!search.trim()) return { active: allActive, future: allFuture, recent: allRecent };

    const q = search.trim().toLowerCase();
    const match = (d: DrawSelectorItem) =>
      d.drawTime.toLowerCase().includes(q) ||
      String(d.drawNo).padStart(3, "0").includes(q) ||
      d.drawId.toLowerCase().includes(q);

    return {
      active: allActive.filter(match),
      future: allFuture.filter(match),
      recent: allRecent.filter(match),
    };
  }, [search, allActive, allFuture, allRecent]);

  const totalFiltered = filtered.active.length + filtered.future.length + filtered.recent.length;

  function handleSelect(drawId: string) {
    onSelect(drawId);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 min-w-50 max-w-70 justify-between gap-2 font-normal"
          aria-expanded={open}
        >
          <TriggerLabel draw={selected} />
          <ChevronDown
            className={cn("size-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-72 p-2 shadow-lg" align="end" sideOffset={4}>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm giờ quay, số kỳ..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        {!search && allActive.length >= 5 && (
          <div className="mb-2 flex items-center gap-1.5 rounded-md bg-green-50 dark:bg-green-950/40 px-2.5 py-1.5">
            <Zap className="size-3 text-green-500 shrink-0" />
            <span className="text-[11px] text-green-700 dark:text-green-400">
              {allActive.length} kỳ đang diễn ra
              {allFuture.length > 0 && ` · ${allFuture.length} sắp tới`}
            </span>
          </div>
        )}

        <div className="max-h-105 overflow-y-auto space-y-2">
          {totalFiltered === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Không tìm thấy kỳ quay.</p>
          ) : (
            <>
              <GroupSection
                group={DrawSelectorGroup.Active}
                draws={filtered.active}
                selectedDrawId={selectedDrawId}
                onSelect={handleSelect}
              />

              {filtered.active.length > 0 && filtered.future.length > 0 && <Separator />}

              <GroupSection
                group={DrawSelectorGroup.Future}
                draws={filtered.future}
                selectedDrawId={selectedDrawId}
                onSelect={handleSelect}
              />

              {(filtered.active.length > 0 || filtered.future.length > 0) && filtered.recent.length > 0 && (
                <Separator />
              )}

              <GroupSection
                group={DrawSelectorGroup.Recent}
                draws={filtered.recent}
                selectedDrawId={selectedDrawId}
                onSelect={handleSelect}
              />
            </>
          )}
        </div>

        <Separator className="mt-2 mb-1" />
        <Link
          href="/games/bingo18/draws"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <FolderOpen className="size-3.5" />
          Xem toàn bộ lịch sử kỳ quay →
        </Link>
      </PopoverContent>
    </Popover>
  );
}

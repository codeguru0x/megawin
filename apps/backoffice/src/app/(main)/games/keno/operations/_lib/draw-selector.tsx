"use client";

/**
 * Keno – Draw Selector
 *
 * Keno có ~120 kỳ/ngày, 1 kỳ mỗi 8 phút → có thể 40-50 kỳ active cùng lúc.
 * Dùng Command Palette pattern (Popover + search inline) thay vì Select thông thường
 * để xử lý danh sách lớn:
 * - Search/filter theo giờ quay hoặc số kỳ
 * - Group: Đang diễn ra | Kỳ sắp tới | Vừa hoàn thành
 * - Hiển thị compact: badge đếm số kỳ theo group, scroll 300px per group
 * - Max-height scrollable để không tràn viewport
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

import { KenoDrawStatusBadge } from "@/components/games/keno/draw-status-badge";
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

// ─── Status Icons ─────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, React.ReactNode> = {
  [DrawStatus.SalesOpen]: (
    <span className="relative flex size-1.5 shrink-0">
      <span className="bg-profit absolute inline-flex size-full animate-ping rounded-full opacity-75" />
      <span className="bg-profit relative inline-flex size-1.5 rounded-full" />
    </span>
  ),
  [DrawStatus.SalesClosed]: <span className="bg-warning inline-block size-1.5 shrink-0 rounded-full" />,
  [DrawStatus.Published]: <span className="bg-game-max3d inline-block size-1.5 shrink-0 rounded-full" />,
  [DrawStatus.Settling]: <Clock className="text-warning size-2.5 shrink-0 animate-spin" />,
  [DrawStatus.Scheduled]: <span className="bg-muted inline-block size-1.5 shrink-0 rounded-full" />,
  [DrawStatus.Settled]: <CheckCircle2 className="text-profit size-2.5 shrink-0" />,
  [DrawStatus.Void]: <XCircle className="text-loss size-2.5 shrink-0" />,
  [DrawStatus.Voiding]: <XCircle className="text-loss size-2.5 shrink-0 animate-pulse" />,
};

// ─── Group config ─────────────────────────────────────────────────────────────

const GROUP_CONFIG = {
  [DrawSelectorGroup.Active]: {
    label: "Đang diễn ra",
    color: "text-profit",
    badgeClass: "bg-profit text-profit border-profit",
    icon: (
      <span className="relative flex size-1.5">
        <span className="bg-profit absolute inline-flex size-full animate-ping rounded-full opacity-75" />
        <span className="bg-profit relative inline-flex size-1.5 rounded-full" />
      </span>
    ),
  },
  [DrawSelectorGroup.Future]: {
    label: "Kỳ sắp tới",
    color: "text-muted-foreground",
    badgeClass: "bg-muted text-muted-foreground border-border",
    icon: <Circle className="fill-muted-foreground text-muted-foreground size-1.5" />,
  },
  [DrawSelectorGroup.Recent]: {
    label: "Vừa hoàn thành",
    color: "text-profit",
    badgeClass: "bg-profit text-profit border-profit",
    icon: <CheckCircle2 className="text-profit size-2.5" />,
  },
} as const;

// ─── Single Draw Row ──────────────────────────────────────────────────────────

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
        "hover:bg-accent flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
        isSelected && "bg-accent font-medium",
      )}
    >
      {STATUS_DOT[draw.status] ?? <span className="bg-muted inline-block size-1.5 shrink-0 rounded-full" />}

      {/* Giờ quay — thông tin quan trọng nhất cho Keno */}
      <span className="text-foreground w-12 shrink-0 font-mono font-semibold tabular-nums">{draw.drawTime}</span>

      {/* Số kỳ */}
      <span className="text-muted-foreground shrink-0">#{String(draw.drawNo).padStart(3, "0")}</span>

      {/* Status badge compact */}
      <span className="ml-auto shrink-0">
        <KenoDrawStatusBadge status={draw.status} />
      </span>

      {draw.status === DrawStatus.Void && <TriangleAlert className="text-loss size-3 shrink-0" />}
    </button>
  );
}

// ─── Group Section ────────────────────────────────────────────────────────────

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
  if (draws.length === 0) {
    return null;
  }

  // Nếu ≥ 8 kỳ thì cho scroll — tránh nhồi quá nhiều
  const scrollable = draws.length >= 8;

  return (
    <div>
      {/* Group header */}
      <div className="flex items-center gap-1.5 px-2 pb-1">
        {cfg.icon}
        <span className={cn("text-xs font-semibold tracking-wider uppercase", cfg.color)}>{cfg.label}</span>
        <Badge variant="outline" className={cn("ml-auto h-4 px-1.5 py-0 font-mono text-xs", cfg.badgeClass)}>
          {draws.length}
        </Badge>
      </div>

      {/* Items — scroll nếu nhiều */}
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

// ─── Trigger button display ───────────────────────────────────────────────────

function TriggerLabel({ draw }: { draw: DrawSelectorItem | undefined }) {
  if (!draw) {
    return <span className="text-muted-foreground">Chọn kỳ quay</span>;
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      {STATUS_DOT[draw.status]}
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{draw.drawTime}</span>
      <span className="text-muted-foreground shrink-0 text-xs">#{String(draw.drawNo).padStart(3, "0")}</span>
      <span className="text-muted-foreground hidden truncate text-xs sm:block">· {draw.drawDate}</span>
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DrawSelector({ draws, selectedDrawId, onSelect, historicalDraw }: DrawSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = draws.find((d) => d.drawId === selectedDrawId) ?? historicalDraw;

  // Focus search input khi mở
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

  // Filter bằng search — so khớp giờ quay hoặc số kỳ
  const filtered = useMemo(() => {
    if (!search.trim()) {
      return { active: allActive, future: allFuture, recent: allRecent };
    }

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
          className="h-9 max-w-70 min-w-50 justify-between gap-2 font-normal"
          aria-expanded={open}
        >
          <TriggerLabel draw={selected} />
          <ChevronDown
            className={cn("text-muted-foreground size-3.5 shrink-0 transition-transform", open && "rotate-180")}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-72 p-2 shadow-lg" align="end" sideOffset={4}>
        {/* Search bar */}
        <div className="relative mb-2">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm giờ quay, số kỳ..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Thống kê nhanh */}
        {!search && allActive.length >= 5 && (
          <div className="bg-profit mb-2 flex items-center gap-1.5 rounded-md px-2.5 py-1.5">
            <Zap className="text-profit size-3 shrink-0" />
            <span className="text-profit text-xs">
              {allActive.length} kỳ đang diễn ra
              {allFuture.length > 0 && ` · ${allFuture.length} sắp tới`}
            </span>
          </div>
        )}

        {/* Danh sách kỳ — tổng max-height để không tràn */}
        <div className="max-h-105 space-y-2 overflow-y-auto">
          {totalFiltered === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-xs">Không tìm thấy kỳ quay.</p>
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
          prefetch={false}
          href="/games/keno/draws"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
        >
          <FolderOpen className="size-3.5" />
          Xem toàn bộ lịch sử kỳ quay →
        </Link>
      </PopoverContent>
    </Popover>
  );
}

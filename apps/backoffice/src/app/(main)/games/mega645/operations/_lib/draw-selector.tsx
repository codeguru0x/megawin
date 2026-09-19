"use client";

import Link from "next/link";

import { DrawSelectorGroup, DrawStatus } from "@megawin/game-core/entities";
import { CheckCircle2, Circle, Clock, FolderOpen, TriangleAlert, XCircle } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { DrawSelectorItem } from "./use-operations";

interface DrawSelectorProps {
  draws: DrawSelectorItem[];
  selectedDrawId: string;
  onSelect: (drawId: string) => void;
  /** Thông tin kỳ cũ đang được chọn nhưng không có trong danh sách selector. */
  historicalDraw?: DrawSelectorItem;
}

// ─── Status Icons ─────────────────────────────────────────────────────────────

const STATUS_ICON: Record<string, React.ReactNode> = {
  [DrawStatus.SalesOpen]: (
    <span className="relative flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-green-500" />
    </span>
  ),
  [DrawStatus.SalesClosed]: <Circle className="size-2 fill-amber-500 text-amber-500" />,
  [DrawStatus.Published]: <Circle className="size-2 fill-violet-500 text-violet-500" />,
  [DrawStatus.Settling]: <Clock className="size-2.5 animate-spin text-orange-500" />,
  [DrawStatus.Scheduled]: <Circle className="size-2 fill-slate-400 text-slate-400" />,
  [DrawStatus.Settled]: <CheckCircle2 className="size-2.5 text-emerald-500" />,
  [DrawStatus.Void]: <XCircle className="size-2.5 text-red-400" />,
  [DrawStatus.Voiding]: <XCircle className="size-2.5 animate-pulse text-red-500" />,
};

// ─── DrawSelectorItem Row ────────────────────────────────────────────────────

function DrawRow({ draw }: { draw: DrawSelectorItem }) {
  const isFuture = draw.group === DrawSelectorGroup.Future;

  return (
    <div className="flex w-full items-center justify-between gap-3 py-0.5">
      <div className="flex min-w-0 items-center gap-2">
        {STATUS_ICON[draw.status] ?? <Circle className="size-2 fill-slate-300 text-slate-300" />}
        {/* Mega 6/45: 1 kỳ/ngày nên chỉ hiển thị ngày */}
        <span className={cn("truncate text-sm font-medium", isFuture && "text-muted-foreground")}>
          Ngày {draw.drawDate}
        </span>
        <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">{draw.drawTime}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {draw.status === DrawStatus.Void && <TriangleAlert className="size-3 text-red-400" />}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DrawSelector({ draws, selectedDrawId, onSelect, historicalDraw }: DrawSelectorProps) {
  const selected = draws.find((d) => d.drawId === selectedDrawId) ?? historicalDraw;

  const active = draws.filter((d) => d.group === DrawSelectorGroup.Active);
  const future = draws.filter((d) => d.group === DrawSelectorGroup.Future);
  const recent = draws.filter((d) => d.group === DrawSelectorGroup.Recent);

  // Khi kỳ chọn là kỳ cũ ngoài selector list → dùng value="" để không tick item nào
  const isInList = draws.some((d) => d.drawId === selectedDrawId);

  return (
    <Select value={isInList ? selectedDrawId : ""} onValueChange={onSelect}>
      <SelectTrigger className="w-60 gap-2 text-sm font-medium">
        <div className="flex min-w-0 items-center gap-2">
          {selected && STATUS_ICON[selected.status]}
          <SelectValue placeholder="Chọn kỳ quay">
            {selected ? `${selected.drawDate} · ${selected.drawTime}` : "Chọn kỳ quay"}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent className="w-75" align="end">
        {active.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-muted-foreground flex items-center gap-1.5 pb-1 text-xs tracking-wider uppercase">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-green-500" />
              </span>
              Đang diễn ra
            </SelectLabel>
            {active.map((draw) => (
              <SelectItem key={draw.drawId} value={draw.drawId} className="py-2">
                <DrawRow draw={draw} />
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {active.length > 0 && future.length > 0 && <SelectSeparator />}

        {future.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-muted-foreground pb-1 text-xs tracking-wider uppercase">
              Kỳ sắp tới
            </SelectLabel>
            {future.map((draw) => (
              <SelectItem key={draw.drawId} value={draw.drawId} className="py-2">
                <DrawRow draw={draw} />
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {(active.length > 0 || future.length > 0) && recent.length > 0 && <SelectSeparator />}

        {recent.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-muted-foreground pb-1 text-xs tracking-wider uppercase">
              Vừa hoàn thành
            </SelectLabel>
            {recent.map((draw) => (
              <SelectItem key={draw.drawId} value={draw.drawId} className="py-2">
                <DrawRow draw={draw} />
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        <SelectSeparator />
        <div className="px-2 py-1.5">
          <Link
            prefetch={false}
            href="/games/mega645/draws"
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors"
          >
            <FolderOpen className="size-4" />
            Xem toàn bộ lịch sử kỳ quay →
          </Link>
        </div>
      </SelectContent>
    </Select>
  );
}

"use client";

import Link from "next/link";

import { DrawSelectorGroup, DrawStatus } from "@megawin/game-core/entities";
import { CheckCircle2, Circle, Clock, FolderOpen, TriangleAlert, XCircle } from "lucide-react";

import { Power655DrawStatusBadge as DrawStatusBadge } from "@/components/games/power655/draw-status-badge";
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
  historicalDraw?: DrawSelectorItem;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  [DrawStatus.SalesOpen]: (
    <span className="relative flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-green-500" />
    </span>
  ),
  [DrawStatus.SalesClosed]: <Circle className="size-2 fill-amber-500 text-amber-500" />,
  [DrawStatus.Published]: <Circle className="size-2 fill-violet-500 text-violet-500" />,
  [DrawStatus.Settling]: <Clock className="size-2.5 text-orange-500 animate-spin" />,
  [DrawStatus.Scheduled]: <Circle className="size-2 fill-slate-400 text-slate-400" />,
  [DrawStatus.Settled]: <CheckCircle2 className="size-2.5 text-emerald-500" />,
  [DrawStatus.Void]: <XCircle className="size-2.5 text-red-400" />,
  [DrawStatus.Voiding]: <XCircle className="size-2.5 text-red-500 animate-pulse" />,
};

function DrawRow({ draw }: { draw: DrawSelectorItem }) {
  const isFuture = draw.group === DrawSelectorGroup.Future;

  return (
    <div className="flex items-center justify-between w-full gap-3 py-0.5">
      <div className="flex items-center gap-2 min-w-0">
        {STATUS_ICON[draw.status] ?? <Circle className="size-2 fill-slate-300 text-slate-300" />}
        {/* Power 6/55: 1 kỳ/ngày nên chỉ hiển thị ngày */}
        <span className={cn("text-sm font-medium truncate", isFuture && "text-muted-foreground")}>
          Ngày {draw.drawDate}
        </span>
        <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">{draw.drawTime}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {draw.status === DrawStatus.Void && <TriangleAlert className="size-3 text-red-400" />}
      </div>
    </div>
  );
}

export function DrawSelector({ draws, selectedDrawId, onSelect, historicalDraw }: DrawSelectorProps) {
  const selected = draws.find((d) => d.drawId === selectedDrawId) ?? historicalDraw;

  const active = draws.filter((d) => d.group === DrawSelectorGroup.Active);
  const future = draws.filter((d) => d.group === DrawSelectorGroup.Future);
  const recent = draws.filter((d) => d.group === DrawSelectorGroup.Recent);

  const isInList = draws.some((d) => d.drawId === selectedDrawId);

  return (
    <Select value={isInList ? selectedDrawId : ""} onValueChange={onSelect}>
      <SelectTrigger className="h-9 w-60 gap-2 text-sm font-medium">
        <div className="flex items-center gap-2 min-w-0">
          {selected && STATUS_ICON[selected.status]}
          <SelectValue placeholder="Chọn kỳ quay">
            {selected ? `${selected.drawDate} · ${selected.drawTime}` : "Chọn kỳ quay"}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent className="w-75" align="end">
        {active.length > 0 && (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider pb-1">
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
            <SelectLabel className="text-xs text-muted-foreground uppercase tracking-wider pb-1">
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
            <SelectLabel className="text-xs text-muted-foreground uppercase tracking-wider pb-1">
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
            href="/games/power655/draws"
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <FolderOpen className="size-4" />
            Xem toàn bộ lịch sử kỳ quay →
          </Link>
        </div>
      </SelectContent>
    </Select>
  );
}

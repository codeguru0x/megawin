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
  historicalDraw?: DrawSelectorItem;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  [DrawStatus.SalesOpen]: (
    <span className="relative flex size-2">
      <span className="bg-profit absolute inline-flex size-full animate-ping rounded-full opacity-75" />
      <span className="bg-profit relative inline-flex size-2 rounded-full" />
    </span>
  ),
  [DrawStatus.SalesClosed]: <Circle className="fill-warning text-warning size-2" />,
  [DrawStatus.Published]: <Circle className="fill-game-max3d text-game-max3d size-2" />,
  [DrawStatus.Settling]: <Clock className="text-warning size-2.5 animate-spin" />,
  [DrawStatus.Scheduled]: <Circle className="fill-muted-foreground text-muted-foreground size-2" />,
  [DrawStatus.Settled]: <CheckCircle2 className="text-profit size-2.5" />,
  [DrawStatus.Void]: <XCircle className="text-loss size-2.5" />,
  [DrawStatus.Voiding]: <XCircle className="text-loss size-2.5 animate-pulse" />,
};

function DrawRow({ draw }: { draw: DrawSelectorItem }) {
  const isFuture = draw.group === DrawSelectorGroup.Future;

  return (
    <div className="flex w-full items-center justify-between gap-3 py-0.5">
      <div className="flex min-w-0 items-center gap-2">
        {STATUS_ICON[draw.status] ?? <Circle className="fill-muted-foreground text-muted-foreground size-2" />}
        {/* Power 6/55: 1 kỳ/ngày nên chỉ hiển thị ngày */}
        <span className={cn("truncate text-sm font-medium", isFuture && "text-muted-foreground")}>
          Ngày {draw.drawDate}
        </span>
        <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">{draw.drawTime}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {draw.status === DrawStatus.Void && <TriangleAlert className="text-loss size-3" />}
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
                <span className="bg-profit absolute inline-flex size-full animate-ping rounded-full opacity-75" />
                <span className="bg-profit relative inline-flex size-1.5 rounded-full" />
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
            href="/games/power655/draws"
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

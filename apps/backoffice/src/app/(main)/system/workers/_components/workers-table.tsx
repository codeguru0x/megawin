"use client";

import { useEffect, useState } from "react";

import { calcRelativeTime } from "@megawin/shared/utils";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import { STALLED_ALERT_THRESHOLD } from "@megawin/worker-core/use-cases/health";
import {
  WORKER_RUN_STATE_LABELS,
  WORKER_RUN_STATE_VARIANT,
} from "@megawin/worker-core/shared/labels";
import type { WorkerHealthRow } from "@megawin/worker-core/use-cases/admin/types";
import { WorkerRunState } from "@megawin/worker-core/use-cases/admin/types";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface WorkersTableProps {
  rows: WorkerHealthRow[];
  isLoading: boolean;
  isFetching: boolean;
  /** `true` khi mutation toggle đang chạy — disable mọi Switch cùng lúc. */
  isToggling: boolean;
  onRequestToggle: (row: WorkerHealthRow) => void;
  onOpenStalledItems: (row: WorkerHealthRow) => void;
}

/** Cập nhật label thời gian tương đối mỗi 15s — theo tiền lệ `draw-timeline.tsx`. */
function useRelativeTime(isoDate: string | null): string {
  const [label, setLabel] = useState(() => (isoDate ? calcRelativeTime(isoDate) : "—"));

  useEffect(() => {
    if (!isoDate) {
      setLabel("—");
      return;
    }
    setLabel(calcRelativeTime(isoDate));
    const id = setInterval(() => setLabel(calcRelativeTime(isoDate)), 15_000);
    return () => clearInterval(id);
  }, [isoDate]);

  return label;
}

function WorkerLastSuccessCell({ lastSuccessAt }: { lastSuccessAt: string | null }) {
  const label = useRelativeTime(lastSuccessAt);

  if (!lastSuccessAt) {
    return <span className="text-sm text-muted-foreground">Chưa từng</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-sm tabular-nums">{label}</span>
      </TooltipTrigger>
      <TooltipContent className="font-mono tabular-nums">
        {displayVNDateTime(lastSuccessAt)}
      </TooltipContent>
    </Tooltip>
  );
}

/** Sort ưu tiên dòng có vấn đề lên đầu — tính trong render, không state/effect (§2.5k). */
function sortRows(rows: WorkerHealthRow[]): WorkerHealthRow[] {
  return rows.toSorted((a, b) => {
    const aBad = a.state === WorkerRunState.Crashed || a.stalledItems.length > 0;
    const bBad = b.state === WorkerRunState.Crashed || b.stalledItems.length > 0;
    if (aBad !== bBad) return aBad ? -1 : 1;
    return a.lockKey.localeCompare(b.lockKey);
  });
}

export function WorkersTable({
  rows,
  isLoading,
  isFetching,
  isToggling,
  onRequestToggle,
  onOpenStalledItems,
}: WorkersTableProps) {
  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Đang tải trạng thái worker…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-60 flex-col items-center justify-center gap-1 text-center">
        <Inbox className="size-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">Chưa có worker nào ghi nhận</p>
        <p className="text-xs text-muted-foreground">Worker tạo bản ghi ở lần chạy đầu tiên.</p>
      </div>
    );
  }

  const sorted = sortRows(rows);

  return (
    <div className={cn("overflow-x-auto transition-opacity", isFetching && "opacity-60")}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Worker</TableHead>
            <TableHead className="w-28">Trạng thái</TableHead>
            <TableHead className="w-40">Thành công gần nhất</TableHead>
            <TableHead className="w-24 text-right">Item kẹt</TableHead>
            <TableHead className="max-w-xs">Lỗi gần nhất</TableHead>
            <TableHead className="w-24 pr-5 text-center">Bật/tắt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => {
            const hasStalled = row.stalledItems.length > 0;
            const maxFailCount = hasStalled
              ? Math.max(...row.stalledItems.map((i) => i.failCount))
              : 0;
            const stalledVariant =
              maxFailCount >= STALLED_ALERT_THRESHOLD ? "destructive" : "secondary";

            return (
              <TableRow key={row.lockKey}>
                <TableCell className="pl-5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{row.description}</span>
                    {row.description !== row.lockKey && (
                      <span className="font-mono text-xs text-muted-foreground">{row.lockKey}</span>
                    )}
                  </div>
                </TableCell>

                <TableCell>
                  <Badge variant={WORKER_RUN_STATE_VARIANT[row.state] ?? "outline"}>
                    {WORKER_RUN_STATE_LABELS[row.state] ?? row.state}
                  </Badge>
                </TableCell>

                <TableCell>
                  <WorkerLastSuccessCell lastSuccessAt={row.lastSuccessAt} />
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {hasStalled ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => onOpenStalledItems(row)}
                    >
                      <Badge variant={stalledVariant} className="gap-1">
                        <AlertTriangle className="size-3" />
                        {row.stalledItems.length}
                      </Badge>
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                <TableCell className="max-w-xs">
                  {row.lastError ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="block truncate text-sm text-destructive"
                          title={row.lastError}
                        >
                          {row.lastError}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm break-words">
                        {row.lastError}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>

                <TableCell className="pr-5 text-center">
                  <Switch
                    checked={row.isEnabled}
                    disabled={isToggling}
                    onCheckedChange={() => onRequestToggle(row)}
                    aria-label={`Bật/tắt ${row.lockKey}`}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

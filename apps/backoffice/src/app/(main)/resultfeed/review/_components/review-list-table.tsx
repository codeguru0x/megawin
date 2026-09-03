"use client";

import type { ConsensusEntity } from "@megawin/resultfeed/entities";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { RESULTFEED_GAME_LABELS } from "../../_lib/labels";

export interface ReviewListTableProps {
  rows: ConsensusEntity[];
  isLoading: boolean;
  isFetching: boolean;
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpenDetail: (row: ConsensusEntity) => void;
}

/** Bảng liệt kê kỳ đang `Conflict` (hoặc filter khác nếu mở rộng sau) — click để xem chi tiết. */
export function ReviewListTable({
  rows,
  isLoading,
  isFetching,
  page,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onOpenDetail,
}: ReviewListTableProps) {
  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Đang tải hàng đợi…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-60 flex-col items-center justify-center gap-1 text-center">
        <Inbox className="size-8 text-muted-foreground/40" />
        <p className="font-medium text-muted-foreground text-sm">Không có kỳ nào đang chờ duyệt</p>
        <p className="text-muted-foreground text-xs">Mọi kỳ lệch nguồn sẽ hiện ở đây.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className={cn("overflow-x-auto transition-opacity", isFetching && "opacity-60")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Game</TableHead>
              <TableHead>Kỳ</TableHead>
              <TableHead>Ngày quay</TableHead>
              <TableHead className="text-right">Đồng ý</TableHead>
              <TableHead className="text-right">Lệch</TableHead>
              <TableHead>Cập nhật</TableHead>
              <TableHead className="w-24 pr-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="cursor-pointer" onClick={() => onOpenDetail(row)}>
                <TableCell className="pl-5 font-medium">{RESULTFEED_GAME_LABELS[row.gameKey]}</TableCell>
                <TableCell className="font-mono text-sm">{row.drawPeriod}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{row.drawDateSource}</TableCell>
                <TableCell className="text-right tabular-nums">{row.agreeing.length}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.conflicting.length > 0 ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="size-3" />
                      {row.conflicting.length}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{displayVNDateTime(row.updatedAt)}</TableCell>
                <TableCell className="pr-5 text-right">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    Xem
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between border-t px-5 py-3">
          <span className="text-muted-foreground text-xs tabular-nums">Trang {page}</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={!hasPrev || isFetching}
              onClick={onPrev}
            >
              <ChevronLeft className="size-3.5" />
              Trước
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={!hasNext || isFetching}
              onClick={onNext}
            >
              Sau
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

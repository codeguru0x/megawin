"use client";

import { Ticket, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import type { OutstandingEntryRow } from "./types";

export interface OutstandingEntryListProps {
  drawId: string;
  tenantId: string;
  /** Display name (đã qua toTenantUsername) — hiển thị trong card title. */
  displayName: string;
  rows: OutstandingEntryRow[];
  isLoading: boolean;
  error: unknown;
  onRefetch: () => void;
  /** Gọi khi click vào 1 entry — mở dialog chi tiết. */
  onRowClick: (row: OutstandingEntryRow) => void;
  /**
   * Game có cột lines không (lotto535, mega645, power655, max3d, max3dpro).
   * - `false` (Keno, Bingo18): header = "Boards", cell = `boardCount`.
   * - `true`: header = "Boards / {lineCountLabel}", cell = "{boardCount} / {lineCount}".
   */
  showLineCount?: boolean;
  /** Label phần lines khi `showLineCount=true`. VD: "Bộ số" (Lotto535), "Dòng cược" (Power655). */
  lineCountLabel?: string;
}

/**
 * Level 4 — danh sách entries outstanding của 1 player.
 *
 * Nhận data + callbacks từ ngoài — không tự fetch.
 * Click row → gọi `onRowClick` để mở dialog chi tiết.
 */
export function OutstandingEntryList({
  drawId,
  tenantId,
  displayName,
  rows,
  isLoading,
  error,
  onRefetch,
  onRowClick,
  showLineCount = false,
  lineCountLabel,
}: OutstandingEntryListProps) {
  // Header cột boards/lines — tùy game
  const boardsLineColLabel = showLineCount
    ? `${REPORT_COLUMN_LABELS.board} / ${lineCountLabel ?? REPORT_COLUMN_LABELS.lineCount}`
    : REPORT_COLUMN_LABELS.board;

  if (isLoading) {
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-1 h-3 w-72" />
        </CardHeader>
        <CardContent className="space-y-2 px-5 pb-4 pt-0">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">Lỗi tải dữ liệu. Vui lòng thử lại.</p>
          <Button variant="outline" size="sm" onClick={onRefetch}>
            <RefreshCw className="mr-2 size-4" />
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Ticket className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Phiếu cược — {displayName}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {rows.length} phiếu · Kỳ {drawId} · {tenantId} · Click để xem chi tiết
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-4 pt-0">
        {rows.length === 0 ? (
          <div className="flex h-30 items-center justify-center">
            <p className="text-sm text-muted-foreground">Không có entries outstanding.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-50 pl-5">Mã vé</TableHead>
                  <TableHead className="w-30 text-right">{boardsLineColLabel}</TableHead>
                  <TableHead className="w-[110px] text-right">
                    {REPORT_COLUMN_LABELS.betUnitCount}
                  </TableHead>
                  <TableHead className="w-[150px] text-right">
                    {REPORT_COLUMN_LABELS.estimatedCommission}
                  </TableHead>
                  <TableHead className="w-[150px] pr-5 text-right">
                    {REPORT_COLUMN_LABELS.totalStake}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onRowClick(entry)}
                  >
                    <TableCell className="pl-5 font-mono text-sm">
                      {entry.ticketNo ?? entry.id}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {showLineCount ? (
                        <>
                          {entry.boardCount != null ? formatNumber(entry.boardCount) : "—"}
                          {" / "}
                          {entry.lineCount != null ? formatNumber(entry.lineCount) : "—"}
                        </>
                      ) : entry.boardCount != null ? (
                        formatNumber(entry.boardCount)
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {entry.betUnitCount != null ? formatNumber(entry.betUnitCount) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(entry.commissionAmount)}
                    </TableCell>
                    <TableCell className="pr-5 text-right text-sm tabular-nums font-medium">
                      {formatNumber(entry.totalStake)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

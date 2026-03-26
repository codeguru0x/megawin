"use client";

import { useState } from "react";
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
import { formatNumber, displayVNDateTime } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import type { TicketEntryEntity } from "@megawin/game-max3d/entities";
import { Max3dEntryDetailDialog } from "../../financial-reports/_lib/sections/entry-list";
import { useMax3DOutstandingPlayerEntries } from "../../financial-reports/_lib/use-report-queries";

interface OutstandingEntryListProps {
  drawId: string;
  tenantId: string;
  accountId: string;
  /** Username hiển thị trong card title thay accountId. */
  playerName?: string | null;
}

/**
 * Level 4 — danh sách entries outstanding của 1 player.
 *
 * Click row → mở Max3dEntryDetailDialog ở outstanding mode
 * (status = "scheduled" → dialog ẩn result/payout, hiển thị "Đang chờ quay số").
 * Max 3D: cột "Cặp số" thay "Dòng cược".
 */
export function OutstandingEntryList({
  drawId,
  tenantId,
  accountId,
  playerName,
}: OutstandingEntryListProps) {
  const [selectedEntry, setSelectedEntry] = useState<TicketEntryEntity | null>(null);
  const { data, isLoading, error, refetch } = useMax3DOutstandingPlayerEntries(
    drawId,
    tenantId,
    accountId,
  );

  const displayName = playerName || accountId;

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
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 size-4" />
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  const rows = data ?? [];
  const totalLines = rows.reduce((s, r) => s + (r.lineCount ?? 0), 0);
  const totalStake = rows.reduce((s, r) => s + r.amount, 0);
  const totalCommission = rows.reduce((s, r) => s + (r.tenant?.commissionAmount ?? 0), 0);

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Entries — {displayName}</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {rows.length} entries · Kỳ {drawId} · {tenantId} · Click để xem chi tiết
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-4 pt-0">
          {rows.length === 0 ? (
            <div className="flex h-[120px] items-center justify-center">
              <p className="text-sm text-muted-foreground">Không có entries outstanding.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px] pl-5">Mã vé</TableHead>
                    <TableHead className="w-[180px]">Thời gian đặt</TableHead>
                    {/* Max 3D: "Cặp số" thay "Dòng cược" */}
                    <TableHead className="w-[100px] text-right">Cặp số</TableHead>
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
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <TableCell className="pl-5 font-mono text-sm">
                        {entry.entrySummary?.ticketNo ?? entry.id}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {displayVNDateTime(entry.createdAt)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatNumber(entry.lineCount ?? 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatNumber(entry.tenant?.commissionAmount ?? 0)}
                      </TableCell>
                      <TableCell className="pr-5 text-right tabular-nums text-sm font-medium">
                        {formatNumber(entry.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>

                {rows.length > 1 && (
                  <tfoot>
                    <TableRow className="border-t bg-muted/50">
                      <TableCell className="pl-5 text-sm font-semibold">
                        {REPORT_COLUMN_LABELS.summary}
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums text-sm font-semibold">
                        {formatNumber(totalLines)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold">
                        {formatNumber(totalCommission)}
                      </TableCell>
                      <TableCell className="pr-5 text-right tabular-nums text-sm font-semibold">
                        {formatNumber(totalStake)}
                      </TableCell>
                    </TableRow>
                  </tfoot>
                )}
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog reuse từ financial-reports — outstanding mode khi status = "scheduled" */}
      <Max3dEntryDetailDialog
        entry={selectedEntry}
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </>
  );
}

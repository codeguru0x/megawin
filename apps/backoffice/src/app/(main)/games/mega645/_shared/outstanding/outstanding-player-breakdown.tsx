"use client";

import { Users, RefreshCw } from "lucide-react";
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
import { useMega645OutstandingFilters } from "./use-outstanding-filters";
import { useMega645OutstandingTenantPlayers } from "../../financial-reports/_lib/use-report-queries";

interface OutstandingPlayerBreakdownProps {
  drawId: string;
  tenantId: string;
}

/**
 * Level 3 — player breakdown cho 1 draw × 1 tenant outstanding.
 *
 * Tự gọi useMega645OutstandingFilters() để lấy navigateToPlayer — cùng pattern với financial reports.
 * Click bất kỳ cell nào trong row → drill vào Entry List (Level 4).
 * Không có cột Payout/Lãi lỗ vì outstanding = chưa settle.
 */
export function OutstandingPlayerBreakdown({ drawId, tenantId }: OutstandingPlayerBreakdownProps) {
  const { navigateToPlayer } = useMega645OutstandingFilters();
  const { data, isLoading, error, refetch } = useMega645OutstandingTenantPlayers(drawId, tenantId);

  if (isLoading) {
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-1 h-3 w-72" />
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-0 space-y-2">
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

  const totalEntries = rows.reduce((s, r) => s + r.entryCount, 0);
  const totalLines = rows.reduce((s, r) => s + r.lineCount, 0);
  const totalStake = rows.reduce((s, r) => s + r.totalStake, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commissionAmount, 0);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">
            Players — Kỳ {drawId} / {tenantId}
          </CardTitle>
        </div>
        <CardDescription className="text-xs">
          {rows.length} người chơi · Click để xem entries
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-4 pt-0">
        {rows.length === 0 ? (
          <div className="flex h-[120px] items-center justify-center">
            <p className="text-sm text-muted-foreground">Không có dữ liệu.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Người chơi</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                  <TableHead className="text-right">
                    {REPORT_COLUMN_LABELS.estimatedCommission}
                  </TableHead>
                  <TableHead className="pr-5 text-right">
                    {REPORT_COLUMN_LABELS.totalStake}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.accountId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToPlayer(row.accountId, row.username || row.accountId)}
                  >
                    <TableCell className="pl-5 font-medium">
                      {row.username || row.accountId}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.lineCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.commissionAmount)}
                    </TableCell>
                    <TableCell className="pr-5 text-right tabular-nums font-medium">
                      {formatNumber(row.totalStake)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>

              {rows.length > 1 && (
                <tfoot>
                  <TableRow className="border-t bg-muted/50">
                    <TableCell className="pl-5 font-semibold">
                      {REPORT_COLUMN_LABELS.summary}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatNumber(totalEntries)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatNumber(totalLines)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatNumber(totalCommission)}
                    </TableCell>
                    <TableCell className="pr-5 text-right tabular-nums font-semibold">
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
  );
}

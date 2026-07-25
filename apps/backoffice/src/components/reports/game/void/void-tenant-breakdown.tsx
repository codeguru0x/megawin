"use client";

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber } from "@megawin/shared/utils";
import { Building2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { VoidTenantRow } from "./types";

export interface VoidTenantBreakdownProps {
  drawId: string;
  rows: VoidTenantRow[];
  isLoading: boolean;
  error: unknown;
  onRefetch: () => void;
  onRowClick: (tenantId: string) => void;
}

/**
 * Level 2 — tenant breakdown cho 1 draw void.
 *
 * Click row → drill vào Player Breakdown (Level 3).
 */
export function VoidTenantBreakdown({
  drawId,
  rows,
  isLoading,
  error,
  onRefetch,
  onRowClick,
}: VoidTenantBreakdownProps) {
  if (isLoading) {
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-1 h-3 w-72" />
        </CardHeader>
        <CardContent className="space-y-2 px-5 pb-4 pt-0">
          {[...Array(4)].map((_, i) => (
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

  const totalEntries = rows.reduce((s, r) => s + r.entryCount, 0);
  const totalPlayers = rows.reduce((s, r) => s + r.playerCount, 0);
  const totalOriginal = rows.reduce((s, r) => s + r.totalOriginalStake, 0);
  const totalRefund = rows.reduce((s, r) => s + r.totalRefundAmount, 0);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Đại lý — Kỳ {drawId}</CardTitle>
        </div>
        <CardDescription className="text-xs">{rows.length} đại lý · Click để xem tài khoản</CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-4 pt-0">
        {rows.length === 0 ? (
          <div className="flex h-30 items-center justify-center">
            <p className="text-sm text-muted-foreground">Không có dữ liệu.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">{REPORT_COLUMN_LABELS.tenantId}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalOriginalStake}</TableHead>
                  <TableHead className="pr-5 text-right">{REPORT_COLUMN_LABELS.totalRefundAmount}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.tenantId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onRowClick(row.tenantId)}
                  >
                    <TableCell className="pl-5 text-sm font-medium">{row.tenantId}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.entryCount)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.playerCount)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalOriginalStake)}
                    </TableCell>
                    <TableCell className="pr-5 text-right text-sm tabular-nums font-medium text-amber-600 dark:text-amber-400">
                      {formatNumber(row.totalRefundAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>

              {rows.length > 1 && (
                <tfoot>
                  <TableRow className="border-t bg-muted/50">
                    <TableCell className="pl-5 text-sm font-semibold">{REPORT_COLUMN_LABELS.summary}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-semibold">
                      {formatNumber(totalEntries)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-semibold">
                      {formatNumber(totalPlayers)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-semibold">
                      {formatNumber(totalOriginal)}
                    </TableCell>
                    <TableCell className="pr-5 text-right text-sm tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                      {formatNumber(totalRefund)}
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

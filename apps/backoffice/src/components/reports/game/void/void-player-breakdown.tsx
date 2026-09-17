"use client";

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber } from "@megawin/shared/utils";
import { RefreshCw, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { VoidPlayerRow } from "./types";

export interface VoidPlayerBreakdownProps {
  drawId: string;
  tenantId: string;
  rows: VoidPlayerRow[];
  isLoading: boolean;
  error: unknown;
  onRefetch: () => void;
  onRowClick: (accountId: string, displayName: string) => void;
}

/**
 * Level 3 — player breakdown cho 1 draw × 1 tenant void.
 *
 * Click row → drill vào Entry List (Level 4).
 */
export function VoidPlayerBreakdown({
  drawId,
  tenantId,
  rows,
  isLoading,
  error,
  onRefetch,
  onRowClick,
}: VoidPlayerBreakdownProps) {
  if (isLoading) {
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pt-4 pb-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-1 h-3 w-72" />
        </CardHeader>
        <CardContent className="space-y-2 px-5 pt-0 pb-4">
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
          <p className="text-muted-foreground text-sm">Lỗi tải dữ liệu. Vui lòng thử lại.</p>
          <Button variant="outline" size="sm" onClick={onRefetch}>
            <RefreshCw className="mr-2 size-4" />
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  const totalEntries = rows.reduce((s, r) => s + r.entryCount, 0);
  const totalOriginal = rows.reduce((s, r) => s + r.totalOriginalStake, 0);
  const totalRefund = rows.reduce((s, r) => s + r.totalRefundAmount, 0);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Users className="text-muted-foreground size-4" />
          <CardTitle className="text-sm font-semibold">
            Tài khoản — Kỳ {drawId} / {tenantId}
          </CardTitle>
        </div>
        <CardDescription className="text-xs">{rows.length} tài khoản · Click để xem phiếu cược</CardDescription>
      </CardHeader>
      <CardContent className="px-0 pt-0 pb-4">
        {rows.length === 0 ? (
          <div className="flex h-30 items-center justify-center">
            <p className="text-muted-foreground text-sm">Không có dữ liệu.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">{REPORT_COLUMN_LABELS.accountName}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalOriginalStake}</TableHead>
                  <TableHead className="pr-5 text-right">{REPORT_COLUMN_LABELS.totalRefundAmount}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.accountId}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => onRowClick(row.accountId, row.displayName)}
                  >
                    <TableCell className="pl-5 text-sm font-medium">{row.displayName}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.entryCount)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalOriginalStake)}
                    </TableCell>
                    <TableCell className="text-warning pr-5 text-right text-sm font-medium tabular-nums">
                      {formatNumber(row.totalRefundAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>

              {rows.length > 1 && (
                <tfoot>
                  <TableRow className="bg-muted/50 border-t">
                    <TableCell className="pl-5 text-sm font-semibold">TỔNG CỘNG</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {formatNumber(totalEntries)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {formatNumber(totalOriginal)}
                    </TableCell>
                    <TableCell className="text-warning pr-5 text-right text-sm font-semibold tabular-nums">
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

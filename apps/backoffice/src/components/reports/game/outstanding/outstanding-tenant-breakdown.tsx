"use client";

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber } from "@megawin/shared/utils";
import { Building2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { OutstandingTenantRow } from "./types";

export interface OutstandingTenantBreakdownProps {
  drawId: string;
  rows: OutstandingTenantRow[];
  isLoading: boolean;
  error: unknown;
  onRefetch: () => void;
  onRowClick: (tenantId: string) => void;
  showLineCount?: boolean;
  lineCountLabel?: string;
}

/**
 * Level 2 — tenant breakdown cho 1 draw outstanding.
 *
 * Nhận data + callbacks từ ngoài — không tự fetch.
 * Click row → drill vào Player Breakdown (Level 3).
 */
export function OutstandingTenantBreakdown({
  drawId,
  rows,
  isLoading,
  error,
  onRefetch,
  onRowClick,
  showLineCount = false,
  lineCountLabel,
}: OutstandingTenantBreakdownProps) {
  const lineLabel = lineCountLabel ?? REPORT_COLUMN_LABELS.lineCount;

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
  const totalLines = rows.reduce((s, r) => s + (r.lineCount ?? 0), 0);
  const totalStake = rows.reduce((s, r) => s + r.totalStake, 0);
  const totalCommission = rows.reduce((s, r) => s + r.estimatedCommission, 0);

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
                  <TableHead className="pl-5">Đại lý</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                  {showLineCount && <TableHead className="text-right">{lineLabel}</TableHead>}
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.estimatedCommission}</TableHead>
                  <TableHead className="pr-5 text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
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
                    {showLineCount && (
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.lineCount ?? 0)}
                      </TableCell>
                    )}
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.estimatedCommission)}
                    </TableCell>
                    <TableCell className="pr-5 text-right text-sm tabular-nums font-medium">
                      {formatNumber(row.totalStake)}
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
                    {showLineCount && (
                      <TableCell className="text-right text-sm tabular-nums font-semibold">
                        {formatNumber(totalLines)}
                      </TableCell>
                    )}
                    <TableCell className="text-right text-sm tabular-nums font-semibold">
                      {formatNumber(totalCommission)}
                    </TableCell>
                    <TableCell className="pr-5 text-right text-sm tabular-nums font-semibold">
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

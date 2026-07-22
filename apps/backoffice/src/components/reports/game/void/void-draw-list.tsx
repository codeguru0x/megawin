"use client";

import { Ban } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@megawin/shared/utils";
import type { VoidDrawRow } from "./types";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";

export interface VoidDrawListProps {
  data: VoidDrawRow[];
  /** Gọi khi click row → drill vào tenant breakdown. */
  onRowClick: (drawId: string) => void;
}

/**
 * Level 1 — bảng danh sách kỳ quay đã void dùng chung cho mọi game.
 *
 * Click row → drill vào Tenant Breakdown (Level 2).
 */
export function VoidDrawList({ data, onRowClick }: VoidDrawListProps) {
  const totalEntries = data.reduce((s, r) => s + r.entryCount, 0);
  const totalPlayers = data.reduce((s, r) => s + r.playerCount, 0);
  const totalTenants = data.reduce((s, r) => s + r.tenantCount, 0);
  const totalOriginal = data.reduce((s, r) => s + r.totalOriginalStake, 0);
  const totalRefund = data.reduce((s, r) => s + r.totalRefundAmount, 0);

  if (data.length === 0) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex h-50 flex-col items-center justify-center text-center">
          <p className="text-sm text-muted-foreground">
            Không có kỳ quay void nào trong khoảng thời gian đã chọn.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Ban className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">
            Danh sách kỳ quay đã huỷ · Click để xem theo đại lý
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-4 pt-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">{REPORT_COLUMN_LABELS.drawId}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.tenantCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">
                  {REPORT_COLUMN_LABELS.totalOriginalStake}
                </TableHead>
                <TableHead className="pr-5 text-right">
                  {REPORT_COLUMN_LABELS.totalRefundAmount}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow
                  key={row.drawId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onRowClick(row.drawId)}
                >
                  <TableCell className="pl-5 text-sm">{row.drawId}</TableCell>

                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(row.playerCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(row.tenantCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(row.entryCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(row.totalOriginalStake)}
                  </TableCell>
                  <TableCell className="pr-5 text-right text-sm tabular-nums font-medium text-amber-600 dark:text-amber-400">
                    {formatNumber(row.totalRefundAmount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>

            {data.length > 1 && (
              <tfoot>
                <TableRow className="border-t bg-muted/50">
                  <TableCell className="pl-5 text-sm font-semibold">
                    {REPORT_COLUMN_LABELS.summary}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold"></TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold"></TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totalTenants)}
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
      </CardContent>
    </Card>
  );
}

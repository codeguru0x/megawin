"use client";

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber } from "@megawin/shared/utils";
import { Clock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { OutstandingDrawRow } from "./types";

export interface OutstandingDrawListProps {
  /** Danh sách draws outstanding. */
  data: OutstandingDrawRow[];
  /** Gọi khi click row → drill vào tenant breakdown. */
  onRowClick: (drawId: string) => void;
  /**
   * Hiện cột "Bộ số / Dòng cược" không.
   * Lotto535, Mega645, Power655, Max3D, Max3DPro = true.
   * Keno, Bingo18 = false.
   */
  showLineCount?: boolean;
  /** Label cho cột dòng cược. Default: `REPORT_COLUMN_LABELS.lineCount`. */
  lineCountLabel?: string;
}

/**
 * Level 1 — bảng danh sách kỳ quay outstanding dùng chung cho mọi game.
 *
 * Click row → drill vào Tenant Breakdown (Level 2).
 */
export function OutstandingDrawList({
  data,
  onRowClick,
  showLineCount = false,
  lineCountLabel,
}: OutstandingDrawListProps) {
  const lineLabel = lineCountLabel ?? REPORT_COLUMN_LABELS.lineCount;

  const totalEntries = data.reduce((s, r) => s + r.entryCount, 0);
  const totalLines = data.reduce((s, r) => s + (r.lineCount ?? 0), 0);
  const totalStake = data.reduce((s, r) => s + r.totalStake, 0);
  const totalCommission = data.reduce((s, r) => s + r.estimatedCommission, 0);

  if (data.length === 0) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex h-50 flex-col items-center justify-center text-center">
          <p className="text-muted-foreground text-sm">Không có kỳ quay outstanding hiện tại.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Clock className="text-muted-foreground size-4" />
          <CardTitle className="text-sm font-semibold">Kỳ quay đang hoạt động · Click để xem theo đại lý</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-0 pt-0 pb-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">{REPORT_COLUMN_LABELS.financialDate}</TableHead>
                <TableHead>{REPORT_COLUMN_LABELS.drawId}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.tenantCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                {showLineCount && <TableHead className="text-right">{lineLabel}</TableHead>}
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.estimatedCommission}</TableHead>
                <TableHead className="pr-5 text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow
                  key={row.drawId}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => onRowClick(row.drawId)}
                >
                  <TableCell className="pl-5 text-sm tabular-nums">{row.financialDate}</TableCell>
                  <TableCell className="font-mono text-sm tabular-nums">{row.drawId}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.playerCount)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.tenantCount)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.entryCount)}</TableCell>
                  {showLineCount && (
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.lineCount ?? 0)}
                    </TableCell>
                  )}
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(row.estimatedCommission)}
                  </TableCell>
                  <TableCell className="pr-5 text-right text-sm font-medium tabular-nums">
                    {formatNumber(row.totalStake)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>

            {data.length > 1 && (
              <tfoot>
                <TableRow className="bg-muted/50 border-t">
                  <TableCell className="pl-5 text-sm font-semibold" colSpan={showLineCount ? 4 : 4}>
                    {REPORT_COLUMN_LABELS.summary}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">
                    {formatNumber(totalEntries)}
                  </TableCell>
                  {showLineCount && (
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {formatNumber(totalLines)}
                    </TableCell>
                  )}
                  <TableCell className="text-right text-sm font-semibold tabular-nums">
                    {formatNumber(totalCommission)}
                  </TableCell>
                  <TableCell className="pr-5 text-right text-sm font-semibold tabular-nums">
                    {formatNumber(totalStake)}
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

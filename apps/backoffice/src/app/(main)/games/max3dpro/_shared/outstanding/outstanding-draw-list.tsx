"use client";

import { Clock } from "lucide-react";
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
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import type { OutstandingDrawReport } from "@megawin/game-max3dpro/entities";
import { useMax3DProOutstandingFilters } from "./use-outstanding-filters";

// Nhãn riêng cho Max 3D Pro: lineCount = số cặp (TripletPair)
const LABEL_PAIRS = "Cặp số";

interface OutstandingDrawListProps {
  /** Danh sách draws outstanding (từ useMax3DProOutstanding). */
  data: OutstandingDrawReport[];
}

/**
 * Level 1 — bảng danh sách kỳ quay outstanding Max 3D Pro.
 *
 * Tự gọi useMax3DProOutstandingFilters() để lấy navigateToDraw.
 * Click bất kỳ cell nào trong row → drill vào Tenant Breakdown.
 * Icon ExternalLink hover-only trên cột drawId → link sang Operations page.
 */
export function OutstandingDrawList({ data }: OutstandingDrawListProps) {
  const { navigateToDraw } = useMax3DProOutstandingFilters();

  const totalEntries = data.reduce((s, r) => s + r.entryCount, 0);
  const totalPairs = data.reduce((s, r) => s + r.lineCount, 0);
  const totalStake = data.reduce((s, r) => s + r.totalStake, 0);
  const totalCommission = data.reduce((s, r) => s + r.estimatedCommission, 0);

  if (data.length === 0) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex h-[200px] flex-col items-center justify-center text-center">
          <p className="text-sm text-muted-foreground">Không có kỳ quay outstanding hiện tại.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">
            Kỳ quay đang hoạt động · Click để xem theo đại lý
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-4 pt-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">{REPORT_COLUMN_LABELS.financialDate}</TableHead>
                <TableHead>{REPORT_COLUMN_LABELS.drawId}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.tenantCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">{LABEL_PAIRS}</TableHead>
                <TableHead className="text-right">
                  {REPORT_COLUMN_LABELS.estimatedCommission}
                </TableHead>
                <TableHead className="pr-5 text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow
                  key={row.drawId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigateToDraw(row.drawId)}
                >
                  <TableCell className="pl-5 tabular-nums">{row.financialDate}</TableCell>
                  <TableCell className="font-mono tabular-nums">{row.drawId}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.playerCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.tenantCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.entryCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.lineCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.estimatedCommission)}
                  </TableCell>
                  <TableCell className="pr-5 text-right tabular-nums font-medium">
                    {formatNumber(row.totalStake)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>

            {data.length > 1 && (
              <tfoot>
                <TableRow className="border-t bg-muted/50">
                  <TableCell className="pl-5 font-semibold" colSpan={4}>
                    {REPORT_COLUMN_LABELS.summary}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatNumber(totalEntries)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatNumber(totalPairs)}
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
      </CardContent>
    </Card>
  );
}

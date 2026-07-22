"use client";

import { Layers } from "lucide-react";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber } from "@megawin/shared/utils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PayoutRatioCell, getNetProfitColor } from "@/components/reports/payout-ratio";

import { usePlayerDrawBreakdown } from "../../_shared/queries";

interface DrawBreakdownViewProps {
  accountId: string;
  financialDate: string;
  game: string;
  onRowClick: (drawId: string) => void;
}

/**
 * View 3 — Kỳ quay trong ngày.
 *
 * Cột: Kỳ quay (drawId), Phiếu cược, Tiền cược, Trả thưởng, Tỷ lệ TT,
 *       Doanh thu thuần, Hoa hồng ĐL, Lợi nhuận ròng.
 * Click row → drill vào View 4 (entry list).
 */
export function DrawBreakdownView({
  accountId,
  financialDate,
  game,
  onRowClick,
}: DrawBreakdownViewProps) {
  const { data: rows, isLoading, isError } = usePlayerDrawBreakdown(accountId, financialDate, game);

  if (isLoading) {
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b px-4 py-3">
              {Array.from({ length: 8 }).map((_, j) => (
                <Skeleton key={j} className="h-3 flex-1" />
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex h-40 items-center justify-center">
          <p className="text-sm text-destructive">Không thể tải dữ liệu.</p>
        </CardContent>
      </Card>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex h-40 flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium text-muted-foreground">Không có kỳ quay nào</p>
          <p className="text-xs text-muted-foreground">
            Player không tham gia kỳ quay nào trong ngày này.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totals = rows.reduce(
    (acc, r) => ({
      entryCount: acc.entryCount + r.entryCount,
      totalStake: acc.totalStake + r.totalStake,
      totalPayout: acc.totalPayout + r.totalPayout,
      ggr: acc.ggr + r.ggr,
      totalCommission: acc.totalCommission + r.totalCommission,
      netProfit: acc.netProfit + r.netProfit,
    }),
    { entryCount: 0, totalStake: 0, totalPayout: 0, ggr: 0, totalCommission: 0, netProfit: 0 },
  );
  const totalPayoutRatio = totals.totalStake > 0 ? totals.totalPayout / totals.totalStake : 0;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">
            Kỳ quay trong ngày — {rows.length} kỳ
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">{REPORT_COLUMN_LABELS.drawId}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.payoutPercent}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalCommission}</TableHead>
                <TableHead className="pr-5 text-right">{REPORT_COLUMN_LABELS.netProfit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const payoutRatio = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                return (
                  <TableRow
                    key={row.drawId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onRowClick(row.drawId)}
                  >
                    <TableCell className="pl-5 font-mono text-sm font-medium">
                      {row.drawId}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium">
                      {formatNumber(row.totalStake)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalPayout)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <PayoutRatioCell ratio={payoutRatio} />
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium">
                      {formatNumber(row.ggr)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalCommission)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "pr-5 text-right text-sm tabular-nums font-medium",
                        getNetProfitColor(row.netProfit),
                      )}
                    >
                      {formatNumber(row.netProfit)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="pl-5 text-sm font-semibold">
                  {REPORT_COLUMN_LABELS.summary}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.entryCount)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.totalStake)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.totalPayout)}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold">
                  <PayoutRatioCell ratio={totalPayoutRatio} className="font-semibold" />
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.ggr)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.totalCommission)}
                </TableCell>
                <TableCell
                  className={cn(
                    "pr-5 text-right text-sm tabular-nums font-semibold",
                    getNetProfitColor(totals.netProfit),
                  )}
                >
                  {formatNumber(totals.netProfit)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

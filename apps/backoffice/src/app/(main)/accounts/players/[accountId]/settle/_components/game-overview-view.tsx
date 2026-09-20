"use client";

import type { PlayerOverviewResult } from "@megawin/game-core-application/repos";
import type { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { GAME_LABELS, REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber } from "@megawin/shared/utils";
import { Layers } from "lucide-react";

import { PayoutRatioCell } from "@/components/reports/payout-ratio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getGameColors } from "@/lib/game-colors";
import { cn } from "@/lib/utils";

interface GameOverviewViewProps {
  data: PlayerOverviewResult | undefined;
  isLoading: boolean;
  onRowClick: (gameProduct: string) => void;
}

/**
 * View 1 — Thống kê theo game.
 *
 * Cột: Game, Kỳ quay, Phiếu cược, Tiền cược, Trả thưởng, Tỷ lệ TT, Doanh thu thuần, Hoa hồng ĐL, Lợi nhuận ròng.
 * Click row → drill vào View 2 (daily by game).
 */
export function GameOverviewView({ data, isLoading, onRowClick }: GameOverviewViewProps) {
  if (isLoading) {
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pt-4 pb-2">
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          {["r0", "r1", "r2", "r3", "r4"].map((id) => (
            <div key={id} className="flex gap-4 border-b px-4 py-3">
              {["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map((id) => (
                <Skeleton key={id} className="h-3 flex-1" />
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.games.length === 0) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex h-40 flex-col items-center justify-center gap-1 text-center">
          <p className="text-muted-foreground text-sm font-medium">Chưa có dữ liệu</p>
          <p className="text-muted-foreground text-xs">Player chưa tham gia game nào trong khoảng thời gian này.</p>
        </CardContent>
      </Card>
    );
  }

  const totals = {
    drawCount: data.totalDrawCount,
    entryCount: data.totalEntryCount,
    totalStake: data.totalStake,
    totalPayout: data.totalPayout,
    ggr: data.ggr,
    totalCommission: data.totalCommission,
    netProfit: data.netProfit,
  };
  const totalPayoutRatio = totals.totalStake > 0 ? totals.totalPayout / totals.totalStake : 0;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Layers className="text-muted-foreground size-4" />
          <CardTitle className="text-sm font-semibold">Thống kê theo game</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">{REPORT_COLUMN_LABELS.game}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.drawCount}</TableHead>
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
              {data.games.map((row) => {
                const c = getGameColors(row.gameProduct);
                const gameLabel = GAME_LABELS[row.gameProduct as GameProduct];
                const payoutRatio = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                return (
                  <TableRow
                    key={row.gameProduct}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => onRowClick(row.gameProduct)}
                  >
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("inline-block size-2 rounded-full", c.twBg)} />
                        <span className="font-medium">{gameLabel}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.drawCount)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.entryCount)}</TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {formatNumber(row.totalStake)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.totalPayout)}</TableCell>
                    <TableCell className="text-right text-sm">
                      <PayoutRatioCell ratio={payoutRatio} />
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {formatNumber(row.ggr)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalCommission)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "pr-5 text-right text-sm font-medium tabular-nums",
                        row.netProfit < 0 && "text-loss",
                        row.netProfit > 0 && "text-profit",
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
                <TableCell className="pl-5 text-sm font-semibold">{REPORT_COLUMN_LABELS.summary}</TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">
                  {formatNumber(totals.drawCount)}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">
                  {formatNumber(totals.entryCount)}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">
                  {formatNumber(totals.totalStake)}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">
                  {formatNumber(totals.totalPayout)}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold">
                  <PayoutRatioCell ratio={totalPayoutRatio} className="font-semibold" />
                </TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">
                  {formatNumber(totals.ggr)}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">
                  {formatNumber(totals.totalCommission)}
                </TableCell>
                <TableCell
                  className={cn(
                    "pr-5 text-right text-sm font-semibold tabular-nums",
                    totals.netProfit < 0 && "text-loss",
                    totals.netProfit > 0 && "text-profit",
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

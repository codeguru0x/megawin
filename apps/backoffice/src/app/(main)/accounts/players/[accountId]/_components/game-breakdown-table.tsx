"use client";

import { Layers } from "lucide-react";
import { GAME_LABELS } from "@megawin/game-core/labels";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
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
import { getGameColors } from "@/lib/game-colors";
import { cn } from "@/lib/utils";

import type { PlayerOverviewResult } from "@megawin/game-core-application/repos";

interface GameBreakdownTableProps {
  data: PlayerOverviewResult | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Bảng breakdown theo từng game của player trong date range.
 *
 * Số trong bảng: formatNumber — hiển thị chính xác, không đơn vị (theo quy định).
 * Cột số: text-right tabular-nums.
 * Số âm (GGR, netProfit): text-destructive.
 * Footer row: TỔNG CỘNG.
 */
export function GameBreakdownTable({ data, isLoading, isError }: GameBreakdownTableProps) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Thống kê theo game</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        <div className="overflow-hidden rounded-md border">
          {isLoading ? (
            <div className="space-y-0">
              {/* Header skeleton */}
              <div className="flex gap-4 border-b px-4 py-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 flex-1" />
                ))}
              </div>
              {/* Row skeletons */}
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-4 border-b px-4 py-3">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <Skeleton key={j} className="h-3 flex-1" />
                  ))}
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex h-[160px] items-center justify-center">
              <p className="text-sm text-destructive">Không thể tải dữ liệu.</p>
            </div>
          ) : !data || data.games.length === 0 ? (
            <div className="flex h-[160px] flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm font-medium text-muted-foreground">Chưa có dữ liệu</p>
              <p className="text-xs text-muted-foreground">
                Player chưa tham gia game nào trong khoảng thời gian này.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-28">Game</TableHead>
                  <TableHead className="text-right">Kỳ quay</TableHead>
                  <TableHead className="text-right">Đơn cược</TableHead>
                  <TableHead className="text-right">Settled</TableHead>
                  <TableHead className="text-right">Thắng</TableHead>
                  <TableHead className="text-right">Tiền cược</TableHead>
                  <TableHead className="text-right">Trả thưởng</TableHead>
                  <TableHead className="text-right">GGR</TableHead>
                  <TableHead className="text-right">Hoa hồng</TableHead>
                  <TableHead className="text-right">Lợi nhuận</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.games.map((row) => {
                  const c = getGameColors(row.gameProduct);
                  const gameLabel = GAME_LABELS[row.gameProduct as GameProduct] ?? row.gameProduct;
                  return (
                    <TableRow key={row.gameProduct} className="h-10 text-sm">
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className={cn("inline-block size-2 rounded-full", c.twBg)} />
                          <span className="font-medium">{gameLabel}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.drawCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.entryCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.settledCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.winCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.totalStake)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.totalPayout)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums font-medium",
                          row.ggr < 0 ? "text-destructive" : "",
                        )}
                      >
                        {formatNumber(row.ggr)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(row.totalCommission)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums font-medium",
                          row.netProfit < 0 ? "text-destructive" : "",
                        )}
                      >
                        {formatNumber(row.netProfit)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="h-10 text-sm font-semibold">
                  <TableCell>TỔNG CỘNG</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(data.totalDrawCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(data.totalEntryCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(data.totalSettledCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(data.totalWinCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(data.totalStake)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(data.totalPayout)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      data.ggr < 0 ? "text-destructive" : "",
                    )}
                  >
                    {formatNumber(data.ggr)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatNumber(data.totalCommission)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      data.netProfit < 0 ? "text-destructive" : "",
                    )}
                  >
                    {formatNumber(data.netProfit)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

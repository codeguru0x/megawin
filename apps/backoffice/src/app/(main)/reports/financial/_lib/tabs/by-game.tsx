"use client";

import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "lucide-react";
import {
  formatVND,
  formatVNDCompact,
  formatPercent,
  formatNumber,
} from "@megawin/shared/utils/number";
import type { GameSummaryRow } from "@megawin/game-core-application/repos";
import { GAME_LABELS } from "@megawin/game-core/labels";
import { useSystemReportFilters } from "../use-report-filters";
import { useSystemByGame } from "../use-report-queries";

/** Tab "Theo game" — aggregate by gameProduct. */
export function ByGameTab() {
  const { from, to } = useSystemReportFilters();
  const router = useRouter();

  const { data, isLoading, error } = useSystemByGame(from, to);

  if (isLoading) return <ByGameSkeleton />;
  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Lỗi tải dữ liệu. Vui lòng thử lại.
        </CardContent>
      </Card>
    );
  }
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Không có dữ liệu trong khoảng thời gian đã chọn.
        </CardContent>
      </Card>
    );
  }

  // Summary
  const totalStake = data.reduce((s, r) => s + r.totalStake, 0);
  const totalPayout = data.reduce((s, r) => s + r.totalPayout, 0);
  const totalGgr = data.reduce((s, r) => s + r.ggr, 0);
  const totalCommission = data.reduce((s, r) => s + r.totalCommission, 0);
  const totalNetProfit = data.reduce((s, r) => s + r.netProfit, 0);
  const totalDraws = data.reduce((s, r) => s + r.drawCount, 0);
  const totalEntries = data.reduce((s, r) => s + r.entryCount, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">So sánh theo game</CardTitle>
        <CardDescription className="text-xs">
          Click vào game để xem báo cáo chi tiết
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Game</TableHead>
                <TableHead className="text-right">Kỳ quay</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead className="text-right">Tenants</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">Trả thưởng</TableHead>
                <TableHead className="text-right">GGR</TableHead>
                <TableHead className="text-right">Hoa hồng</TableHead>
                <TableHead className="text-right">Lợi nhuận</TableHead>
                <TableHead className="text-right">Payout %</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const payoutPct = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                const margin = row.totalStake > 0 ? row.ggr / row.totalStake : 0;
                const slug = row.gameProduct;
                return (
                  <TableRow
                    key={row.gameProduct}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      router.push(`/games/${slug}/financial-reports?from=${from}&to=${to}`)
                    }
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {GAME_LABELS[row.gameProduct as keyof typeof GAME_LABELS] ??
                            row.gameProduct}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">{row.gameProduct}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.drawCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.playerCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.tenantCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatVND(row.totalStake)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${payoutPct > 0.95 ? "text-danger" : payoutPct > 0.8 ? "text-warning" : ""}`}
                    >
                      {formatVND(row.totalPayout)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatVND(row.ggr)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatVND(row.totalCommission)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${row.netProfit >= 0 ? "text-success" : "text-danger"}`}
                    >
                      {formatVND(row.netProfit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge
                        variant={
                          payoutPct > 0.95
                            ? "destructive"
                            : payoutPct > 0.8
                              ? "outline"
                              : "secondary"
                        }
                      >
                        {formatPercent(payoutPct)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(margin)}
                    </TableCell>
                    <TableCell>
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Summary Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-sm font-medium">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">TỔNG CỘNG</span>
            <Badge variant="secondary">{data.length} game</Badge>
            <Badge variant="secondary">{formatNumber(totalDraws)} kỳ</Badge>
            <Badge variant="secondary">{formatNumber(totalEntries)} entries</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4 tabular-nums text-xs">
            <span>
              DT: <strong title={formatVND(totalStake)}>{formatVNDCompact(totalStake)}</strong>
            </span>
            <span>
              PO: <strong title={formatVND(totalPayout)}>{formatVNDCompact(totalPayout)}</strong>
            </span>
            <span>
              GGR: <strong title={formatVND(totalGgr)}>{formatVNDCompact(totalGgr)}</strong>
            </span>
            <span>
              HH:{" "}
              <strong title={formatVND(totalCommission)}>
                {formatVNDCompact(totalCommission)}
              </strong>
            </span>
            <span className={totalNetProfit >= 0 ? "text-success" : "text-danger"}>
              LN:{" "}
              <strong title={formatVND(totalNetProfit)}>{formatVNDCompact(totalNetProfit)}</strong>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ByGameSkeleton() {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="space-y-2">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

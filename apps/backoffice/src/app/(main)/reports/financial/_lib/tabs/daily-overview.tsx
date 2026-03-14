"use client";

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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import {
  formatVND,
  formatVNDCompact,
  formatPercent,
  formatNumber,
} from "@megawin/shared/utils/number";
import type { DailyOverviewRow } from "@megawin/game-core-application/repos";
import type { SystemSettleGameDaily } from "@megawin/game-core/entities";
import { useSystemReportFilters } from "../use-report-filters";
import { useSystemDailyOverview, useSystemDayBreakdown } from "../use-report-queries";

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiStrip({ rows }: { rows: DailyOverviewRow[] }) {
  const totalStake = rows.reduce((s, r) => s + r.totalStake, 0);
  const totalPayout = rows.reduce((s, r) => s + r.totalPayout, 0);
  const ggr = rows.reduce((s, r) => s + r.ggr, 0);
  const netProfit = rows.reduce((s, r) => s + r.netProfit, 0);
  const payoutPct = totalStake > 0 ? totalPayout / totalStake : 0;
  const margin = totalStake > 0 ? ggr / totalStake : 0;
  const netMargin = totalStake > 0 ? netProfit / totalStake : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="Doanh thu"
        value={formatVNDCompact(totalStake)}
        full={formatVND(totalStake)}
        sub={`${formatNumber(rows.reduce((s, r) => s + r.drawCount, 0))} kỳ quay`}
      />
      <KpiCard
        title="Trả thưởng"
        value={formatVNDCompact(totalPayout)}
        full={formatVND(totalPayout)}
        sub={`Payout: ${formatPercent(payoutPct)}`}
        danger={payoutPct > 0.95}
        warn={payoutPct > 0.8}
      />
      <KpiCard
        title="GGR"
        value={formatVNDCompact(ggr)}
        full={formatVND(ggr)}
        sub={`Margin: ${formatPercent(margin)}`}
        positive={ggr > 0}
        negative={ggr < 0}
      />
      <KpiCard
        title="Lợi nhuận ròng"
        value={formatVNDCompact(netProfit)}
        full={formatVND(netProfit)}
        sub={`Net margin: ${formatPercent(netMargin)}`}
        positive={netProfit > 0}
        negative={netProfit < 0}
      />
    </div>
  );
}

function KpiCard({
  title,
  value,
  full,
  sub,
  positive,
  negative,
  danger,
  warn,
}: {
  title: string;
  value: string;
  full: string;
  sub: string;
  positive?: boolean;
  negative?: boolean;
  danger?: boolean;
  warn?: boolean;
}) {
  const valueClass = positive
    ? "text-success"
    : negative
      ? "text-danger"
      : danger
        ? "text-danger"
        : warn
          ? "text-warning"
          : undefined;

  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <p
          className={`mt-1 truncate text-xl font-bold tabular-nums ${valueClass ?? ""}`}
          title={full}
        >
          {value}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

// ─── Inline Expand Row ────────────────────────────────────────────────────────

function DayBreakdownRow({ date }: { date: string }) {
  const { data, isLoading } = useSystemDayBreakdown(date);

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={10} className="py-2 pl-10">
          <Skeleton className="h-4 w-48" />
        </TableCell>
      </TableRow>
    );
  }

  if (!data || data.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={10} className="py-3 pl-10 text-sm text-muted-foreground">
          Không có dữ liệu game trong ngày này.
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {data.map((game) => (
        <TableRow key={game.gameProduct} className="bg-muted/30">
          <TableCell className="pl-10 text-xs text-muted-foreground" colSpan={2}>
            <span className="font-mono font-medium uppercase">{game.gameProduct}</span>
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs">
            {formatNumber(game.drawCount)}
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs">
            {formatNumber(game.entryCount)}
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs">
            {formatNumber(game.playerCount)}
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs">
            {formatVND(game.totalStake)}
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs text-danger">
            {formatVND(game.totalPayout)}
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs">{formatVND(game.ggr)}</TableCell>
          <TableCell className="text-right tabular-nums text-xs">
            {formatVND(game.totalCommission)}
          </TableCell>
          <TableCell
            className={`text-right tabular-nums text-xs font-medium ${game.netProfit >= 0 ? "text-success" : "text-danger"}`}
          >
            {formatVND(game.netProfit)}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/** Tab "Tổng quan ngày" — aggregate by financialDate. */
export function DailyOverviewTab() {
  const { from, to, expandedDate, setExpandedDate } = useSystemReportFilters();

  const { data, isLoading, error } = useSystemDailyOverview(from, to);

  if (isLoading) return <DailyOverviewSkeleton />;
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

  // Tính summary footer
  const totalStake = data.reduce((s, r) => s + r.totalStake, 0);
  const totalPayout = data.reduce((s, r) => s + r.totalPayout, 0);
  const totalGgr = data.reduce((s, r) => s + r.ggr, 0);
  const totalCommission = data.reduce((s, r) => s + r.totalCommission, 0);
  const totalNetProfit = data.reduce((s, r) => s + r.netProfit, 0);
  const totalDraws = data.reduce((s, r) => s + r.drawCount, 0);
  const totalEntries = data.reduce((s, r) => s + r.entryCount, 0);
  const totalPlayers = data.reduce((s, r) => s + r.playerCount, 0);

  return (
    <div className="space-y-4">
      <KpiStrip rows={data} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tổng quan ngày</CardTitle>
          <CardDescription className="text-xs">
            Click vào ngày để xem chi tiết từng game
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Ngày TC</TableHead>
                  <TableHead className="text-right">Kỳ quay</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Players</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Trả thưởng</TableHead>
                  <TableHead className="text-right">GGR</TableHead>
                  <TableHead className="text-right">Hoa hồng</TableHead>
                  <TableHead className="text-right">Lợi nhuận</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => {
                  const isExpanded = expandedDate === row.financialDate;
                  const payoutPct = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                  return (
                    <>
                      <TableRow
                        key={row.financialDate}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => void setExpandedDate(isExpanded ? null : row.financialDate)}
                      >
                        <TableCell className="w-8 text-center">
                          {isExpanded ? (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono font-medium">{row.financialDate}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.drawCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.entryCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.playerCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatVND(row.totalStake)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span
                            className={
                              payoutPct > 0.95
                                ? "text-danger"
                                : payoutPct > 0.8
                                  ? "text-warning"
                                  : ""
                            }
                          >
                            {formatVND(row.totalPayout)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatVND(row.ggr)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatVND(row.totalCommission)}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-medium ${row.netProfit >= 0 ? "text-success" : "text-danger"}`}
                        >
                          <span className="flex items-center justify-end gap-1">
                            {row.netProfit >= 0 ? (
                              <TrendingUp className="size-3.5" />
                            ) : (
                              <TrendingDown className="size-3.5" />
                            )}
                            {formatVND(row.netProfit)}
                          </span>
                        </TableCell>
                      </TableRow>
                      {isExpanded && <DayBreakdownRow date={row.financialDate} />}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Summary Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-sm font-medium">
            <div className="flex items-center gap-4 tabular-nums">
              <span className="text-muted-foreground">TỔNG CỘNG</span>
              <Badge variant="secondary">{formatNumber(totalDraws)} kỳ</Badge>
              <Badge variant="secondary">{formatNumber(totalEntries)} entries</Badge>
              <Badge variant="secondary">{formatNumber(totalPlayers)} players</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-4 tabular-nums text-xs">
              <span>
                DT: <strong title={formatVND(totalStake)}>{formatVNDCompact(totalStake)}</strong>
              </span>
              <span className={payoutColorClass(totalStake, totalPayout)}>
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
                <strong title={formatVND(totalNetProfit)}>
                  {formatVNDCompact(totalNetProfit)}
                </strong>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function payoutColorClass(stake: number, payout: number): string {
  if (stake === 0) return "";
  const pct = payout / stake;
  if (pct > 0.95) return "text-danger";
  if (pct > 0.8) return "text-warning";
  return "";
}

function DailyOverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-6 w-32" />
              <Skeleton className="mt-1 h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {[...Array(7)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Để dùng Button mà không có lỗi unused
void Button;

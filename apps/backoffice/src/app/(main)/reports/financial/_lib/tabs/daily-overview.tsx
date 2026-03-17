"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  CalendarRange,
  ChevronRight,
  DollarSign,
  Gamepad2,
  Percent,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatVND,
  formatVNDCompact,
  formatPercent,
  formatNumber,
} from "@megawin/shared/utils/number";
import { GAME_LABELS, REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { useSystemReportFilters } from "../use-report-filters";
import { useSystemDailyOverview, useSystemDayBreakdown } from "../use-report-queries";
import type { DailyOverviewRow } from "@megawin/game-core-application/repos";
import { TableSkeleton, ErrorCard, EmptyCard } from "../sections/shared-states";

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiStrip({ rows }: { rows: DailyOverviewRow[] }) {
  const totalStake = rows.reduce((s, r) => s + r.totalStake, 0);
  const totalPayout = rows.reduce((s, r) => s + r.totalPayout, 0);
  const ggr = rows.reduce((s, r) => s + r.ggr, 0);
  const netProfit = rows.reduce((s, r) => s + r.netProfit, 0);
  const totalCommission = rows.reduce((s, r) => s + r.totalCommission, 0);
  const drawCount = rows.reduce((s, r) => s + r.drawCount, 0);
  const entryCount = rows.reduce((s, r) => s + r.entryCount, 0);
  const playerCount = rows.reduce((s, r) => s + r.playerCount, 0);
  const payoutPct = totalStake > 0 ? totalPayout / totalStake : 0;

  const cards = [
    {
      icon: CalendarRange,
      iconBg: "bg-indigo-100 dark:bg-indigo-900/50",
      iconColor: "text-indigo-600 dark:text-indigo-400",
      label: "Tổng kỳ quay",
      value: formatNumber(drawCount),
      sub: `${formatNumber(entryCount)} lượt cược · ${formatNumber(rows.length)} ngày`,
    },
    {
      icon: Users,
      iconBg: "bg-sky-100 dark:bg-sky-900/50",
      iconColor: "text-sky-600 dark:text-sky-400",
      label: REPORT_COLUMN_LABELS.playerCount,
      value: formatNumber(playerCount),
      sub: "Người chơi duy nhất",
    },
    {
      icon: DollarSign,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      label: "Doanh thu",
      value: formatVNDCompact(totalStake),
      sub: formatVND(totalStake),
    },
    {
      icon: TrendingUp,
      iconBg:
        netProfit < 0 ? "bg-red-100 dark:bg-red-900/50" : "bg-violet-100 dark:bg-violet-900/50",
      iconColor:
        netProfit < 0 ? "text-red-600 dark:text-red-400" : "text-violet-600 dark:text-violet-400",
      label: REPORT_COLUMN_LABELS.netProfit,
      value: formatVNDCompact(netProfit),
      sub: `GGR: ${formatVNDCompact(ggr)} · HH: ${formatVNDCompact(totalCommission)}`,
      valueClass: netProfit < 0 ? "text-loss" : netProfit > 0 ? "text-profit" : "",
    },
    {
      icon: Percent,
      iconBg:
        payoutPct > 0.95 ? "bg-red-100 dark:bg-red-900/50" : "bg-amber-100 dark:bg-amber-900/50",
      iconColor:
        payoutPct > 0.95 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
      label: REPORT_COLUMN_LABELS.payoutPercent,
      value: formatPercent(payoutPct),
      sub: `Doanh thu: ${formatVNDCompact(totalStake)}`,
      valueClass: payoutPct > 0.95 ? "text-loss" : payoutPct > 0.8 ? "text-warning" : "",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <div
            className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", c.iconBg)}
          >
            <c.icon className={cn("size-5", c.iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">{c.label}</p>
            <p className={cn("text-lg font-bold tabular-nums text-foreground", c.valueClass ?? "")}>
              {c.value}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{c.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Daily List View ──────────────────────────────────────────────────────────

function DailyListView() {
  const { from, to, navigateToDate } = useSystemReportFilters();
  const { data, isLoading, error } = useSystemDailyOverview(from, to);

  if (isLoading)
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-xl border bg-muted" />
          ))}
        </div>
        <TableSkeleton />
      </div>
    );
  if (error) return <ErrorCard />;
  if (!data || data.length === 0)
    return (
      <EmptyCard
        icon="calendar"
        message="Không có dữ liệu"
        description="Không tìm thấy dữ liệu trong khoảng thời gian đã chọn."
      />
    );

  const totals = {
    drawCount: data.reduce((s, r) => s + r.drawCount, 0),
    entryCount: data.reduce((s, r) => s + r.entryCount, 0),
    playerCount: data.reduce((s, r) => s + r.playerCount, 0),
    totalStake: data.reduce((s, r) => s + r.totalStake, 0),
    totalPayout: data.reduce((s, r) => s + r.totalPayout, 0),
    ggr: data.reduce((s, r) => s + r.ggr, 0),
    totalCommission: data.reduce((s, r) => s + r.totalCommission, 0),
    netProfit: data.reduce((s, r) => s + r.netProfit, 0),
  };

  return (
    <div className="space-y-4">
      <KpiStrip rows={data} />
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Tổng quan theo ngày</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {data.length} ngày · Click vào ngày để xem chi tiết từng game
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{REPORT_COLUMN_LABELS.financialDate}</TableHead>
                  <TableHead className="text-right">Kỳ quay</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                  <TableHead className="text-right">
                    {REPORT_COLUMN_LABELS.totalCommission}
                  </TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.netProfit}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow
                    key={row.financialDate}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToDate(row.financialDate)}
                  >
                    <TableCell className="font-mono text-sm font-medium">
                      {row.financialDate}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.drawCount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.playerCount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium">
                      {formatNumber(row.totalStake)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalPayout)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.ggr)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalCommission)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm tabular-nums font-medium ${row.netProfit < 0 ? "text-loss" : ""}`}
                    >
                      {formatNumber(row.netProfit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="text-xs font-semibold">
                    {REPORT_COLUMN_LABELS.summary}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.drawCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.entryCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.playerCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.totalStake)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.totalPayout)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.ggr)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.totalCommission)}
                  </TableCell>
                  <TableCell
                    className={`text-right text-sm tabular-nums font-semibold ${totals.netProfit < 0 ? "text-loss" : ""}`}
                  >
                    {formatNumber(totals.netProfit)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Day Detail View ──────────────────────────────────────────────────────────

function DayDetailView({ date }: { date: string }) {
  const { data, isLoading, error } = useSystemDayBreakdown(date);

  if (isLoading) return <TableSkeleton rows={8} />;
  if (error) return <ErrorCard />;
  if (!data || data.length === 0)
    return (
      <EmptyCard
        icon="calendar"
        message="Không có dữ liệu"
        description="Không có dữ liệu game trong ngày này."
      />
    );

  const totals = {
    drawCount: data.reduce((s, r) => s + r.drawCount, 0),
    entryCount: data.reduce((s, r) => s + r.entryCount, 0),
    playerCount: data.reduce((s, r) => s + r.playerCount, 0),
    totalStake: data.reduce((s, r) => s + r.totalStake, 0),
    totalPayout: data.reduce((s, r) => s + r.totalPayout, 0),
    ggr: data.reduce((s, r) => s + r.ggr, 0),
    totalCommission: data.reduce((s, r) => s + r.totalCommission, 0),
    netProfit: data.reduce((s, r) => s + r.netProfit, 0),
  };

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Gamepad2 className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Chi tiết theo game — {date}</CardTitle>
        </div>
        <CardDescription className="text-xs">{data.length} game có dữ liệu</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Game</TableHead>
                <TableHead className="text-right">Kỳ quay</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalCommission}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.netProfit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((game) => (
                <TableRow key={game.gameProduct}>
                  <TableCell>
                    <p className="text-sm font-medium">
                      {GAME_LABELS[game.gameProduct as keyof typeof GAME_LABELS] ??
                        game.gameProduct}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">{game.gameProduct}</p>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(game.drawCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(game.entryCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(game.playerCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-medium">
                    {formatNumber(game.totalStake)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(game.totalPayout)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(game.ggr)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(game.totalCommission)}
                  </TableCell>
                  <TableCell
                    className={`text-right text-sm tabular-nums font-medium ${game.netProfit < 0 ? "text-loss" : ""}`}
                  >
                    {formatNumber(game.netProfit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="text-xs font-semibold">
                  {REPORT_COLUMN_LABELS.summary}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.drawCount)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.entryCount)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.playerCount)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.totalStake)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.totalPayout)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.ggr)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.totalCommission)}
                </TableCell>
                <TableCell
                  className={`text-right text-sm tabular-nums font-semibold ${totals.netProfit < 0 ? "text-loss" : ""}`}
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

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ date }: { date: string }) {
  const { navigateBackToList } = useSystemReportFilters();
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto px-2 py-1 text-xs"
        onClick={navigateBackToList}
      >
        Tổng quan ngày
      </Button>
      <ChevronRight className="size-3 text-muted-foreground" />
      <span className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 font-mono text-xs font-medium">
        <CalendarDays className="size-3" />
        {date}
      </span>
    </div>
  );
}

// ─── DailyOverviewTab ─────────────────────────────────────────────────────────

/** Tab "Tổng quan ngày" — danh sách ngày → drill-down vào từng game trong ngày. */
export function DailyOverviewTab() {
  const { selectedDate } = useSystemReportFilters();

  return (
    <div className="flex flex-col gap-4">
      {selectedDate && <Breadcrumb date={selectedDate} />}
      {!selectedDate && <DailyListView />}
      {selectedDate && <DayDetailView date={selectedDate} />}
    </div>
  );
}

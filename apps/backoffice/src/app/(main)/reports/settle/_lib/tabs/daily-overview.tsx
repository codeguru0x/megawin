"use client";

import type React from "react";

import { useRouter } from "next/navigation";

import type { DailyOverviewRow } from "@megawin/game-core-application/repos";
import type { GameProduct } from "@megawin/game-core/entities";
import { getGameLabel, REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber, formatVNDCompact } from "@megawin/shared/utils";
import {
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  DollarSign,
  Gamepad2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { getPayoutRatioColor, PayoutRatioCell, PayoutRatioKpiBadge } from "@/components/reports/payout-ratio";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getGameHex } from "@/lib/game-colors";
import { cn } from "@/lib/utils";

import { EmptyCard, ErrorCard, TableSkeleton } from "../sections/shared-states";
import { useSystemReportFilters } from "../use-report-filters";
import { useSystemDailyOverview, useSystemDayBreakdown } from "../use-report-queries";

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiStrip({ rows }: { rows: DailyOverviewRow[] }) {
  const totalStake = rows.reduce((s, r) => s + r.totalStake, 0);
  const totalPayout = rows.reduce((s, r) => s + r.totalPayout, 0);
  const ggr = rows.reduce((s, r) => s + r.ggr, 0);
  const netProfit = rows.reduce((s, r) => s + r.netProfit, 0);
  const totalCommission = rows.reduce((s, r) => s + r.totalCommission, 0);
  const drawCount = rows.reduce((s, r) => s + r.drawCount, 0);
  const entryCount = rows.reduce((s, r) => s + r.entryCount, 0);
  const payoutRatio = totalStake > 0 ? totalPayout / totalStake : 0;
  const payoutColor = getPayoutRatioColor(payoutRatio);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {/* Tổng kỳ quay */}
      <KpiCard
        icon={CalendarRange}
        iconBg="bg-indigo-100 dark:bg-indigo-900/50"
        iconColor="text-indigo-600 dark:text-indigo-400"
        label={`Tổng ${REPORT_COLUMN_LABELS.drawCount.toLowerCase()}`}
        value={formatNumber(drawCount)}
        sub={`${formatNumber(entryCount)} lượt cược · ${formatNumber(rows.length)} ngày`}
      />
      {/* Tiền cược */}
      <KpiCard
        icon={DollarSign}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label={REPORT_COLUMN_LABELS.totalStake}
        value={formatVNDCompact(totalStake)}
        sub={`${formatNumber(entryCount)} lượt cược`}
      />
      {/* Trả thưởng + Tỷ lệ TT — Phương án C: gộp 1 card */}
      <KpiCard
        icon={TrendingDown}
        iconBg={payoutColor ? "bg-red-100 dark:bg-red-900/50" : "bg-orange-100 dark:bg-orange-900/50"}
        iconColor={payoutColor ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"}
        label={REPORT_COLUMN_LABELS.totalPayout}
        value={formatVNDCompact(totalPayout)}
        subNode={<PayoutRatioKpiBadge ratio={payoutRatio} />}
      />
      {/* Doanh thu thuần */}
      <KpiCard
        icon={TrendingUp}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label={REPORT_COLUMN_LABELS.ggr}
        value={formatVNDCompact(ggr)}
        valueClass={cn(ggr < 0 && "text-loss", ggr > 0 && "text-profit")}
      />
      {/* Hoa hồng ĐL */}
      <KpiCard
        icon={Building2}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label={REPORT_COLUMN_LABELS.totalCommission}
        value={formatVNDCompact(totalCommission)}
      />
      {/* Lợi nhuận ròng */}
      <KpiCard
        icon={TrendingUp}
        iconBg={netProfit < 0 ? "bg-red-100 dark:bg-red-900/50" : "bg-violet-100 dark:bg-violet-900/50"}
        iconColor={netProfit < 0 ? "text-red-600 dark:text-red-400" : "text-violet-600 dark:text-violet-400"}
        label={REPORT_COLUMN_LABELS.netProfit}
        value={formatVNDCompact(netProfit)}
        valueClass={cn(netProfit < 0 && "text-loss", netProfit > 0 && "text-profit")}
      />
    </div>
  );
}

// ─── KPI Card primitive ───────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
  subNode?: React.ReactNode;
}

function KpiCard({ icon: Icon, iconBg, iconColor, label, value, valueClass, sub, subNode }: KpiCardProps) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-xl border p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className={cn("text-foreground text-lg font-bold tabular-nums", valueClass ?? "")}>{value}</p>
        {subNode}
        {sub && <p className="text-muted-foreground truncate text-xs">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Daily List View ──────────────────────────────────────────────────────────

function DailyListView() {
  const { from, to, navigateToDate } = useSystemReportFilters();
  const { data, isLoading, error } = useSystemDailyOverview(from, to);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-muted h-19 animate-pulse rounded-xl border" />
          ))}
        </div>
        <TableSkeleton />
      </div>
    );
  }
  if (error) {
    return <ErrorCard />;
  }
  if (!data || data.length === 0) {
    return (
      <EmptyCard
        icon="calendar"
        message="Không có dữ liệu"
        description="Không tìm thấy dữ liệu trong khoảng thời gian đã chọn."
      />
    );
  }

  const totals = {
    drawCount: data.reduce((s, r) => s + r.drawCount, 0),
    entryCount: data.reduce((s, r) => s + r.entryCount, 0),
    totalStake: data.reduce((s, r) => s + r.totalStake, 0),
    totalPayout: data.reduce((s, r) => s + r.totalPayout, 0),
    ggr: data.reduce((s, r) => s + r.ggr, 0),
    totalCommission: data.reduce((s, r) => s + r.totalCommission, 0),
    netProfit: data.reduce((s, r) => s + r.netProfit, 0),
  };
  const totalPayoutRatio = totals.totalStake > 0 ? totals.totalPayout / totals.totalStake : 0;

  return (
    <div className="space-y-4">
      <KpiStrip rows={data} />
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-muted-foreground size-4" />
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
                  <TableHead className="pl-5">{REPORT_COLUMN_LABELS.financialDate}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
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
                {data.map((row) => {
                  const payoutRatio = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                  return (
                    <TableRow
                      key={row.financialDate}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigateToDate(row.financialDate)}
                    >
                      <TableCell className="pl-5 font-mono text-sm font-medium">{row.financialDate}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.playerCount)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.drawCount)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.entryCount)}</TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {formatNumber(row.totalStake)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.totalPayout)}</TableCell>
                      <TableCell className="text-right text-sm">
                        <PayoutRatioCell ratio={payoutRatio} />
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.ggr)}</TableCell>
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
                  <TableCell />
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
    </div>
  );
}

// ─── Day Detail View ──────────────────────────────────────────────────────────

function DayDetailView({ date }: { date: string }) {
  useSystemReportFilters(); // giữ hook side-effect filter context (from/to không dùng ở view này)
  const router = useRouter();
  const { data, isLoading, error } = useSystemDayBreakdown(date);

  if (isLoading) {
    return <TableSkeleton rows={8} />;
  }
  if (error) {
    return <ErrorCard />;
  }
  if (!data || data.length === 0) {
    return <EmptyCard icon="calendar" message="Không có dữ liệu" description="Không có dữ liệu game trong ngày này." />;
  }

  const totals = {
    drawCount: data.reduce((s, r) => s + r.drawCount, 0),
    entryCount: data.reduce((s, r) => s + r.entryCount, 0),
    totalStake: data.reduce((s, r) => s + r.totalStake, 0),
    totalPayout: data.reduce((s, r) => s + r.totalPayout, 0),
    ggr: data.reduce((s, r) => s + r.ggr, 0),
    totalCommission: data.reduce((s, r) => s + r.totalCommission, 0),
    netProfit: data.reduce((s, r) => s + r.netProfit, 0),
  };

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Gamepad2 className="text-muted-foreground size-4" />
          <CardTitle className="text-sm font-semibold">Chi tiết theo game — {date}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {data.length} game có dữ liệu · Click để xem báo cáo chi tiết theo game
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">{REPORT_COLUMN_LABELS.game}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
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
              {data.map((game) => (
                <TableRow
                  key={game.gameProduct}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => router.push(`/games/${game.gameProduct}/reports/settle?from=${date}&to=${date}`)}
                >
                  <TableCell className="pl-5 font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full bg-(--swatch-bg)"
                        style={{ "--swatch-bg": getGameHex(game.gameProduct) } as React.CSSProperties}
                      />
                      {getGameLabel(game.gameProduct as GameProduct)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatNumber(game.playerCount)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatNumber(game.drawCount)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatNumber(game.entryCount)}</TableCell>

                  <TableCell className="text-right text-sm font-medium tabular-nums">
                    {formatNumber(game.totalStake)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatNumber(game.totalPayout)}</TableCell>
                  <TableCell className="text-right text-sm">
                    <PayoutRatioCell ratio={game.totalStake > 0 ? game.totalPayout / game.totalStake : 0} />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatNumber(game.ggr)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(game.totalCommission)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "pr-5 text-right text-sm font-medium tabular-nums",
                      game.netProfit < 0 && "text-loss",
                      game.netProfit > 0 && "text-profit",
                    )}
                  >
                    {formatNumber(game.netProfit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="pl-5 text-sm font-semibold">{REPORT_COLUMN_LABELS.summary}</TableCell>
                <TableCell />
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
                  <PayoutRatioCell
                    ratio={totals.totalStake > 0 ? totals.totalPayout / totals.totalStake : 0}
                    className="font-semibold"
                  />
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

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ date }: { date: string }) {
  const { navigateBackToList } = useSystemReportFilters();
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={navigateBackToList}>
        Tổng quan ngày
      </Button>
      <ChevronRight className="text-muted-foreground size-3" />
      <span className="bg-secondary flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs font-medium">
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

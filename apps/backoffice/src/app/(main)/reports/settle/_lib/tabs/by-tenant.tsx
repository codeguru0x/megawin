"use client";

import type React from "react";

import { useRouter } from "next/navigation";

import type { GameProduct } from "@megawin/game-core/entities";
import { getGameLabel, REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import type { TenantGameBreakdownRow, TenantSummaryRow } from "@megawin/game-core-application/repos";
import { formatNumber, formatVNDCompact } from "@megawin/shared/utils";
import { Building2, ChevronRight, DollarSign, Gamepad2, TrendingDown, TrendingUp } from "lucide-react";

import {
  formatPayoutRatio,
  getNetProfitColor,
  getPayoutRatioColor,
  PayoutRatioCell,
  PayoutRatioKpiBadge,
} from "@/components/reports/payout-ratio";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getGameHex } from "@/lib/game-colors";
import { cn } from "@/lib/utils";

import { EmptyCard, ErrorCard, TableSkeleton } from "../sections/shared-states";
import { useSystemReportFilters } from "../use-report-filters";
import { useSystemByTenant, useSystemTenantBreakdown } from "../use-report-queries";

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
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-bold tabular-nums text-foreground", valueClass ?? "")}>{value}</p>
        {subNode}
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiStrip({ data }: { data: TenantSummaryRow[] }) {
  const totalStake = data.reduce((s, r) => s + r.totalStake, 0);
  const totalPayout = data.reduce((s, r) => s + r.totalPayout, 0);
  const ggr = data.reduce((s, r) => s + r.ggr, 0);
  const netProfit = data.reduce((s, r) => s + r.netProfit, 0);
  const totalCommission = data.reduce((s, r) => s + r.totalCommission, 0);
  const payoutRatio = totalStake > 0 ? totalPayout / totalStake : 0;
  const payoutColor = getPayoutRatioColor(payoutRatio);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {/* Số đại lý */}
      <KpiCard
        icon={Building2}
        iconBg="bg-indigo-100 dark:bg-indigo-900/50"
        iconColor="text-indigo-600 dark:text-indigo-400"
        label="Số đại lý"
        value={String(data.length)}
        sub={`${formatNumber(data.reduce((s, r) => s + r.drawCount, 0))} kỳ quay`}
      />
      {/* Tiền cược */}
      <KpiCard
        icon={DollarSign}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label={REPORT_COLUMN_LABELS.totalStake}
        value={formatVNDCompact(totalStake)}
        sub={`${formatNumber(data.reduce((s, r) => s + r.entryCount, 0))} lượt cược`}
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
        valueClass={getNetProfitColor(ggr)}
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
        valueClass={getNetProfitColor(netProfit)}
      />
    </div>
  );
}

// ─── Tenant List View ─────────────────────────────────────────────────────────

function TenantListView() {
  const { from, to, navigateToTenant } = useSystemReportFilters();
  const { data, isLoading, error } = useSystemByTenant(from, to);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-19 animate-pulse rounded-xl border bg-muted" />
          ))}
        </div>
        <TableSkeleton />
      </div>
    );
  }
  if (error) return <ErrorCard />;
  if (!data || data.length === 0)
    return (
      <EmptyCard
        icon="building"
        message="Không có dữ liệu"
        description="Không tìm thấy dữ liệu đại lý trong khoảng thời gian đã chọn. Thử mở rộng khoảng ngày."
      />
    );

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
      <KpiStrip data={data} />
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Xếp hạng đại lý</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {data.length} đại lý · Sắp xếp theo doanh thu giảm dần · Click để xem chi tiết
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Đại lý</TableHead>
                  <TableHead className="text-right">Games</TableHead>
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
                      key={row.tenantId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigateToTenant(row.tenantId)}
                    >
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2">
                          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="text-sm font-medium">{row.tenantId}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{row.gameCount}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.playerCount)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.drawCount)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.entryCount)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums font-medium">
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
                  <TableCell className="pl-5 text-sm font-semibold">{REPORT_COLUMN_LABELS.summary}</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.drawCount)}
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
    </div>
  );
}

// ─── Tenant Detail View ───────────────────────────────────────────────────────

function TenantDetailView({ tenantId }: { tenantId: string }) {
  const { from, to } = useSystemReportFilters();
  const router = useRouter();
  const { data, isLoading, error } = useSystemTenantBreakdown(tenantId, from, to);

  if (isLoading) return <TableSkeleton rows={8} />;
  if (error) return <ErrorCard />;
  if (!data || data.length === 0)
    return (
      <EmptyCard
        icon="building"
        message="Không có dữ liệu"
        description="Đại lý này chưa có dữ liệu trong khoảng thời gian đã chọn."
      />
    );

  const totals = {
    drawCount: data.reduce((s, r) => s + r.drawCount, 0),
    entryCount: data.reduce((s, r) => s + r.entryCount, 0),
    totalStake: data.reduce((s, r) => s + r.totalStake, 0),
    totalPayout: data.reduce((s, r) => s + r.totalPayout, 0),
    ggr: data.reduce((s, r) => s + r.ggr, 0),
    commission: data.reduce((s, r) => s + r.commission, 0),
    netProfit: data.reduce((s, r) => s + r.netProfit, 0),
  };
  const totalPayoutRatio = totals.totalStake > 0 ? totals.totalPayout / totals.totalStake : 0;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Gamepad2 className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Chi tiết theo game — {tenantId}</CardTitle>
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
              {data.map((row) => {
                const payoutRatio = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                return (
                  <TableRow
                    key={row.gameProduct}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      router.push(
                        `/games/${row.gameProduct}/reports/settle?from=${from}&to=${to}&tab=tenants&tenant=${tenantId}`,
                      )
                    }
                  >
                    <TableCell className="pl-5 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: getGameHex(row.gameProduct) }}
                        />
                        {getGameLabel(row.gameProduct as GameProduct)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.playerCount)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.drawCount)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.entryCount)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium">
                      {formatNumber(row.totalStake)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.totalPayout)}</TableCell>
                    <TableCell className="text-right text-sm">
                      <PayoutRatioCell ratio={payoutRatio} />
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.ggr)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(row.commission)}</TableCell>
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
                <TableCell className="pl-5 text-sm font-semibold">{REPORT_COLUMN_LABELS.summary}</TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold" />
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.drawCount)}
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
                  {formatNumber(totals.commission)}
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

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ tenantId }: { tenantId: string }) {
  const { navigateBackToList } = useSystemReportFilters();
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={navigateBackToList}>
        Theo đại lý
      </Button>
      <ChevronRight className="size-3 text-muted-foreground" />
      <span className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs font-medium">
        <Building2 className="size-3" />
        {tenantId}
      </span>
    </div>
  );
}

// ─── ByTenantTab ─────────────────────────────────────────────────────────────

/** Tab "Theo đại lý" — danh sách tenant → drill-down chi tiết từng game. */
export function ByTenantTab() {
  const { selectedTenant } = useSystemReportFilters();

  return (
    <div className="flex flex-col gap-4">
      {selectedTenant && <Breadcrumb tenantId={selectedTenant} />}
      {!selectedTenant && <TenantListView />}
      {selectedTenant && <TenantDetailView tenantId={selectedTenant} />}
    </div>
  );
}

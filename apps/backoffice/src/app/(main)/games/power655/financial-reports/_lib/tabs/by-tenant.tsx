"use client";

import { ChevronRight, Building2, CalendarRange } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPercent, formatNumber } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { usePower655ReportFilters } from "../use-report-filters";
import { usePower655TenantList, usePower655TenantDraws } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "../sections/shared-states";

// ─── Level 1: Tenant Summary Table ───────────────────────────────────────────

function TenantSummaryTable() {
  const { from, to, navigateToTenantDrills } = usePower655ReportFilters();
  const { data, isLoading, error } = usePower655TenantList(from, to);

  if (isLoading) return <TableSkeleton rows={6} />;
  if (error) return <ErrorCard />;
  if (!data?.length)
    return <EmptyCard msg="Không tìm thấy dữ liệu đại lý trong khoảng thời gian đã chọn." />;

  const totals = {
    draws: data.reduce((s, r) => s + r.drawCount, 0),
    players: data.reduce((s, r) => s + r.playerCount, 0),
    entries: data.reduce((s, r) => s + r.entryCount, 0),
    lines: data.reduce((s, r) => s + r.lineCount, 0),
    stake: data.reduce((s, r) => s + r.totalStake, 0),
    payout: data.reduce((s, r) => s + r.totalPayout, 0),
    ggr: data.reduce((s, r) => s + r.ggr, 0),
    commission: data.reduce((s, r) => s + r.totalCommission, 0),
  };
  const totalNetProfit = totals.ggr - totals.commission;
  const totalPayoutPct = totals.stake > 0 ? totals.payout / totals.stake : 0;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Tổng hợp theo đại lý</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {data.length} đại lý · Click để xem kỳ quay
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{REPORT_COLUMN_LABELS.tenantCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.drawId}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.payoutPercent}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalCommission}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.netProfit}</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const payoutPct = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                const netProfit = row.ggr - row.totalCommission;
                return (
                  <TableRow
                    key={row.tenantId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToTenantDrills(row.tenantId)}
                  >
                    <TableCell className="font-medium">{row.tenantId}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.drawCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.playerCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.lineCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatNumber(row.totalStake)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.totalPayout)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={payoutPct > 0.95 ? "destructive" : "secondary"}>
                        {formatPercent(payoutPct)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.ggr)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.totalCommission)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${netProfit < 0 ? "text-loss" : ""}`}
                    >
                      {formatNumber(netProfit)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/30 font-medium">
                <TableCell>{data.length} đại lý</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.draws)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.players)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.entries)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.lines)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.stake)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.payout)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={totalPayoutPct > 0.95 ? "destructive" : "secondary"}>
                    {formatPercent(totalPayoutPct)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.ggr)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.commission)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${totalNetProfit < 0 ? "text-loss" : ""}`}
                >
                  {formatNumber(totalNetProfit)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Level 2: Tenant Draw List ────────────────────────────────────────────────

function TenantDrawList({ tenantId }: { tenantId: string }) {
  const { from, to, navigateToDrawInTenant } = usePower655ReportFilters();
  const { data, isLoading, error } = usePower655TenantDraws(tenantId, from, to);

  if (isLoading) return <TableSkeleton rows={8} />;
  if (error) return <ErrorCard />;
  if (!data?.data.length) return <EmptyCard msg="Không có kỳ quay nào." />;

  const rows = data.data;
  const totals = {
    players: rows.reduce((s, r) => s + r.playerCount, 0),
    entries: rows.reduce((s, r) => s + r.entryCount, 0),
    lines: rows.reduce((s, r) => s + r.lineCount, 0),
    stake: rows.reduce((s, r) => s + r.totalStake, 0),
    payout: rows.reduce((s, r) => s + r.totalPayout, 0),
    ggr: rows.reduce((s, r) => s + r.ggr, 0),
    commission: rows.reduce((s, r) => s + r.totalCommission, 0),
    netProfit: rows.reduce((s, r) => s + r.netProfit, 0),
  };
  const totalPayoutPct = totals.stake > 0 ? totals.payout / totals.stake : 0;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Kỳ quay — {tenantId}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {data.total} kỳ quay · Click để xem players
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{REPORT_COLUMN_LABELS.financialDate}</TableHead>
                <TableHead>{REPORT_COLUMN_LABELS.drawId}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.payoutPercent}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalCommission}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.netProfit}</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const payoutPct = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                return (
                  <TableRow
                    key={row.drawId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToDrawInTenant(row.drawId, row.tenantId)}
                  >
                    <TableCell>{row.financialDate}</TableCell>
                    <TableCell className="font-medium">{row.drawId}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.playerCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.lineCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatNumber(row.totalStake)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.totalPayout)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={payoutPct > 0.95 ? "destructive" : "secondary"}>
                        {formatPercent(payoutPct)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.ggr)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.totalCommission)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${row.netProfit < 0 ? "text-loss" : ""}`}
                    >
                      {formatNumber(row.netProfit)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/30 font-medium">
                <TableCell colSpan={2}>{REPORT_COLUMN_LABELS.summary}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.players)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.entries)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.lines)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.stake)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.payout)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={totalPayoutPct > 0.95 ? "destructive" : "secondary"}>
                    {formatPercent(totalPayoutPct)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.ggr)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.commission)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${totals.netProfit < 0 ? "text-loss" : ""}`}
                >
                  {formatNumber(totals.netProfit)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb() {
  const { tenantId, navigateToList } = usePower655ReportFilters();

  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto px-2 py-1 text-xs"
        onClick={navigateToList}
      >
        Đại lý
      </Button>
      {tenantId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">{tenantId}</span>
        </>
      )}
    </div>
  );
}

/** Tab "Theo đại lý" — 2 cấp drill-down. Power 6/55. */
export function ByTenantTab() {
  const { level, tenantId } = usePower655ReportFilters();

  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}

      {level === "list" && <TenantSummaryTable />}

      {level === "tenant-draws" && tenantId && <TenantDrawList tenantId={tenantId} />}
    </div>
  );
}

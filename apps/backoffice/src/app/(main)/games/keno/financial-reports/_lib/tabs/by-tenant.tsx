"use client";

import { Building2, CalendarRange, ChevronRight } from "lucide-react";
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
import { formatNumber } from "@megawin/shared/utils/number";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { useKenoReportFilters } from "../use-report-filters";
import { useKenoTenantList, useKenoTenantDraws } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "../sections/shared-states";

// ─── Tenant Summary Table ─────────────────────────────────────────────────────

function TenantSummaryTable() {
  const { from, to, navigateToTenantDrills } = useKenoReportFilters();
  const { data, isLoading, error } = useKenoTenantList(from, to);

  if (isLoading) return <TableSkeleton rows={6} />;
  if (error) return <ErrorCard />;
  if (!data?.length)
    return (
      <EmptyCard
        icon="building"
        message="Không có dữ liệu"
        description="Không tìm thấy dữ liệu đại lý trong khoảng thời gian đã chọn."
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
  };
  const totalNetProfit = totals.totalStake - totals.totalPayout - totals.totalCommission;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Tổng hợp theo đại lý</CardTitle>
        </div>
        <CardDescription className="text-xs">{data.length} đại lý</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Đại lý</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.drawId}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalCommission}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.netProfit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const netProfit = row.totalStake - row.totalPayout - row.totalCommission;
                return (
                  <TableRow
                    key={row.tenantId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToTenantDrills(row.tenantId)}
                  >
                    <TableCell className="text-sm font-medium">{row.tenantId}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.drawCount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.playerCount)}
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
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.ggr)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalCommission)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm tabular-nums font-medium ${netProfit < 0 ? "text-loss" : ""}`}
                    >
                      {formatNumber(netProfit)}
                    </TableCell>
                  </TableRow>
                );
              })}
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
                  {formatNumber(totals.playerCount)}
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
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.ggr)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.totalCommission)}
                </TableCell>
                <TableCell
                  className={`text-right text-sm tabular-nums font-semibold ${totalNetProfit < 0 ? "text-loss" : ""}`}
                >
                  {formatNumber(totalNetProfit)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Tenant Draw List ─────────────────────────────────────────────────────────

function TenantDrawList({ tenantId }: { tenantId: string }) {
  const { from, to, navigateToDrawInTenant } = useKenoReportFilters();
  const { data, isLoading, error } = useKenoTenantDraws(tenantId, from, to);

  if (isLoading) return <TableSkeleton rows={8} />;
  if (error) return <ErrorCard />;
  if (!data?.data.length)
    return (
      <EmptyCard icon="calendar" message="Không có dữ liệu" description="Không có kỳ quay nào." />
    );

  const totals = {
    entryCount: data.data.reduce((s, r) => s + r.entryCount, 0),
    playerCount: data.data.reduce((s, r) => s + r.playerCount, 0),
    totalStake: data.data.reduce((s, r) => s + r.totalStake, 0),
    totalPayout: data.data.reduce((s, r) => s + r.totalPayout, 0),
    ggr: data.data.reduce((s, r) => s + r.ggr, 0),
    totalCommission: data.data.reduce((s, r) => s + r.totalCommission, 0),
  };
  const totalNetProfit = totals.totalStake - totals.totalPayout - totals.totalCommission;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Kỳ quay — {tenantId}</CardTitle>
        </div>
        <CardDescription className="text-xs">{data.total} kỳ quay</CardDescription>
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
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalCommission}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.netProfit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((row) => {
                const netProfit = row.totalStake - row.totalPayout - row.totalCommission;
                return (
                  <TableRow
                    key={row.drawId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToDrawInTenant(row.drawId, row.tenantId)}
                  >
                    <TableCell className="text-sm">{row.financialDate}</TableCell>
                    <TableCell className="font-mono text-xs">{row.drawId}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.playerCount)}
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
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.ggr)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalCommission)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm tabular-nums font-medium ${netProfit < 0 ? "text-loss" : ""}`}
                    >
                      {formatNumber(netProfit)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="text-xs font-semibold">
                  {REPORT_COLUMN_LABELS.summary}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.playerCount)}
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
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.ggr)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.totalCommission)}
                </TableCell>
                <TableCell
                  className={`text-right text-sm tabular-nums font-semibold ${totalNetProfit < 0 ? "text-loss" : ""}`}
                >
                  {formatNumber(totalNetProfit)}
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

function Breadcrumb() {
  const { tenantId, navigateToList } = useKenoReportFilters();
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

// ─── ByTenantTab ──────────────────────────────────────────────────────────────

export function ByTenantTab() {
  const { level, tenantId } = useKenoReportFilters();
  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}
      {level === "list" && <TenantSummaryTable />}
      {level === "tenant-draws" && tenantId && <TenantDrawList tenantId={tenantId} />}
    </div>
  );
}

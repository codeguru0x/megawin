"use client";

import { Building2, ChevronRight } from "lucide-react";
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
import { formatPercent, formatNumber } from "@megawin/shared/utils/number";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { useMega645ReportFilters } from "../use-report-filters";
import { useMega645TenantList } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "./shared-states";

/** Cấp 1 tab "Theo đại lý": Bảng tổng hợp tenants. */
export function TenantSummaryTable() {
  const { from, to, navigateToTenantDrills } = useMega645ReportFilters();
  const { data, isLoading, error } = useMega645TenantList(from, to);

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
                      className={`text-right tabular-nums font-medium ${row.netProfit < 0 ? "text-loss" : ""}`}
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

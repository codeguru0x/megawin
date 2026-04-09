"use client";

import { Building2, DollarSign, Percent, TrendingDown, TrendingUp } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { formatVNDCompact, formatNumber } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import {
  getPayoutRatioColor,
  getNetProfitColor,
  PayoutRatioCell,
  PayoutRatioKpiBadge,
} from "@/components/reports/payout-ratio";
import { KpiCard } from "./kpi-card";

/**
 * Một hàng trong bảng tổng hợp theo đại lý.
 * `netProfit` là optional — caller tự tính hoặc có sẵn tùy game.
 */
export interface TenantSummaryRow {
  tenantId: string;
  drawCount: number;
  playerCount: number;
  entryCount: number;
  /** Chỉ game có lines. */
  lineCount?: number;
  totalStake: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
  /**
   * Lợi nhuận ròng. Nếu không truyền vào, component tự tính:
   * `totalStake - totalPayout - totalCommission`
   */
  netProfit?: number;
}

export interface GameTenantReportTableProps {
  rows: TenantSummaryRow[];
  /** Gọi khi click vào 1 đại lý → drill-down xem danh sách kỳ quay của đại lý đó. */
  onRowClick: (tenantId: string) => void;
  /** Hiện cột "Số dòng" (lineCount). Default: false. */
  showLineCount?: boolean;
}

/**
 * Bảng "Tổng hợp theo đại lý" + KPI strip 6 cards cho tab "Theo đại lý" của per-game financial reports.
 *
 * KPIs: Số đại lý · Tiền cược · Trả thưởng (+ Tỷ lệ TT) · Doanh thu thuần · Hoa hồng ĐL · Lợi nhuận ròng
 *
 * Columns: Đại lý · Người chơi · Kỳ quay · Lượt cược · [Số dòng] · Tiền cược · Trả thưởng · Tỷ lệ TT · Doanh thu thuần · Hoa hồng ĐL · Lợi nhuận ròng
 */
export function GameTenantReportTable({
  rows,
  onRowClick,
  showLineCount = false,
}: GameTenantReportTableProps) {
  const totals = rows.reduce(
    (acc, r) => {
      const rNetProfit = r.netProfit ?? r.totalStake - r.totalPayout - r.totalCommission;
      return {
        drawCount: acc.drawCount + r.drawCount,
        playerCount: acc.playerCount + r.playerCount,
        entryCount: acc.entryCount + r.entryCount,
        lineCount: acc.lineCount + (r.lineCount ?? 0),
        totalStake: acc.totalStake + r.totalStake,
        totalPayout: acc.totalPayout + r.totalPayout,
        ggr: acc.ggr + r.ggr,
        totalCommission: acc.totalCommission + r.totalCommission,
        netProfit: acc.netProfit + rNetProfit,
      };
    },
    {
      drawCount: 0,
      playerCount: 0,
      entryCount: 0,
      lineCount: 0,
      totalStake: 0,
      totalPayout: 0,
      ggr: 0,
      totalCommission: 0,
      netProfit: 0,
    },
  );

  const payoutRatio = totals.totalStake > 0 ? totals.totalPayout / totals.totalStake : 0;
  const payoutColor = getPayoutRatioColor(payoutRatio);

  return (
    <div className="space-y-4">
      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          icon={Building2}
          iconBg="bg-indigo-100 dark:bg-indigo-900/50"
          iconColor="text-indigo-600 dark:text-indigo-400"
          label="Số đại lý"
          value={formatNumber(rows.length)}
          sub="đại lý hoạt động"
        />
        <KpiCard
          icon={DollarSign}
          iconBg="bg-emerald-100 dark:bg-emerald-900/50"
          iconColor="text-emerald-600 dark:text-emerald-400"
          label={REPORT_COLUMN_LABELS.totalStake}
          value={formatVNDCompact(totals.totalStake)}
          sub={`${formatNumber(totals.entryCount)} lượt cược`}
        />
        <KpiCard
          icon={TrendingDown}
          iconBg={
            payoutColor ? "bg-red-100 dark:bg-red-900/50" : "bg-orange-100 dark:bg-orange-900/50"
          }
          iconColor={
            payoutColor ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"
          }
          label={REPORT_COLUMN_LABELS.totalPayout}
          value={formatVNDCompact(totals.totalPayout)}
          subNode={<PayoutRatioKpiBadge ratio={payoutRatio} />}
        />
        <KpiCard
          icon={TrendingUp}
          iconBg="bg-blue-100 dark:bg-blue-900/50"
          iconColor="text-blue-600 dark:text-blue-400"
          label={REPORT_COLUMN_LABELS.ggr}
          value={formatVNDCompact(totals.ggr)}
          valueClass={getNetProfitColor(totals.ggr)}
        />
        <KpiCard
          icon={Percent}
          iconBg="bg-amber-100 dark:bg-amber-900/50"
          iconColor="text-amber-600 dark:text-amber-400"
          label={REPORT_COLUMN_LABELS.totalCommission}
          value={formatVNDCompact(totals.totalCommission)}
        />
        <KpiCard
          icon={totals.netProfit < 0 ? TrendingDown : TrendingUp}
          iconBg={
            totals.netProfit < 0
              ? "bg-red-100 dark:bg-red-900/50"
              : "bg-violet-100 dark:bg-violet-900/50"
          }
          iconColor={
            totals.netProfit < 0
              ? "text-red-600 dark:text-red-400"
              : "text-violet-600 dark:text-violet-400"
          }
          label={REPORT_COLUMN_LABELS.netProfit}
          value={formatVNDCompact(totals.netProfit)}
          valueClass={getNetProfitColor(totals.netProfit)}
        />
      </div>

      {/* ── Table ── */}
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Tổng hợp theo đại lý</CardTitle>
          </div>
          <CardDescription className="text-xs">{rows.length} đại lý</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Đại lý</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.drawId}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                  {showLineCount && (
                    <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                  )}
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.payoutPercent}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                  <TableHead className="text-right">
                    {REPORT_COLUMN_LABELS.totalCommission}
                  </TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.netProfit}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const rowNetProfit =
                    row.netProfit ?? row.totalStake - row.totalPayout - row.totalCommission;
                  const rowPayoutRatio = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                  return (
                    <TableRow
                      key={row.tenantId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onRowClick(row.tenantId)}
                    >
                      <TableCell className="text-sm font-medium">{row.tenantId}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.playerCount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.drawCount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.entryCount)}
                      </TableCell>
                      {showLineCount && (
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatNumber(row.lineCount ?? 0)}
                        </TableCell>
                      )}
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.totalStake)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.totalPayout)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <PayoutRatioCell ratio={rowPayoutRatio} />
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.ggr)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.totalCommission)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-sm tabular-nums font-medium",
                          getNetProfitColor(rowNetProfit),
                        )}
                      >
                        {formatNumber(rowNetProfit)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="text-sm font-semibold">
                    {REPORT_COLUMN_LABELS.summary}
                  </TableCell>
                  {/* Bỏ tổng playerCount — không chính xác khi cùng player ở nhiều đại lý */}
                  <TableCell className="text-right text-sm tabular-nums font-semibold text-muted-foreground" />
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.drawCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.entryCount)}
                  </TableCell>
                  {showLineCount && (
                    <TableCell className="text-right text-sm tabular-nums font-semibold">
                      {formatNumber(totals.lineCount)}
                    </TableCell>
                  )}
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.totalStake)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.totalPayout)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    <PayoutRatioCell
                      ratio={totals.totalStake > 0 ? totals.totalPayout / totals.totalStake : 0}
                      className="font-semibold"
                    />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.ggr)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.totalCommission)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right text-sm tabular-nums font-semibold",
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

"use client";

import { CalendarRange } from "lucide-react";
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
import { formatNumber } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { getNetProfitColor, PayoutRatioCell } from "@/components/reports/payout-ratio";

/**
 * Một hàng kỳ quay trong bảng danh sách kỳ quay của 1 đại lý.
 */
export interface TenantDrawRow {
  drawId: string;
  financialDate: string;
  tenantId: string;
  playerCount: number;
  entryCount: number;
  /** Chỉ game có lines. */
  lineCount?: number;
  totalStake: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
  /**
   * Lợi nhuận ròng. Nếu không truyền, component tự tính:
   * `totalStake - totalPayout - totalCommission`
   */
  netProfit?: number;
}

export interface GameTenantDrawListProps {
  /** ID đại lý — hiển thị trong CardTitle. */
  tenantId: string;
  rows: TenantDrawRow[];
  /** Tổng số kỳ quay của đại lý (dùng cho CardDescription). */
  totalCount?: number;
  /** Gọi khi click vào 1 kỳ quay → drill-down xem player list của kỳ đó. */
  onRowClick: (drawId: string, tenantId: string) => void;
  /** Hiện cột "Số dòng" (lineCount). Default: false. */
  showLineCount?: boolean;
}

/**
 * Bảng "Danh sách kỳ quay" của 1 đại lý — level 2 drill-down trong tab "Theo đại lý".
 *
 * Columns: Ngày TC · Kỳ quay · Người chơi · Lượt cược · [Số dòng] · Tiền cược · Trả thưởng · Tỷ lệ TT · Doanh thu thuần · Hoa hồng ĐL · Lợi nhuận ròng
 */
export function GameTenantDrawList({
  tenantId,
  rows,
  totalCount,
  onRowClick,
  showLineCount = false,
}: GameTenantDrawListProps) {
  const totals = rows.reduce(
    (acc, r) => {
      const rNetProfit = r.netProfit ?? r.totalStake - r.totalPayout - r.totalCommission;
      return {
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

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Kỳ quay — {tenantId}</CardTitle>
        </div>
        <CardDescription className="text-xs">{totalCount ?? rows.length} kỳ quay</CardDescription>
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
                {showLineCount && (
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                )}
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.payoutPercent}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalCommission}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.netProfit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const rowNetProfit =
                  row.netProfit ?? row.totalStake - row.totalPayout - row.totalCommission;
                const payoutRatio = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                return (
                  <TableRow
                    key={row.drawId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onRowClick(row.drawId, row.tenantId)}
                  >
                    <TableCell className="text-sm">{row.financialDate}</TableCell>
                    <TableCell className="text-sm font-mono">{row.drawId}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.playerCount)}
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
                      <PayoutRatioCell ratio={payoutRatio} />
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
                <TableCell colSpan={2} className="text-sm font-semibold">
                  {REPORT_COLUMN_LABELS.summary}
                </TableCell>
                {/* Bỏ tổng playerCount */}
                <TableCell className="text-right text-sm tabular-nums font-semibold text-muted-foreground" />
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
  );
}

"use client";

import { Building2 } from "lucide-react";
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
import { formatNumber } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { PayoutRatioCell } from "@/components/reports/payout-ratio";

/**
 * Một hàng trong bảng breakdown đại lý của 1 kỳ quay cụ thể.
 */
export interface DrawTenantRow {
  tenantId: string;
  playerCount: number;
  entryCount: number;
  /** Chỉ game có lines. */
  lineCount?: number;
  totalStake: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
}

export interface GameDrawTenantTableProps {
  /** ID kỳ quay — hiển thị trong CardTitle. */
  drawId: string;
  rows: DrawTenantRow[];
  /** Gọi khi click vào 1 đại lý → drill-down xem player list. */
  onRowClick: (tenantId: string) => void;
  /** Hiện cột "Số dòng" (lineCount). Default: false. */
  showLineCount?: boolean;
}

/**
 * Bảng "Đại lý theo kỳ quay" — level 2 drill-down trong tab "Theo kỳ quay".
 *
 * Columns: Đại lý · Người chơi · Lượt cược · [Số dòng] · Tiền cược · Trả thưởng · Tỷ lệ TT · Doanh thu thuần · Hoa hồng ĐL
 */
export function GameDrawTenantTable({
  drawId,
  rows,
  onRowClick,
  showLineCount = false,
}: GameDrawTenantTableProps) {
  const totals = rows.reduce(
    (acc, r) => ({
      playerCount: acc.playerCount + r.playerCount,
      entryCount: acc.entryCount + r.entryCount,
      lineCount: acc.lineCount + (r.lineCount ?? 0),
      totalStake: acc.totalStake + r.totalStake,
      totalPayout: acc.totalPayout + r.totalPayout,
      ggr: acc.ggr + r.ggr,
      totalCommission: acc.totalCommission + r.totalCommission,
    }),
    {
      playerCount: 0,
      entryCount: 0,
      lineCount: 0,
      totalStake: 0,
      totalPayout: 0,
      ggr: 0,
      totalCommission: 0,
    },
  );

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Đại lý — {drawId}</CardTitle>
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
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                {showLineCount && (
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                )}
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.payoutPercent}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalCommission}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const payoutRatio = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
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
                    <TableCell className="text-right text-sm tabular-nums">
                      <PayoutRatioCell ratio={payoutRatio} />
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.ggr)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalCommission)}
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
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

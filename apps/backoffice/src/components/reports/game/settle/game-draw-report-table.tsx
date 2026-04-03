"use client";

import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { formatNumber } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { getNetProfitColor, PayoutRatioCell } from "@/components/reports/payout-ratio";

/**
 * Một hàng trong bảng danh sách kỳ quay.
 * `lineCount` là optional — chỉ game có lines mới truyền vào (Lotto535, Mega645, Power655, Max3D, Max3DPro).
 */
export interface DrawReportRow {
  drawId: string;
  financialDate: string;
  playerCount: number;
  entryCount: number;
  /** Chỉ game có lines (Lotto535, Mega645, Power655, Max3D, Max3DPro). */
  lineCount?: number;
  totalStake: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
  netProfit: number;
}

export interface GameDrawReportTableProps {
  rows: DrawReportRow[];
  /** Gọi khi click vào 1 row → drill-down vào kỳ quay đó. */
  onRowClick: (drawId: string) => void;
  /** Hiện cột "Số dòng" (lineCount). Default: false. */
  showLineCount?: boolean;
  /** Tổng số kỳ quay (dùng cho phân trang + CardDescription). */
  totalCount?: number;
  /** Trang hiện tại (1-indexed). */
  page?: number;
  /** Số trang tổng cộng. */
  totalPages?: number;
  /** Callback đổi trang. */
  onPageChange?: (page: number) => void;
  /**
   * Mô tả thêm về tần suất kỳ quay, VD: "~120 kỳ/ngày".
   * Hiển thị trong CardDescription.
   */
  drawFrequencyLabel?: string;
}

/**
 * Bảng "Danh sách kỳ quay" chuẩn cho tab "Theo kỳ quay" của per-game financial reports.
 *
 * Columns: Ngày TC · Kỳ quay · Người chơi · Lượt cược · [Số dòng] · Tiền cược · Trả thưởng · Tỷ lệ TT · Doanh thu thuần · Hoa hồng ĐL · Lợi nhuận ròng
 *
 * Dùng ở tất cả 7 game. Truyền `showLineCount` cho game có lineCount.
 */
export function GameDrawReportTable({
  rows,
  onRowClick,
  showLineCount = false,
  totalCount = 0,
  page = 1,
  totalPages = 1,
  onPageChange,
  drawFrequencyLabel,
}: GameDrawReportTableProps) {
  const totals = rows.reduce(
    (acc, r) => ({
      playerCount: acc.playerCount + r.playerCount,
      entryCount: acc.entryCount + r.entryCount,
      lineCount: acc.lineCount + (r.lineCount ?? 0),
      totalStake: acc.totalStake + r.totalStake,
      totalPayout: acc.totalPayout + r.totalPayout,
      ggr: acc.ggr + r.ggr,
      totalCommission: acc.totalCommission + r.totalCommission,
      netProfit: acc.netProfit + r.netProfit,
    }),
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

  const descParts = [
    `${totalCount} kỳ`,
    drawFrequencyLabel,
    totalPages > 1 ? `Trang ${page}/${totalPages}` : undefined,
  ].filter(Boolean);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarRange className="size-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-sm font-semibold">Danh sách kỳ quay</CardTitle>
              <CardDescription className="text-xs">{descParts.join(" · ")}</CardDescription>
            </div>
          </div>
          {totalPages > 1 && onPageChange && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={page === 1}
                onClick={() => onPageChange(page - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {page}/{totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
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
                const payoutRatio = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                return (
                  <TableRow
                    key={row.drawId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onRowClick(row.drawId)}
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
                    <TableCell className="text-right text-sm tabular-nums">
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
                <TableCell colSpan={showLineCount ? 3 : 3} className="text-sm font-semibold">
                  {REPORT_COLUMN_LABELS.summary}
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

        {/* Bottom pagination */}
        {totalPages > 1 && onPageChange && (
          <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Trang {page}/{totalPages} · {totalCount} kỳ quay
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => onPageChange(page - 1)}
              >
                <ChevronLeft className="mr-1 size-3" />
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                Sau
                <ChevronRight className="ml-1 size-3" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

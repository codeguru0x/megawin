"use client";

import { Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatNumber } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";

/**
 * Một hàng player trong bảng breakdown.
 * `totalWin` là tiền thắng gốc (trước khi trừ cược lại), `totalPayout` là thực lãnh.
 */
export interface PlayerBreakdownRow {
  accountId: string;
  /** Tên hiển thị đã qua `toTenantUsername`. Nếu null dùng accountId. */
  displayName: string;
  entryCount: number;
  /** Chỉ game có lines (Lotto535, Mega645, Power655, Max3D, Max3DPro). */
  lineCount?: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
}

export interface GamePlayerBreakdownTableProps {
  /** ID kỳ quay — hiển thị trong CardTitle. */
  drawId: string;
  /** ID đại lý — hiển thị trong CardTitle. */
  tenantId: string;
  rows: PlayerBreakdownRow[];
  /** Gọi khi click vào 1 player → drill-down xem entries. */
  onRowClick: (accountId: string, displayName: string) => void;
  /** Hiện cột "Số dòng" (lineCount). Default: false. */
  showLineCount?: boolean;
}

/**
 * Bảng "Người chơi" — level 3 drill-down trong tab "Theo kỳ quay".
 *
 * Columns: Tài khoản · Lượt cược · [Số dòng] · Tiền cược · Trả thưởng · Lãi/Lỗ (KH)
 *
 * "Lãi/Lỗ (KH)" = góc nhìn khách hàng: dương = thắng, âm = thua.
 */
export function GamePlayerBreakdownTable({
  drawId,
  tenantId,
  rows,
  onRowClick,
  showLineCount = false,
}: GamePlayerBreakdownTableProps) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">
            Người chơi — {tenantId} · {drawId}
          </CardTitle>
        </div>
        <CardDescription className="text-xs">{rows.length} người chơi</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tài khoản</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                {showLineCount && (
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                )}
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">Lãi / Lỗ (KH)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                // Góc nhìn khách: dương = thắng, âm = thua
                const playerNet = row.totalPayout - row.totalStake;
                return (
                  <TableRow
                    key={row.accountId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onRowClick(row.accountId, row.displayName)}
                  >
                    <TableCell className="text-sm font-medium">{row.displayName}</TableCell>
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
                    <TableCell
                      className={`text-right text-sm tabular-nums font-medium ${
                        playerNet > 0 ? "text-profit" : ""
                      }`}
                    >
                      {playerNet > 0 ? "+" : ""}
                      {formatNumber(playerNet)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

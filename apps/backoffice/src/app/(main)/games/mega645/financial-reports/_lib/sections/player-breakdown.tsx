"use client";

import { Users, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatNumber } from "@megawin/shared/utils/number";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { useMega645ReportFilters } from "../use-report-filters";
import { useMega645Players } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "./shared-states";

/** Cấp 3: Danh sách players cho 1 draw × 1 tenant. */
export function PlayerBreakdown({ drawId, tenantId }: { drawId: string; tenantId: string }) {
  const { navigateToPlayer } = useMega645ReportFilters();
  const { data, isLoading, error } = useMega645Players(drawId, tenantId);

  if (isLoading) return <TableSkeleton rows={8} />;
  if (error) return <ErrorCard />;
  if (!data?.length) return <EmptyCard msg="Không có player nào." />;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">
            Players — Kỳ {drawId} / {tenantId}
          </CardTitle>
        </div>
        <CardDescription className="text-xs">
          {data.length} players · Click player để xem entries
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                // GGR nhìn từ góc công ty: stake - payout
                const ggr = row.totalStake - row.totalPayout;
                return (
                  <TableRow
                    key={row.accountId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToPlayer(row.accountId, row.username || row.accountId)}
                  >
                    <TableCell>
                      <p className="font-medium">{row.username || row.accountId}</p>
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
                    <TableCell
                      className={`text-right tabular-nums font-medium ${ggr < 0 ? "text-loss" : ""}`}
                    >
                      {formatNumber(ggr)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
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

"use client";

import { Suspense, useState } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { Ban } from "lucide-react";
import { FinancialDateRangePicker } from "@/components/date-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatVND, formatNumber } from "@megawin/shared/utils/number";
import { todayVN } from "@megawin/shared/utils/date";
import type { VoidDrawReport } from "@megawin/game-bingo18/entities";
import { useBingo18VoidReports } from "../financial-reports/_lib/use-report-queries";

function VoidTable({ from, to }: { from: string; to: string }) {
  const [selectedReport, setSelectedReport] = useState<VoidDrawReport | null>(null);
  const { data, isLoading, error } = useBingo18VoidReports(from, to);
  if (isLoading)
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  if (error)
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Lỗi tải dữ liệu.
        </CardContent>
      </Card>
    );
  const rows = data ?? [];
  const totalRefund = rows.reduce((s, r) => s + r.totalRefundAmount, 0);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Tổng kỳ huỷ</p>
          <p className="mt-1 text-2xl font-bold">{rows.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Tổng hoàn trả</p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatVND(totalRefund)}
          </p>
        </div>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Danh sách kỳ đã void</CardTitle>
          <CardDescription className="text-xs">{rows.length} kỳ bị huỷ</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Không có.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kỳ quay</TableHead>
                    <TableHead>Ngày TC</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Players</TableHead>
                    <TableHead className="text-right">Tenants</TableHead>
                    <TableHead className="text-right">Cược gốc</TableHead>
                    <TableHead className="text-right">Hoàn trả</TableHead>
                    <TableHead className="text-center">Settle trước?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.drawId}>
                      <TableCell className="font-mono text-xs">{row.drawId}</TableCell>
                      <TableCell>{row.financialDate}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.entryCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.playerCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.tenantCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVND(row.totalOriginalStake)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                        {formatVND(row.totalRefundAmount)}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.wasPreviouslySettled ? (
                          <div className="flex items-center justify-center gap-2">
                            <Badge variant="outline" className="border-warning text-warning">
                              Có
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setSelectedReport(row)}
                            >
                              Xem snapshot
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="secondary">Không</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {selectedReport?.previousSettleSnapshot && (
        <Dialog open={!!selectedReport} onOpenChange={(v) => !v && setSelectedReport(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Snapshot trước khi Void — Bingo 18</DialogTitle>
              <DialogDescription>
                Kỳ {selectedReport.drawId} · {selectedReport.financialDate}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "Doanh thu gốc",
                  value: formatVND(selectedReport.previousSettleSnapshot.totalStake),
                },
                {
                  label: "Trả thưởng",
                  value: formatVND(selectedReport.previousSettleSnapshot.totalPayout),
                },
                { label: "GGR", value: formatVND(selectedReport.previousSettleSnapshot.ggr) },
                {
                  label: "Hoa hồng",
                  value: formatVND(selectedReport.previousSettleSnapshot.totalCommission),
                },
                {
                  label: "Lợi nhuận ròng",
                  value: formatVND(selectedReport.previousSettleSnapshot.netProfit),
                },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-bold tabular-nums">{item.value}</p>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export default function Bingo18VoidReportsPage() {
  const today = todayVN();
  const [from, setFrom] = useQueryState("from", parseAsString.withDefault(today));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault(today));
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <div className="@container/main flex flex-col gap-4 md:gap-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-green-500 to-green-600 shadow-sm">
            <Ban className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Bingo 18 — Kỳ huỷ</h1>
            <p className="text-xs text-muted-foreground">Danh sách kỳ quay đã void và hoàn trả</p>
          </div>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <FinancialDateRangePicker
            from={from}
            to={to}
            onChange={(f, t) => {
              void setFrom(f);
              void setTo(t);
            }}
          />
        </div>
        <VoidTable from={from} to={to} />
      </div>
    </Suspense>
  );
}

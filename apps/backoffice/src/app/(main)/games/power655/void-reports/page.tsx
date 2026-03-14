"use client";

import { Suspense, useState } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { Ban } from "lucide-react";
import { FinancialDateRangePicker } from "@/components/financial-date-range-picker";
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
import type { VoidDrawReport } from "@megawin/game-power655/entities";
import { usePower655VoidReports } from "../financial-reports/_lib/use-report-queries";

function VoidSnapshotDialog({
  report,
  open,
  onClose,
}: {
  report: VoidDrawReport | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!report?.previousSettleSnapshot) return null;

  const snap = report.previousSettleSnapshot;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Snapshot trước khi Void — Power 6/55</DialogTitle>
          <DialogDescription>
            Kỳ {report.drawId} · Ngày TC: {report.financialDate}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Doanh thu gốc", value: formatVND(snap.totalStake) },
              { label: "Trả thưởng", value: formatVND(snap.totalPayout), className: "text-danger" },
              {
                label: "GGR",
                value: formatVND(snap.ggr),
                className: snap.ggr >= 0 ? "text-success" : "text-danger",
              },
              {
                label: "Hoa hồng",
                value: formatVND(snap.totalCommission),
                className: "text-muted-foreground",
              },
              {
                label: "Lợi nhuận ròng",
                value: formatVND(snap.netProfit),
                className: snap.netProfit >= 0 ? "text-success" : "text-danger",
              },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={`text-sm font-bold tabular-nums ${item.className ?? ""}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">Tác động của void:</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Void đã xoá <strong>{formatVND(snap.totalStake)}</strong> doanh thu và{" "}
              <strong>{formatVND(snap.netProfit)}</strong> lợi nhuận khỏi báo cáo ngày{" "}
              <strong>{report.financialDate}</strong>.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KpiStrip({ data }: { data: VoidDrawReport[] }) {
  const totalRefund = data.reduce((s, r) => s + r.totalRefundAmount, 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs text-muted-foreground">Tổng kỳ huỷ</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{data.length}</p>
        <p className="text-xs text-muted-foreground">kỳ quay đã void</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs text-muted-foreground">Tổng hoàn trả</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
          {formatVND(totalRefund)}
        </p>
        <p className="text-xs text-muted-foreground">đã hoàn cho khách</p>
      </div>
    </div>
  );
}

function VoidTable({ from, to }: { from: string; to: string }) {
  const [selectedReport, setSelectedReport] = useState<VoidDrawReport | null>(null);

  const { data, isLoading, error } = usePower655VoidReports(from, to);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Lỗi tải dữ liệu. Vui lòng thử lại.
        </CardContent>
      </Card>
    );
  }

  const rows = data ?? [];

  return (
    <>
      <KpiStrip data={rows} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Danh sách kỳ quay đã void</CardTitle>
          <CardDescription className="text-xs">
            {rows.length} kỳ quay bị huỷ trong khoảng thời gian đã chọn
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Không có kỳ quay void nào trong khoảng thời gian đã chọn.
            </div>
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
                      <TableCell className="text-sm">{row.financialDate}</TableCell>
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

      <VoidSnapshotDialog
        report={selectedReport}
        open={!!selectedReport}
        onClose={() => setSelectedReport(null)}
      />
    </>
  );
}

function Power655VoidReportsContent() {
  const today = todayVN();
  const [from, setFrom] = useQueryState("from", parseAsString.withDefault(today));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault(today));

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-red-500 to-red-600 shadow-sm">
            <Ban className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Power 6/55 — Kỳ huỷ
            </h1>
            <p className="text-xs text-muted-foreground">
              Danh sách kỳ quay đã void và hoàn trả cho khách hàng
            </p>
          </div>
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
  );
}

export default function Power655VoidReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <Power655VoidReportsContent />
    </Suspense>
  );
}

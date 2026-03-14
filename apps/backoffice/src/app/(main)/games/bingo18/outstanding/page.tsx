"use client";

import { Suspense } from "react";
import { Clock, RefreshCw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatVND, formatVNDCompact, formatNumber } from "@megawin/shared/utils/number";
import { useBingo18Outstanding } from "../financial-reports/_lib/use-report-queries";

function OutstandingTable() {
  const { data, isLoading, error, dataUpdatedAt } = useBingo18Outstanding();
  const rows = data ?? [];
  const totalEntries = rows.reduce((s, r) => s + r.entryCount, 0);
  const totalStake = rows.reduce((s, r) => s + r.totalStake, 0);
  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("vi-VN") : null;

  if (isLoading)
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (error)
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Lỗi tải dữ liệu.
        </CardContent>
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Kỳ đang active</p>
          <p className="mt-1 text-2xl font-bold">{rows.length}</p>
          <p className="text-xs text-muted-foreground">kỳ chưa settle (~6 phút/kỳ)</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pending Entries</p>
          <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {formatNumber(totalEntries)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pending Stake</p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatVNDCompact(totalStake)}
          </p>
          <p className="text-xs text-muted-foreground">{formatVND(totalStake)}</p>
        </div>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Kỳ quay active</CardTitle>
              <CardDescription className="text-xs">
                Refresh 60s · ~10+ active draws{updatedAt && ` · Cập nhật ${updatedAt}`}
              </CardDescription>
            </div>
            <RefreshCw className="size-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Không có kỳ outstanding.
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
                    <TableHead className="text-right">Pending Stake</TableHead>
                    <TableHead className="text-right">Est. Commission</TableHead>
                    <TableHead>Snapshot</TableHead>
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
                      <TableCell className="text-right tabular-nums font-medium text-amber-600 dark:text-amber-400">
                        {formatVND(row.totalStake)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatVND(row.estimatedCommission)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(row.snapshotAt).toLocaleTimeString("vi-VN")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Bingo18OutstandingPage() {
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
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-amber-500 to-amber-600 shadow-sm">
            <Clock className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Bingo 18 — Outstanding</h1>
            <p className="text-xs text-muted-foreground">
              Entries chưa settle · TTL 15 phút · Refresh 60s · ~10+ active draws
            </p>
          </div>
        </div>
        <OutstandingTable />
      </div>
    </Suspense>
  );
}

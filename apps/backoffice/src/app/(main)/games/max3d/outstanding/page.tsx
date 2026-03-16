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
import type { OutstandingDrawReport } from "@megawin/game-max3d/entities";
import { useMax3DOutstanding } from "../financial-reports/_lib/use-report-queries";

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiStrip({ data }: { data: OutstandingDrawReport[] }) {
  const totalEntries = data.reduce((s, r) => s + r.entryCount, 0);
  const totalStake = data.reduce((s, r) => s + r.totalStake, 0);
  const totalLines = data.reduce((s, r) => s + (r.lineCount ?? 0), 0);

  const cards = [
    {
      label: "Kỳ đang active",
      value: String(data.length),
      sub: "kỳ quay chưa settle · Max 3D ~2 kỳ/ngày",
    },
    {
      label: "Pending Entries",
      value: formatNumber(totalEntries),
      sub: `${formatNumber(totalLines)} lines`,
      highlight: "blue" as const,
    },
    {
      label: "Pending Stake",
      value: formatVNDCompact(totalStake),
      sub: formatVND(totalStake),
      highlight: "amber" as const,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${c.highlight === "blue" ? "text-blue-600 dark:text-blue-400" : c.highlight === "amber" ? "text-amber-600 dark:text-amber-400" : ""}`}
          >
            {c.value}
          </p>
          <p className="truncate text-xs text-muted-foreground">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Outstanding Table ────────────────────────────────────────────────────────

function OutstandingTable() {
  const { data, isLoading, error, dataUpdatedAt } = useMax3DOutstanding();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
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
  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("vi-VN") : null;

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip data={rows} />

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Kỳ quay đang active</CardTitle>
              <CardDescription className="text-xs">
                Tự động refresh mỗi 60 giây · Max 3D có tối đa ~4 kỳ outstanding (T2, T4, T6)
                {updatedAt && ` · Cập nhật lúc ${updatedAt}`}
              </CardDescription>
            </div>
            <RefreshCw className="size-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Không có kỳ quay outstanding hiện tại.
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
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Pending Stake</TableHead>
                    <TableHead className="text-right">Est. Commission</TableHead>
                    <TableHead>Snapshot lúc</TableHead>
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
                        {formatNumber(row.lineCount ?? 0)}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

function Max3DOutstandingContent() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-violet-600 shadow-sm">
          <Clock className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Max 3D — Outstanding
          </h1>
          <p className="text-xs text-muted-foreground">
            Entries chưa settle · Snapshot TTL 15 phút · Tự động refresh mỗi 60s · ~2 kỳ/ngày
          </p>
        </div>
      </div>

      <OutstandingTable />
    </div>
  );
}

export default function Max3DOutstandingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-64" />
          <div className="grid gap-3 sm:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <Max3DOutstandingContent />
    </Suspense>
  );
}

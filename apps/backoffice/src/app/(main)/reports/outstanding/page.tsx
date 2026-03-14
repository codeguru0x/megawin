"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { Clock, ExternalLink, RefreshCw } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatVND, formatVNDCompact, formatNumber } from "@megawin/shared/utils/number";
import { displayVNTimeWithSeconds } from "@megawin/shared/utils/date";
import type { SystemOutstandingGameDaily } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import { useSystemOutstanding } from "../financial/_lib/use-report-queries";

// ─── Content ──────────────────────────────────────────────────────────────────

function SystemOutstandingContent() {
  const router = useRouter();

  const { data, isLoading, error, dataUpdatedAt, refetch, isFetching } = useSystemOutstanding();

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  // KPI aggregates
  const totalStake = data?.reduce((s, r) => s + r.totalOutstandingStake, 0) ?? 0;
  const totalActiveDraws = data?.reduce((s, r) => s + r.activeDrawCount, 0) ?? 0;
  const totalEstCommission = data?.reduce((s, r) => s + r.totalEstimatedCommission, 0) ?? 0;

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-amber-500 to-amber-600 shadow-sm">
            <Clock className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Outstanding — Số liệu đang chờ
            </h1>
            <p className="text-xs text-muted-foreground">
              Entries chưa settle trên toàn hệ thống · Tự động cập nhật mỗi 1 phút
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-xs text-muted-foreground">
              Cập nhật lúc: {displayVNTimeWithSeconds(updatedAt)}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-muted-foreground">Tổng Pending Stake</p>
            <div className="mt-1 text-xl font-bold tabular-nums" title={formatVND(totalStake)}>
              {isLoading ? <Skeleton className="h-6 w-32" /> : formatVNDCompact(totalStake)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Toàn hệ thống</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-muted-foreground">Active Draws</p>
            <div className="mt-1 text-xl font-bold tabular-nums">
              {isLoading ? <Skeleton className="h-6 w-16" /> : formatNumber(totalActiveDraws)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Tổng tất cả games</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-muted-foreground">Est. Commission</p>
            <div
              className="mt-1 text-xl font-bold tabular-nums"
              title={formatVND(totalEstCommission)}
            >
              {isLoading ? <Skeleton className="h-6 w-28" /> : formatVNDCompact(totalEstCommission)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Ước tính hoa hồng</p>
          </CardContent>
        </Card>
      </div>

      {/* Outstanding Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Outstanding theo game</CardTitle>
          <CardDescription className="text-xs">
            Dữ liệu TTL 15 phút · Tự động xoá sau khi draw settle/void
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Lỗi tải dữ liệu. Vui lòng thử lại.
            </div>
          ) : isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Không có draw active nào trên hệ thống.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Game</TableHead>
                    <TableHead className="text-right">Active Draws</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Players</TableHead>
                    <TableHead className="text-right">Tenants</TableHead>
                    <TableHead className="text-right">Pending Stake</TableHead>
                    <TableHead className="text-right">Est. Commission</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow
                      key={row.gameProduct}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/games/${row.gameProduct}/outstanding`)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {GAME_LABELS[row.gameProduct as keyof typeof GAME_LABELS] ??
                              row.gameProduct}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {row.gameProduct}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{row.activeDrawCount}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.totalEntryCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.totalPlayerCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.totalTenantCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatVND(row.totalOutstandingStake)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatVND(row.totalEstimatedCommission)}
                      </TableCell>
                      <TableCell>
                        <ExternalLink className="size-3.5 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Summary Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-sm font-medium">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">TỔNG CỘNG</span>
                  <Badge variant="secondary">{data.length} game</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-4 tabular-nums text-xs">
                  <span>
                    Draws: <strong>{formatNumber(totalActiveDraws)}</strong>
                  </span>
                  <span>
                    Stake:{" "}
                    <strong title={formatVND(totalStake)}>{formatVNDCompact(totalStake)}</strong>
                  </span>
                  <span>
                    Est. HH:{" "}
                    <strong title={formatVND(totalEstCommission)}>
                      {formatVNDCompact(totalEstCommission)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SystemOutstandingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <SystemOutstandingContent />
    </Suspense>
  );
}

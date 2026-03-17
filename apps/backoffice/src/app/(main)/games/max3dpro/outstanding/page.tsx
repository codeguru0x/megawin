"use client";

import { Suspense } from "react";
import {
  Clock,
  RefreshCw,
  CalendarClock,
  Ticket,
  Rows3,
  Banknote,
  HandCoins,
  X,
} from "lucide-react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatVNDCompact } from "@megawin/shared/utils/number";
import { GAME_COLORS } from "@/lib/game-colors";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import type { OutstandingDrawReport } from "@megawin/game-max3dpro/entities";
import { useMax3DProOutstanding } from "../financial-reports/_lib/use-report-queries";

const c = GAME_COLORS[GameProduct.Max3dpro];

// Nhãn riêng cho Max 3D Pro: lineCount = số cặp (TripletPair)
const LABEL_PAIRS = "Cặp số";

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, iconBg, iconColor, label, value, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
        <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

interface KpiStripProps {
  data: OutstandingDrawReport[];
}

function KpiStrip({ data }: KpiStripProps) {
  const totalEntries = data.reduce((s, r) => s + r.entryCount, 0);
  const totalPairs = data.reduce((s, r) => s + r.lineCount, 0);
  const totalStake = data.reduce((s, r) => s + r.totalStake, 0);
  const totalCommission = data.reduce((s, r) => s + r.estimatedCommission, 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard
        icon={CalendarClock}
        iconBg="bg-indigo-100 dark:bg-indigo-900/50"
        iconColor="text-indigo-600 dark:text-indigo-400"
        label="Kỳ đang hoạt động"
        value={String(data.length)}
        sub="kỳ quay chưa settle (T3, T5, T7)"
      />
      <KpiCard
        icon={Ticket}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label={REPORT_COLUMN_LABELS.entryCount}
        value={formatNumber(totalEntries)}
        sub="entries đang chờ"
      />
      <KpiCard
        icon={Rows3}
        iconBg="bg-violet-100 dark:bg-violet-900/50"
        iconColor="text-violet-600 dark:text-violet-400"
        label={LABEL_PAIRS}
        value={formatNumber(totalPairs)}
        sub="cặp số chờ settle"
      />
      <KpiCard
        icon={HandCoins}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label={REPORT_COLUMN_LABELS.estimatedCommission}
        value={formatVNDCompact(totalCommission)}
        sub="ước tính hoa hồng"
      />
      <KpiCard
        icon={Banknote}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label={REPORT_COLUMN_LABELS.totalStake}
        value={formatVNDCompact(totalStake)}
        sub="tiền cược chưa settle"
      />
    </div>
  );
}

// ─── Outstanding Table ────────────────────────────────────────────────────────

function OutstandingTable() {
  const { data, isLoading, error, dataUpdatedAt, isFetching, refetch } = useMax3DProOutstanding();
  const [filterDrawId, setFilterDrawId] = useQueryState("draw", { defaultValue: "" });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* PageHeader skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-3.5 w-64" />
            </div>
          </div>
          <Skeleton className="h-8 w-40" />
        </div>

        {/* KPI skeleton */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
          ))}
        </div>

        {/* Table card skeleton */}
        <Card className="gap-0 py-0">
          <CardHeader className="px-5 pb-2 pt-4">
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0">
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
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">Lỗi tải dữ liệu. Vui lòng thử lại.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 size-4" />
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  const allRows = data ?? [];

  // Client-side filter theo drawId từ URL
  const filteredRows = filterDrawId ? allRows.filter((r) => r.drawId === filterDrawId) : allRows;

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("vi-VN") : null;

  // Tổng cho footer row — bỏ tổng player/tenant, giữ lại 4 cột cuối
  const totalEntries = filteredRows.reduce((s, r) => s + r.entryCount, 0);
  const totalPairs = filteredRows.reduce((s, r) => s + r.lineCount, 0);
  const totalStake = filteredRows.reduce((s, r) => s + r.totalStake, 0);
  const totalCommission = filteredRows.reduce((s, r) => s + r.estimatedCommission, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* PageHeader */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${c.iconGradient} shadow-sm`}
          >
            <Clock className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Max 3D Pro — Outstanding
            </h1>
            <p className="text-xs text-muted-foreground">
              Entries chưa settle · Tự động refresh mỗi 60s
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {filterDrawId && (
            <Badge variant="secondary" className="gap-1 pr-1.5 font-mono text-xs">
              Kỳ: {filterDrawId}
              <button
                className="ml-0.5 rounded-sm opacity-70 hover:opacity-100"
                onClick={() => setFilterDrawId(null)}
                aria-label="Xoá bộ lọc kỳ quay"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {updatedAt && (
            <span className="text-xs tabular-nums text-muted-foreground">
              Cập nhật lúc {updatedAt}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Làm mới dữ liệu"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* KPI Strip — tính trên filteredRows */}
      <KpiStrip data={filteredRows} />

      {/* Table Card */}
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Kỳ quay đang hoạt động</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-4 pt-0">
          {filteredRows.length === 0 ? (
            <div className="flex h-[200px] flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                {filterDrawId
                  ? `Không tìm thấy kỳ quay "${filterDrawId}" trong outstanding.`
                  : "Không có kỳ quay outstanding hiện tại."}
              </p>
              {filterDrawId && (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => setFilterDrawId(null)}
                >
                  Xem tất cả outstanding
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">{REPORT_COLUMN_LABELS.financialDate}</TableHead>
                    <TableHead>{REPORT_COLUMN_LABELS.drawId}</TableHead>
                    <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                    <TableHead className="text-right">{REPORT_COLUMN_LABELS.tenantCount}</TableHead>
                    <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                    <TableHead className="text-right">{LABEL_PAIRS}</TableHead>
                    <TableHead className="text-right">
                      {REPORT_COLUMN_LABELS.estimatedCommission}
                    </TableHead>
                    <TableHead className="pr-5 text-right">
                      {REPORT_COLUMN_LABELS.totalStake}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.drawId}>
                      <TableCell className="pl-5 tabular-nums">{row.financialDate}</TableCell>
                      <TableCell>
                        <Link
                          href={`/games/max3dpro/operations?draw=${row.drawId}`}
                          className="font-mono underline-offset-4 hover:underline"
                        >
                          {row.drawId}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.playerCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.tenantCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.entryCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.lineCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(row.estimatedCommission)}
                      </TableCell>
                      <TableCell className="pr-5 text-right tabular-nums font-medium">
                        {formatNumber(row.totalStake)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>

                {/* Summary Footer Row — bỏ tổng player/tenant, tổng 4 cột cuối */}
                {filteredRows.length > 1 && (
                  <tfoot>
                    <TableRow className="border-t bg-muted/50 font-medium">
                      <TableCell className="pl-5 font-semibold" colSpan={4}>
                        {REPORT_COLUMN_LABELS.summary}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(totalEntries)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(totalPairs)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(totalCommission)}
                      </TableCell>
                      <TableCell className="pr-5 text-right tabular-nums font-semibold">
                        {formatNumber(totalStake)}
                      </TableCell>
                    </TableRow>
                  </tfoot>
                )}
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Max3DProOutstandingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-3.5 w-64" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      }
    >
      <OutstandingTable />
    </Suspense>
  );
}

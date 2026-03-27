"use client";

import { Suspense } from "react";
import { Clock, RefreshCw, CalendarClock, Ticket, HandCoins, Banknote } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { formatNumber, formatVNDCompact, displayVNTimeWithSeconds } from "@megawin/shared/utils";
import type { SystemOutstandingGameDaily } from "@megawin/game-core/entities";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { GAME_LABELS, REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { SYSTEM_ICON_GRADIENT, getGameHex } from "@/lib/game-colors";
import { useSystemOutstanding } from "../financial/_lib/use-report-queries";

// Nhãn cột đặc thù trang hệ thống
const COL_LABELS = {
  game: "Game",
  activeDraws: "Kỳ hoạt động",
  playerCount: REPORT_COLUMN_LABELS.playerCount,
  tenantCount: REPORT_COLUMN_LABELS.tenantCount,
  entryCount: REPORT_COLUMN_LABELS.entryCount,
  estimatedCommission: REPORT_COLUMN_LABELS.estimatedCommission,
  totalStake: REPORT_COLUMN_LABELS.totalStake,
  summary: REPORT_COLUMN_LABELS.summary,
} as const;

// Map từ GameProduct slug sang path segment cho outstanding URL
const GAME_OUTSTANDING_PATH: Partial<Record<GameProduct, string>> = {
  [GameProduct.Keno]: "keno",
  [GameProduct.Lotto535]: "lotto535",
  [GameProduct.Mega645]: "mega645",
  [GameProduct.Power655]: "power655",
  [GameProduct.Max3d]: "max3d",
  [GameProduct.Max3dpro]: "max3dpro",
  [GameProduct.Bingo18]: "bingo18",
};

// ─── KPI Card (pattern nhất quán với Dashboard hero-kpis + Operations kpi-strip) ─

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  isLoading: boolean;
}

function KpiCard({ icon: Icon, iconBg, iconColor, label, value, sub, isLoading }: KpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        {isLoading ? (
          <Skeleton className="my-0.5 h-6 w-24" />
        ) : (
          <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
        )}
        <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

interface KpiStripProps {
  data: SystemOutstandingGameDaily[];
  isLoading: boolean;
}

function KpiStrip({ data, isLoading }: KpiStripProps) {
  const totalActiveDraws = data.reduce((s, r) => s + r.activeDrawCount, 0);
  const totalEntries = data.reduce((s, r) => s + r.totalEntryCount, 0);
  const totalCommission = data.reduce((s, r) => s + r.totalEstimatedCommission, 0);
  const totalStake = data.reduce((s, r) => s + r.totalOutstandingStake, 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        icon={CalendarClock}
        iconBg="bg-indigo-100 dark:bg-indigo-900/50"
        iconColor="text-indigo-600 dark:text-indigo-400"
        label="Kỳ đang hoạt động"
        value={formatNumber(totalActiveDraws)}
        sub="kỳ quay chưa settle"
        isLoading={isLoading}
      />
      <KpiCard
        icon={Ticket}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label={COL_LABELS.entryCount}
        value={formatNumber(totalEntries)}
        sub="entries đang chờ"
        isLoading={isLoading}
      />
      <KpiCard
        icon={HandCoins}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label={COL_LABELS.estimatedCommission}
        value={formatVNDCompact(totalCommission)}
        sub="ước tính hoa hồng"
        isLoading={isLoading}
      />
      <KpiCard
        icon={Banknote}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label={COL_LABELS.totalStake}
        value={formatVNDCompact(totalStake)}
        sub="tiền cược chưa settle"
        isLoading={isLoading}
      />
    </div>
  );
}

// ─── Content ──────────────────────────────────────────────────────────────────

function SystemOutstandingContent() {
  const router = useRouter();
  const { data, isLoading, error, dataUpdatedAt, refetch, isFetching } = useSystemOutstanding();

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const rows = data ?? [];

  // Tổng cho footer row
  const totalActiveDraws = rows.reduce((s, r) => s + r.activeDrawCount, 0);
  const totalEntries = rows.reduce((s, r) => s + r.totalEntryCount, 0);
  const totalCommission = rows.reduce((s, r) => s + r.totalEstimatedCommission, 0);
  const totalStake = rows.reduce((s, r) => s + r.totalOutstandingStake, 0);

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
          >
            <Clock className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Outstanding — Số liệu đang chờ
            </h1>
            <p className="text-xs text-muted-foreground">
              Entries chưa settle toàn hệ thống · Tự động refresh mỗi 60s
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-xs tabular-nums text-muted-foreground">
              Cập nhật lúc {displayVNTimeWithSeconds(updatedAt)}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Làm mới dữ liệu"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <KpiStrip data={rows} isLoading={isLoading} />

      {/* Outstanding Table */}
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Đơn chờ theo game</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-4 pt-0">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">Lỗi tải dữ liệu. Vui lòng thử lại.</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                <RefreshCw className="mr-2 size-4" />
                Thử lại
              </Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-2 px-5 py-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-[200px] flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                Không có draw active nào trên hệ thống.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">{COL_LABELS.game}</TableHead>
                    <TableHead className="text-right">{COL_LABELS.activeDraws}</TableHead>
                    <TableHead className="text-right">{COL_LABELS.playerCount}</TableHead>
                    <TableHead className="text-right">{COL_LABELS.tenantCount}</TableHead>
                    <TableHead className="text-right">{COL_LABELS.entryCount}</TableHead>
                    <TableHead className="text-right">{COL_LABELS.estimatedCommission}</TableHead>
                    <TableHead className="pr-5 text-right">{COL_LABELS.totalStake}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const slug = GAME_OUTSTANDING_PATH[row.gameProduct as GameProduct];
                    const gameName =
                      GAME_LABELS[row.gameProduct as keyof typeof GAME_LABELS] ?? row.gameProduct;
                    const gameHex = getGameHex(row.gameProduct);

                    return (
                      <TableRow
                        key={row.gameProduct}
                        className={cn(slug && "cursor-pointer hover:bg-muted/50")}
                        onClick={() => slug && router.push(`/games/${slug}/outstanding`)}
                      >
                        <TableCell className="pl-5 font-medium">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: gameHex }}
                            />
                            {gameName}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.activeDrawCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.totalPlayerCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.totalTenantCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.totalEntryCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatNumber(row.totalEstimatedCommission)}
                        </TableCell>
                        <TableCell className="pr-5 text-right tabular-nums font-medium">
                          {formatNumber(row.totalOutstandingStake)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>

                {/* Summary Footer Row — bỏ tổng player/tenant cross-game, giữ 3 cột cuối */}
                {rows.length > 1 && (
                  <tfoot>
                    <TableRow className="border-t bg-muted/50 font-medium">
                      <TableCell className="pl-5 font-semibold" colSpan={4}>
                        {COL_LABELS.summary}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(totalEntries)}
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

export default function SystemOutstandingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          {/* PageHeader skeleton */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-3.5 w-72" />
              </div>
            </div>
            <Skeleton className="h-8 w-36" />
          </div>

          {/* KPI skeleton */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>

          {/* Table card skeleton */}
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      }
    >
      <SystemOutstandingContent />
    </Suspense>
  );
}

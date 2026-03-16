"use client";

import { ChevronRight, ChevronLeft, CalendarRange, Building2, Users } from "lucide-react";
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
  formatVND,
  formatVNDCompact,
  formatPercent,
  formatNumber,
} from "@megawin/shared/utils/number";
import { useBingo18ReportFilters } from "../use-report-filters";
import { EntryList } from "../sections/entry-list";
import {
  useBingo18DrawSummary,
  useBingo18DrawList,
  useBingo18DrawTenants,
  useBingo18Players,
} from "../use-report-queries";
import type { DrawSummaryResult } from "@megawin/game-bingo18-application/repos";

const LIMIT = 20;

function KpiStrip({ data }: { data: DrawSummaryResult }) {
  const payoutPct = data.totalStake > 0 ? data.totalPayout / data.totalStake : 0;
  const marginPct = data.totalStake > 0 ? data.ggr / data.totalStake : 0;
  const cards = [
    { label: "Kỳ Quay", value: formatNumber(data.drawCount), sub: "kỳ đã settle" },
    {
      label: "Doanh Thu",
      value: formatVNDCompact(data.totalStake),
      sub: formatVND(data.totalStake),
      highlight: "blue" as const,
    },
    {
      label: "Trả Thưởng",
      value: formatVNDCompact(data.totalPayout),
      sub: `Payout ${formatPercent(payoutPct)}`,
      highlight: payoutPct > 0.95 ? ("red" as const) : undefined,
    },
    {
      label: "GGR",
      value: formatVNDCompact(data.ggr),
      sub: `Margin ${formatPercent(marginPct)}`,
      highlight: "green" as const,
    },
    {
      label: "Lợi Nhuận Ròng",
      value: formatVNDCompact(data.netProfit),
      sub: formatVND(data.netProfit),
      highlight: data.netProfit >= 0 ? ("green" as const) : ("red" as const),
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p
            className={`mt-1 text-xl font-bold tabular-nums ${c.highlight === "blue" ? "text-blue-600 dark:text-blue-400" : c.highlight === "green" ? "text-success" : c.highlight === "red" ? "text-destructive" : ""}`}
          >
            {c.value}
          </p>
          <p className="truncate text-xs text-muted-foreground">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

function DrawList() {
  const { from, to, page, setPage, navigateToDraw } = useBingo18ReportFilters();
  const { data: summary } = useBingo18DrawSummary(from, to);
  const { data, isLoading, error } = useBingo18DrawList(from, to, page);
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;
  if (isLoading)
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Card className="gap-0 py-0">
          <CardContent className="p-0">
            <div className="space-y-0">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="border-b px-5 py-3">
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  if (error)
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <CalendarRange className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">Lỗi tải dữ liệu</h3>
          <p className="mt-1 text-xs text-muted-foreground">Vui lòng tải lại trang và thử lại.</p>
        </CardContent>
      </Card>
    );
  if (!data?.data.length)
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <CalendarRange className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">Không có dữ liệu</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Không tìm thấy kỳ quay nào trong khoảng thời gian đã chọn. Thử mở rộng khoảng ngày.
          </p>
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-4">
      {summary && <KpiStrip data={summary} />}
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarRange className="size-4 text-muted-foreground" />
              <div>
                <CardTitle className="text-sm font-semibold">Danh sách kỳ quay</CardTitle>
                <CardDescription className="text-xs">
                  {data?.total ?? 0} kỳ · ~160 kỳ/ngày · Trang {page}/{totalPages}
                </CardDescription>
              </div>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={page === 1}
                  onClick={() => void setPage(page - 1)}
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
                  onClick={() => void setPage(page + 1)}
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
                  <TableHead>Kỳ quay</TableHead>
                  <TableHead>Ngày TC</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Players</TableHead>
                  <TableHead className="text-right">Tenants</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Trả thưởng</TableHead>
                  <TableHead className="text-right">GGR</TableHead>
                  <TableHead className="text-right">Hoa hồng</TableHead>
                  <TableHead className="text-right">Payout %</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((row) => {
                  const payoutPct = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                  return (
                    <TableRow
                      key={row.drawId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigateToDraw(row.drawId)}
                    >
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
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatVND(row.totalStake)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${payoutPct > 0.95 ? "text-destructive" : ""}`}
                      >
                        {formatVND(row.totalPayout)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVND(row.ggr)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatVND(row.totalCommission)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={payoutPct > 0.95 ? "destructive" : "secondary"}>
                          {formatPercent(payoutPct)}
                        </Badge>
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
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Trang {page}/{totalPages} · {data?.total ?? 0} kỳ quay
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => void setPage(page - 1)}
                >
                  <ChevronLeft className="mr-1 size-3" />
                  Trước
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => void setPage(page + 1)}
                >
                  Sau
                  <ChevronRight className="ml-1 size-3" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DrawTenants({ drawId }: { drawId: string }) {
  const { tenantId, navigateToPlayer } = useBingo18ReportFilters();
  const { data, isLoading } = useBingo18DrawTenants(drawId);
  const { data: players, isLoading: playersLoading } = useBingo18Players(drawId, tenantId ?? null);
  if (isLoading)
    return (
      <Card className="gap-0 py-0">
        <CardContent className="p-0">
          <div className="space-y-0">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="border-b px-5 py-3">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  if (!tenantId) {
    if (!data?.length)
      return (
        <Card className="gap-0 py-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Building2 className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">Không có dữ liệu</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Không có đại lý nào tham gia kỳ quay này.
            </p>
          </CardContent>
        </Card>
      );
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Đại lý — {drawId}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Đại lý</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Players</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Trả thưởng</TableHead>
                  <TableHead className="text-right">GGR</TableHead>
                  <TableHead className="text-right">Hoa hồng</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((row) => (
                  <TableRow
                    key={row.tenantId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToPlayer(row.tenantId)}
                  >
                    <TableCell className="font-medium">{row.tenantId}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.playerCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatVND(row.totalStake)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatVND(row.totalPayout)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatVND(row.ggr)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatVND(row.totalCommission)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (playersLoading)
    return (
      <Card className="gap-0 py-0">
        <CardContent className="p-0">
          <div className="space-y-0">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="border-b px-5 py-3">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">
            Players — {tenantId} · {drawId}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Cược</TableHead>
                <TableHead className="text-right">Thắng</TableHead>
                <TableHead className="text-right">Trả</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {players?.map((row) => (
                <TableRow
                  key={row.accountId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigateToPlayer(row.accountId)}
                >
                  <TableCell className="font-mono text-xs">{row.accountId}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.entryCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVND(row.totalStake)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVND(row.totalWin)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVND(row.totalPayout)}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Breadcrumb() {
  const { level, drawId, tenantId, accountId, navigateToList, setLevel } =
    useBingo18ReportFilters();
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto px-2 py-1 text-xs"
        onClick={navigateToList}
      >
        Kỳ quay
      </Button>
      {drawId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => void setLevel("draw-tenants")}
          >
            {drawId}
          </Button>
        </>
      )}
      {tenantId && level !== "list" && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">{tenantId}</span>
        </>
      )}
      {accountId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">{accountId}</span>
        </>
      )}
    </div>
  );
}

export function ByDrawTab() {
  const { level, drawId, tenantId, accountId } = useBingo18ReportFilters();
  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}
      {level === "list" && <DrawList />}
      {(level === "draw-tenants" || level === "players") && drawId && (
        <DrawTenants drawId={drawId} />
      )}
      {level === "entries" && drawId && tenantId && accountId && (
        <EntryList drawId={drawId} tenantId={tenantId} accountId={accountId} />
      )}
    </div>
  );
}

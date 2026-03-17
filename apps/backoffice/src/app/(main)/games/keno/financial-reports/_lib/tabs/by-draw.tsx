"use client";

import { Building2, CalendarRange, ChevronLeft, ChevronRight, Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatVNDCompact, formatNumber } from "@megawin/shared/utils/number";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { parseUsername } from "@megawin/identity-application/shared";
import { useKenoReportFilters } from "../use-report-filters";
import { EntryList } from "../sections/entry-list";
import {
  useKenoDrawSummary,
  useKenoDrawList,
  useKenoDrawTenants,
  useKenoPlayers,
} from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "../sections/shared-states";
import type { DrawSummaryResult } from "@megawin/game-keno-application/repos";

const LIMIT = 20;

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiStrip({ data }: { data: DrawSummaryResult }) {
  const payoutPct = data.totalStake > 0 ? data.totalPayout / data.totalStake : 0;
  const cards = [
    {
      label: REPORT_COLUMN_LABELS.drawId,
      value: formatNumber(data.drawCount),
      sub: "kỳ đã settle",
    },
    {
      label: "Doanh thu",
      value: formatVNDCompact(data.totalStake),
      sub: formatNumber(data.totalStake) + " ₫",
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      label: REPORT_COLUMN_LABELS.totalPayout,
      value: formatVNDCompact(data.totalPayout),
      sub: `${REPORT_COLUMN_LABELS.payoutPercent}: ${(payoutPct * 100).toFixed(1)}%`,
      className: payoutPct > 0.95 ? "text-loss" : undefined,
    },
    {
      label: REPORT_COLUMN_LABELS.ggr,
      value: formatVNDCompact(data.ggr),
      sub: formatNumber(data.ggr) + " ₫",
      className: data.ggr < 0 ? "text-loss" : undefined,
    },
    {
      label: REPORT_COLUMN_LABELS.netProfit,
      value: formatVNDCompact(data.netProfit),
      sub: formatNumber(data.netProfit) + " ₫",
      className: data.netProfit < 0 ? "text-loss" : undefined,
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${c.className ?? ""}`}>{c.value}</p>
          <p className="truncate text-xs text-muted-foreground">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Draw List ────────────────────────────────────────────────────────────────

function DrawList() {
  const { from, to, page, setPage, navigateToDraw } = useKenoReportFilters();
  const { data: summary } = useKenoDrawSummary(from, to);
  const { data, isLoading, error } = useKenoDrawList(from, to, page);
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  if (isLoading)
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 w-full animate-pulse rounded-lg border bg-muted" />
          ))}
        </div>
        <TableSkeleton />
      </div>
    );
  if (error) return <ErrorCard />;
  if (!data?.data.length)
    return (
      <EmptyCard
        icon="calendar"
        message="Không có dữ liệu"
        description="Không tìm thấy kỳ quay nào trong khoảng thời gian đã chọn. Thử mở rộng khoảng ngày."
      />
    );

  const totals = {
    entryCount: data.data.reduce((s, r) => s + r.entryCount, 0),
    playerCount: data.data.reduce((s, r) => s + r.playerCount, 0),
    totalStake: data.data.reduce((s, r) => s + r.totalStake, 0),
    totalPayout: data.data.reduce((s, r) => s + r.totalPayout, 0),
    ggr: data.data.reduce((s, r) => s + r.ggr, 0),
    totalCommission: data.data.reduce((s, r) => s + r.totalCommission, 0),
    companyTake: data.data.reduce((s, r) => s + r.companyTake, 0),
  };

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
                  {data?.total ?? 0} kỳ · ~120 kỳ/ngày · Trang {page}/{totalPages}
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
                  <TableHead>{REPORT_COLUMN_LABELS.financialDate}</TableHead>
                  <TableHead>{REPORT_COLUMN_LABELS.drawId}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                  <TableHead className="text-right">
                    {REPORT_COLUMN_LABELS.totalCommission}
                  </TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.companyTake}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.payoutPercent}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((row) => {
                  const payoutPct = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                  const netProfit = row.companyTake;
                  return (
                    <TableRow
                      key={row.drawId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigateToDraw(row.drawId)}
                    >
                      <TableCell className="text-sm">{row.financialDate}</TableCell>
                      <TableCell className="font-mono text-xs">{row.drawId}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.playerCount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.entryCount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums font-medium">
                        {formatNumber(row.totalStake)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.totalPayout)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.ggr)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.totalCommission)}
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm tabular-nums ${netProfit < 0 ? "text-loss" : ""}`}
                      >
                        {formatNumber(netProfit)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {(payoutPct * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="text-xs font-semibold">
                    {REPORT_COLUMN_LABELS.summary}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.playerCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.entryCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.totalStake)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.totalPayout)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.ggr)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.totalCommission)}
                  </TableCell>
                  <TableCell
                    className={`text-right text-sm tabular-nums font-semibold ${totals.companyTake < 0 ? "text-loss" : ""}`}
                  >
                    {formatNumber(totals.companyTake)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
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

// ─── Draw Tenant Breakdown ────────────────────────────────────────────────────

function DrawTenantBreakdown({ drawId }: { drawId: string }) {
  const { navigateToPlayer } = useKenoReportFilters();
  const { data, isLoading } = useKenoDrawTenants(drawId);

  if (isLoading) return <TableSkeleton rows={6} />;
  if (!data?.length)
    return (
      <EmptyCard
        icon="building"
        message="Không có dữ liệu"
        description="Không có đại lý nào tham gia kỳ quay này."
      />
    );

  const totals = {
    entryCount: data.reduce((s, r) => s + r.entryCount, 0),
    playerCount: data.reduce((s, r) => s + r.playerCount, 0),
    totalStake: data.reduce((s, r) => s + r.totalStake, 0),
    totalPayout: data.reduce((s, r) => s + r.totalPayout, 0),
    ggr: data.reduce((s, r) => s + r.ggr, 0),
    totalCommission: data.reduce((s, r) => s + r.totalCommission, 0),
  };

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Đại lý — {drawId}</CardTitle>
        </div>
        <CardDescription className="text-xs">{data?.length ?? 0} đại lý</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Đại lý</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalCommission}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((row) => (
                <TableRow
                  key={row.tenantId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigateToPlayer(row.tenantId)}
                >
                  <TableCell className="text-sm font-medium">{row.tenantId}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(row.playerCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(row.entryCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(row.totalStake)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(row.totalPayout)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(row.ggr)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(row.totalCommission)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="text-xs font-semibold">
                  {REPORT_COLUMN_LABELS.summary}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.playerCount)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.entryCount)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.totalStake)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.totalPayout)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.ggr)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.totalCommission)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Player Breakdown ─────────────────────────────────────────────────────────

function PlayerBreakdown({ drawId, tenantId }: { drawId: string; tenantId: string }) {
  const { navigateToEntries } = useKenoReportFilters();
  const { data: players, isLoading } = useKenoPlayers(drawId, tenantId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (!players?.length)
    return (
      <EmptyCard icon="ticket" message="Không có dữ liệu" description="Không có player nào." />
    );

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">
            Người chơi — {tenantId} · {drawId}
          </CardTitle>
        </div>
        <CardDescription className="text-xs">{players?.length ?? 0} người chơi</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tài khoản</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">Tiền thắng</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">Lãi / Lỗ (KH)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players?.map((row) => {
                const playerNet = (row.totalPayout ?? 0) - (row.totalStake ?? 0);
                const displayName = parseUsername(row.accountId) || row.accountId;
                return (
                  <TableRow
                    key={row.accountId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToEntries(row.accountId, displayName)}
                  >
                    <TableCell className="text-sm font-medium">{displayName}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalStake ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalWin ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalPayout ?? 0)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm tabular-nums font-medium ${
                        playerNet > 0
                          ? "text-profit"
                          : playerNet < 0
                            ? "text-loss"
                            : "text-muted-foreground"
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

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb() {
  const { level, drawId, tenantId, accountId, playerName, navigateToList, setLevel } =
    useKenoReportFilters();
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
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => void setLevel("players")}
          >
            {tenantId}
          </Button>
        </>
      )}
      {accountId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
            {playerName || parseUsername(accountId) || accountId}
          </span>
        </>
      )}
    </div>
  );
}

// ─── ByDrawTab ────────────────────────────────────────────────────────────────

export function ByDrawTab() {
  const { level, drawId, tenantId, accountId, playerName } = useKenoReportFilters();
  const playerDisplayName = playerName ?? undefined;
  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}
      {level === "list" && <DrawList />}
      {level === "draw-tenants" && drawId && !tenantId && <DrawTenantBreakdown drawId={drawId} />}
      {/* Khi tenantId được set từ draw-tenants → hiển thị player list */}
      {level === "draw-tenants" && drawId && tenantId && (
        <PlayerBreakdown drawId={drawId} tenantId={tenantId} />
      )}
      {level === "players" && drawId && tenantId && (
        <PlayerBreakdown drawId={drawId} tenantId={tenantId} />
      )}
      {level === "entries" && drawId && tenantId && accountId && (
        <EntryList
          drawId={drawId}
          tenantId={tenantId}
          accountId={accountId}
          playerDisplayName={playerDisplayName}
        />
      )}
    </div>
  );
}

"use client";

import { Building2, CalendarRange, ChevronRight, Users } from "lucide-react";
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
import { formatVNDCompact, formatNumber } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { toTenantUsername } from "@megawin/shared/utils";
import { useMax3DReportFilters } from "../use-report-filters";
import { EntryList } from "../sections/entry-list";
import {
  useMax3DDrawSummary,
  useMax3DDrawList,
  useMax3DDrawTenants,
  useMax3DPlayers,
} from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "../sections/shared-states";

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiStrip({ from, to }: { from: string; to: string }) {
  const { data } = useMax3DDrawSummary(from, to);
  if (!data) return null;

  const payoutPct = data.totalStake > 0 ? data.totalPayout / data.totalStake : 0;
  const cards = [
    {
      label: REPORT_COLUMN_LABELS.drawId,
      value: formatNumber(data.drawCount),
      sub: `${formatNumber(data.entryCount)} entries · ${formatNumber(data.lineCount)} lines`,
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
      sub: `HH: ${formatVNDCompact(data.totalCommission)}`,
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
  const { from, to, navigateToDraw } = useMax3DReportFilters();
  const { data, isLoading, error } = useMax3DDrawList(from, to, 1);

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
        description="Không có kỳ quay nào trong khoảng thời gian đã chọn."
      />
    );

  const rows = data.data;
  const totals = {
    entryCount: rows.reduce((s, r) => s + r.entryCount, 0),
    lineCount: rows.reduce((s, r) => s + (r.lineCount ?? 0), 0),
    playerCount: rows.reduce((s, r) => s + r.playerCount, 0),
    totalStake: rows.reduce((s, r) => s + r.totalStake, 0),
    totalPayout: rows.reduce((s, r) => s + r.totalPayout, 0),
    ggr: rows.reduce((s, r) => s + r.ggr, 0),
    totalCommission: rows.reduce((s, r) => s + r.totalCommission, 0),
    netProfit: rows.reduce((s, r) => s + r.netProfit, 0),
  };

  return (
    <div className="space-y-4">
      <KpiStrip from={from} to={to} />
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <CalendarRange className="size-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-sm font-semibold">Danh sách kỳ quay</CardTitle>
              <CardDescription className="text-xs">{data.total} kỳ quay</CardDescription>
            </div>
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
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                  <TableHead className="text-right">
                    {REPORT_COLUMN_LABELS.totalCommission}
                  </TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.netProfit}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.payoutPercent}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const payoutPct = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
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
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(row.lineCount ?? 0)}
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
                        className={`text-right text-sm tabular-nums font-medium ${row.netProfit < 0 ? "text-loss" : ""}`}
                      >
                        {formatNumber(row.netProfit)}
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
                    {formatNumber(totals.lineCount)}
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
                    className={`text-right text-sm tabular-nums font-semibold ${totals.netProfit < 0 ? "text-loss" : ""}`}
                  >
                    {formatNumber(totals.netProfit)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Draw Tenant Breakdown ────────────────────────────────────────────────────

function DrawTenantBreakdown({ drawId }: { drawId: string }) {
  const { navigateToTenantInDraw } = useMax3DReportFilters();
  const { data, isLoading, error } = useMax3DDrawTenants(drawId);

  if (isLoading) return <TableSkeleton rows={6} />;
  if (error) return <ErrorCard />;
  if (!data?.length)
    return <EmptyCard icon="building" message="Không có dữ liệu tenant cho kỳ quay này." />;

  const totals = {
    entryCount: data.reduce((s, r) => s + r.entryCount, 0),
    lineCount: data.reduce((s, r) => s + (r.lineCount ?? 0), 0),
    playerCount: data.reduce((s, r) => s + r.playerCount, 0),
    totalStake: data.reduce((s, r) => s + r.totalStake, 0),
    totalPayout: data.reduce((s, r) => s + r.totalPayout, 0),
    ggr: data.reduce((s, r) => s + r.ggr, 0),
    totalCommission: data.reduce((s, r) => s + r.totalCommission, 0),
  };
  const totalNet = totals.totalStake - totals.totalPayout - totals.totalCommission;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">
            Breakdown theo đại lý — Kỳ {drawId}
          </CardTitle>
        </div>
        <CardDescription className="text-xs">{data.length} đại lý</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Đại lý</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalCommission}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.netProfit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const net = row.totalStake - row.totalPayout - row.totalCommission;
                return (
                  <TableRow
                    key={row.tenantId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToTenantInDraw(row.tenantId)}
                  >
                    <TableCell className="text-sm font-medium">{row.tenantId}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.playerCount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.lineCount ?? 0)}
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
                    <TableCell
                      className={`text-right text-sm tabular-nums font-medium ${net < 0 ? "text-loss" : ""}`}
                    >
                      {formatNumber(net)}
                    </TableCell>
                  </TableRow>
                );
              })}
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
                  {formatNumber(totals.lineCount)}
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
                  className={`text-right text-sm tabular-nums font-semibold ${totalNet < 0 ? "text-loss" : ""}`}
                >
                  {formatNumber(totalNet)}
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
  const { navigateToPlayer } = useMax3DReportFilters();
  const { data, isLoading, error } = useMax3DPlayers(drawId, tenantId);

  if (isLoading) return <TableSkeleton rows={8} />;
  if (error) return <ErrorCard />;
  if (!data?.length) return <EmptyCard icon="ticket" message="Không có player nào." />;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">
            Người chơi — Kỳ {drawId} / {tenantId}
          </CardTitle>
        </div>
        <CardDescription className="text-xs">{data.length} người chơi</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tài khoản</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">Tiền thắng</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">Lãi / Lỗ (KH)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const net = row.totalPayout - row.totalStake;
                const displayName =
                  toTenantUsername(row.accountId) ?? row.username ?? row.accountId;
                return (
                  <TableRow
                    key={row.accountId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToPlayer(row.accountId, displayName)}
                  >
                    <TableCell className="text-sm font-medium">{displayName}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.lineCount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalStake)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalWin)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(row.totalPayout)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm tabular-nums font-medium ${
                        net > 0 ? "text-profit" : net < 0 ? "text-loss" : "text-muted-foreground"
                      }`}
                    >
                      {net > 0 ? "+" : ""}
                      {formatNumber(net)}
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
  const {
    level,
    drawId,
    tenantId,
    playerId,
    playerName,
    navigateToList,
    navigateToDraw,
    navigateToTenantInDraw,
  } = useMax3DReportFilters();
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
            variant={level === "draw-tenants" ? "secondary" : "ghost"}
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => navigateToDraw(drawId)}
          >
            {drawId}
          </Button>
        </>
      )}
      {tenantId && drawId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <Button
            variant={level === "players" ? "secondary" : "ghost"}
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => navigateToTenantInDraw(tenantId)}
          >
            {tenantId}
          </Button>
        </>
      )}
      {playerId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
            {playerName || (toTenantUsername(playerId) ?? playerId ?? "")}
          </span>
        </>
      )}
    </div>
  );
}

// ─── ByDrawTab ────────────────────────────────────────────────────────────────

export function ByDrawTab() {
  const { from, to, level, drawId, tenantId, playerId, playerName } = useMax3DReportFilters();
  const playerDisplayName = playerName ?? undefined;
  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}
      {level === "list" && <DrawList />}
      {level === "draw-tenants" && drawId && <DrawTenantBreakdown drawId={drawId} />}
      {level === "players" && drawId && tenantId && (
        <PlayerBreakdown drawId={drawId} tenantId={tenantId} />
      )}
      {level === "entries" && drawId && tenantId && playerId && (
        <EntryList
          drawId={drawId}
          tenantId={tenantId}
          accountId={playerId}
          playerDisplayName={playerDisplayName}
        />
      )}
    </div>
  );
}

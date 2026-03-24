"use client";

import { ChevronRight, CalendarRange, Building2, Users, Ticket } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatVNDCompact, formatVND, formatPercent, formatNumber } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { usePower655ReportFilters } from "../use-report-filters";
import { EntryList } from "../sections/entry-list";
import {
  usePower655DrawSummary,
  usePower655DrawList,
  usePower655DrawTenants,
  usePower655Players,
} from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "../sections/shared-states";

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiStrip({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = usePower655DrawSummary(from, to);

  if (isLoading)
    return (
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-[76px] rounded-xl border bg-card animate-pulse" />
        ))}
      </div>
    );

  if (!data) return null;

  const payoutPct = data.totalStake > 0 ? data.totalPayout / data.totalStake : 0;

  const cards = [
    {
      label: REPORT_COLUMN_LABELS.drawId,
      value: formatNumber(data.drawCount),
      sub: `${formatNumber(data.entryCount)} lượt cược · ${formatNumber(data.lineCount)} dòng`,
    },
    {
      label: REPORT_COLUMN_LABELS.totalStake,
      value: formatVNDCompact(data.totalStake),
      sub: formatVND(data.totalStake),
    },
    {
      label: REPORT_COLUMN_LABELS.totalPayout,
      value: formatVNDCompact(data.totalPayout),
      sub: formatVND(data.totalPayout),
    },
    {
      label: REPORT_COLUMN_LABELS.ggr,
      value: formatVNDCompact(data.ggr),
      sub: `Margin: ${formatPercent(data.totalStake > 0 ? data.ggr / data.totalStake : 0)}`,
      valueClass: data.ggr < 0 ? "text-loss" : "",
    },
    {
      label: REPORT_COLUMN_LABELS.payoutPercent,
      value: formatPercent(payoutPct),
      sub: `${formatNumber(data.playerCount)} người chơi · ${formatNumber(data.tenantCount)} đại lý`,
      valueClass: payoutPct > 0.95 ? "text-loss" : "",
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-medium text-muted-foreground">{c.label}</p>
          <p className={`text-lg font-bold tabular-nums ${c.valueClass ?? ""}`}>{c.value}</p>
          <p className="truncate text-[11px] text-muted-foreground">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Level 1: Draw List ───────────────────────────────────────────────────────

function DrawList() {
  const { from, to, navigateToDraw } = usePower655ReportFilters();
  const { data, isLoading, error } = usePower655DrawList(from, to, 1);

  if (isLoading) return <TableSkeleton rows={10} />;
  if (error) return <ErrorCard />;
  if (!data?.data.length)
    return <EmptyCard msg="Không có kỳ quay nào trong khoảng thời gian đã chọn." />;

  const rows = data.data;
  const totals = {
    players: rows.reduce((s, r) => s + r.playerCount, 0),
    entries: rows.reduce((s, r) => s + r.entryCount, 0),
    lines: rows.reduce((s, r) => s + r.lineCount, 0),
    stake: rows.reduce((s, r) => s + r.totalStake, 0),
    payout: rows.reduce((s, r) => s + r.totalPayout, 0),
    ggr: rows.reduce((s, r) => s + r.ggr, 0),
    commission: rows.reduce((s, r) => s + r.totalCommission, 0),
    netProfit: rows.reduce((s, r) => s + r.netProfit, 0),
    jackpot: rows.reduce((s, r) => s + (r.jackpotContribution ?? 0), 0),
  };
  const totalPayoutPct = totals.stake > 0 ? totals.payout / totals.stake : 0;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Danh sách kỳ quay</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {data.total} kỳ quay · Click để xem breakdown theo đại lý
        </CardDescription>
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
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">
                  {REPORT_COLUMN_LABELS.jackpotContribution}
                </TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.payoutPercent}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalCommission}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.netProfit}</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const payoutPct = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                const jpContribution = row.jackpotContribution ?? 0;
                return (
                  <TableRow
                    key={row.drawId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToDraw(row.drawId)}
                  >
                    <TableCell>{row.financialDate}</TableCell>
                    <TableCell className="font-medium">{row.drawId}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.playerCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.lineCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatNumber(row.totalStake)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.totalPayout)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(jpContribution)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          payoutPct > 0.95
                            ? "destructive"
                            : payoutPct > 0.8
                              ? "outline"
                              : "secondary"
                        }
                      >
                        {formatPercent(payoutPct)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.ggr)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.totalCommission)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${row.netProfit < 0 ? "text-loss" : ""}`}
                    >
                      {formatNumber(row.netProfit)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/30 font-medium">
                <TableCell colSpan={2}>{REPORT_COLUMN_LABELS.summary}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.players)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.entries)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.lines)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.stake)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.payout)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.jackpot)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={totalPayoutPct > 0.95 ? "destructive" : "secondary"}>
                    {formatPercent(totalPayoutPct)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.ggr)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.commission)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${totals.netProfit < 0 ? "text-loss" : ""}`}
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
  );
}

// ─── Level 2: Draw → Tenants ──────────────────────────────────────────────────

function DrawTenantBreakdown({ drawId }: { drawId: string }) {
  const { navigateToTenantInDraw } = usePower655ReportFilters();
  const { data, isLoading, error } = usePower655DrawTenants(drawId);

  if (isLoading) return <TableSkeleton rows={6} />;
  if (error) return <ErrorCard />;
  if (!data?.length) return <EmptyCard msg="Không có dữ liệu tenant cho kỳ quay này." />;

  const totals = {
    players: data.reduce((s, r) => s + r.playerCount, 0),
    entries: data.reduce((s, r) => s + r.entryCount, 0),
    lines: data.reduce((s, r) => s + r.lineCount, 0),
    stake: data.reduce((s, r) => s + r.totalStake, 0),
    payout: data.reduce((s, r) => s + r.totalPayout, 0),
    ggr: data.reduce((s, r) => s + r.ggr, 0),
    commission: data.reduce((s, r) => s + r.totalCommission, 0),
  };
  const totalPayoutPct = totals.stake > 0 ? totals.payout / totals.stake : 0;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">
            Breakdown theo đại lý — Kỳ {drawId}
          </CardTitle>
        </div>
        <CardDescription className="text-xs">
          {data.length} đại lý · Click đại lý để xem players
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{REPORT_COLUMN_LABELS.tenantCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.playerCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.payoutPercent}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalCommission}</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const payoutPct = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                return (
                  <TableRow
                    key={row.tenantId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToTenantInDraw(row.tenantId)}
                  >
                    <TableCell className="font-medium">{row.tenantId}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.playerCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.lineCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatNumber(row.totalStake)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.totalPayout)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={payoutPct > 0.95 ? "destructive" : "secondary"}>
                        {formatPercent(payoutPct)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.ggr)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.totalCommission)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/30 font-medium">
                <TableCell>{data.length} đại lý</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.players)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.entries)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.lines)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.stake)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.payout)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={totalPayoutPct > 0.95 ? "destructive" : "secondary"}>
                    {formatPercent(totalPayoutPct)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.ggr)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.commission)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Level 3: Players ─────────────────────────────────────────────────────────

function PlayerBreakdown({ drawId, tenantId }: { drawId: string; tenantId: string }) {
  const { navigateToPlayer } = usePower655ReportFilters();
  const { data, isLoading, error } = usePower655Players(drawId, tenantId);

  if (isLoading) return <TableSkeleton rows={8} />;
  if (error) return <ErrorCard />;
  if (!data?.length) return <EmptyCard msg="Không có player nào." />;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">
            Players — Kỳ {drawId} / {tenantId}
          </CardTitle>
        </div>
        <CardDescription className="text-xs">
          {data.length} players · Click player để xem entries
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.entryCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                <TableHead className="text-right">Lãi/lỗ (khách)</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                // Góc nhìn khách: dương = thắng, âm = thua
                const playerNet = row.totalPayout - row.totalStake;
                return (
                  <TableRow
                    key={row.accountId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToPlayer(row.accountId)}
                  >
                    <TableCell>
                      <p className="font-medium">{row.username || row.accountId}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.lineCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.totalStake)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.totalPayout)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${
                        playerNet > 0 ? "text-profit" : playerNet < 0 ? "text-loss" : ""
                      }`}
                    >
                      {playerNet > 0 ? "+" : ""}
                      {formatNumber(playerNet)}
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
    navigateToList,
    navigateToDraw,
    navigateToTenantInDraw,
  } = usePower655ReportFilters();

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
          <span className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs font-medium">
            <Ticket className="size-3" />
            {playerId}
          </span>
        </>
      )}
    </div>
  );
}

/** Tab "Theo kỳ quay" — 4 cấp drill-down, Power 6/55. */
export function ByDrawTab() {
  const { from, to, level, drawId, tenantId, playerId } = usePower655ReportFilters();

  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}

      {level === "list" && <KpiStrip from={from} to={to} />}

      {level === "list" && <DrawList />}
      {level === "draw-tenants" && drawId && <DrawTenantBreakdown drawId={drawId} />}
      {level === "players" && drawId && tenantId && (
        <PlayerBreakdown drawId={drawId} tenantId={tenantId} />
      )}
      {level === "entries" && drawId && tenantId && playerId && (
        <EntryList drawId={drawId} tenantId={tenantId} accountId={playerId} />
      )}
    </div>
  );
}

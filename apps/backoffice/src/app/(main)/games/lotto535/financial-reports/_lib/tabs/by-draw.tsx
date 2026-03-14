"use client";

import { ChevronRight } from "lucide-react";
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
import { useLotto535ReportFilters } from "../use-report-filters";
import { EntryList } from "../sections/entry-list";
import {
  useLotto535DrawSummary,
  useLotto535DrawList,
  useLotto535DrawTenants,
  useLotto535Players,
} from "../use-report-queries";

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiStrip({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useLotto535DrawSummary(from, to);

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const payoutPct = data.totalStake > 0 ? data.totalPayout / data.totalStake : 0;

  const cards = [
    {
      label: "Kỳ quay",
      value: formatNumber(data.drawCount),
      sub: `${formatNumber(data.entryCount)} entries`,
    },
    {
      label: "Players",
      value: formatNumber(data.playerCount),
      sub: `${formatNumber(data.tenantCount)} đại lý`,
    },
    { label: "Lines", value: formatNumber(data.lineCount), sub: "tổng lines" },
    {
      label: "Doanh thu",
      value: formatVNDCompact(data.totalStake),
      sub: formatVND(data.totalStake),
      highlight: "blue" as const,
    },
    {
      label: "GGR",
      value: formatVNDCompact(data.ggr),
      sub: `Margin: ${formatPercent(data.totalStake > 0 ? data.ggr / data.totalStake : 0)}`,
      highlight: data.ggr >= 0 ? ("green" as const) : ("red" as const),
    },
    {
      label: "Payout %",
      value: formatPercent(payoutPct),
      sub: formatVNDCompact(data.totalPayout),
      highlight: payoutPct > 0.95 ? ("red" as const) : ("neutral" as const),
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p
            className={`mt-1 text-lg font-bold tabular-nums ${c.highlight === "blue" ? "text-blue-600 dark:text-blue-400" : c.highlight === "green" ? "text-success" : c.highlight === "red" ? "text-danger" : ""}`}
          >
            {c.value}
          </p>
          <p className="truncate text-xs text-muted-foreground">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Level 1: Draw List ───────────────────────────────────────────────────────

function DrawList() {
  const { from, to, navigateToDraw } = useLotto535ReportFilters();
  const page = 1;

  const { data, isLoading, error } = useLotto535DrawList(from, to, page);

  if (isLoading) return <TableSkeleton rows={10} />;
  if (error) return <ErrorCard />;
  if (!data?.data.length)
    return <EmptyCard msg="Không có kỳ quay nào trong khoảng thời gian đã chọn." />;

  const rows = data.data;
  const totals = {
    entries: rows.reduce((s, r) => s + r.entryCount, 0),
    players: rows.reduce((s, r) => s + r.playerCount, 0),
    lines: rows.reduce((s, r) => s + r.lineCount, 0),
    stake: rows.reduce((s, r) => s + r.totalStake, 0),
    payout: rows.reduce((s, r) => s + r.totalPayout, 0),
    ggr: rows.reduce((s, r) => s + r.ggr, 0),
    commission: rows.reduce((s, r) => s + r.totalCommission, 0),
    netProfit: rows.reduce((s, r) => s + r.netProfit, 0),
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Danh sách kỳ quay</CardTitle>
        <CardDescription className="text-xs">
          {data.total} kỳ quay · Click để xem breakdown theo đại lý
        </CardDescription>
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
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">Trả thưởng</TableHead>
                <TableHead className="text-right">GGR</TableHead>
                <TableHead className="text-right">Hoa hồng</TableHead>
                <TableHead className="text-right">Lợi nhuận</TableHead>
                <TableHead className="text-right">Payout %</TableHead>
                <TableHead className="w-8" />
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
                      {formatNumber(row.lineCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatVND(row.totalStake)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${payoutPct > 0.95 ? "text-danger" : ""}`}
                    >
                      {formatVND(row.totalPayout)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatVND(row.ggr)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatVND(row.totalCommission)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${row.netProfit >= 0 ? "text-success" : "text-danger"}`}
                    >
                      {formatVND(row.netProfit)}
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
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Summary footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-xs font-medium">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">TỔNG CỘNG</span>
            <Badge variant="secondary">{formatNumber(totals.entries)} entries</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4 tabular-nums">
            <span>
              DT: <strong title={formatVND(totals.stake)}>{formatVNDCompact(totals.stake)}</strong>
            </span>
            <span>
              PO:{" "}
              <strong title={formatVND(totals.payout)}>{formatVNDCompact(totals.payout)}</strong>
            </span>
            <span>
              GGR: <strong title={formatVND(totals.ggr)}>{formatVNDCompact(totals.ggr)}</strong>
            </span>
            <span>
              HH:{" "}
              <strong title={formatVND(totals.commission)}>
                {formatVNDCompact(totals.commission)}
              </strong>
            </span>
            <span className={totals.netProfit >= 0 ? "text-success" : "text-danger"}>
              LN:{" "}
              <strong title={formatVND(totals.netProfit)}>
                {formatVNDCompact(totals.netProfit)}
              </strong>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Level 2: Draw → Tenants ──────────────────────────────────────────────────

function DrawTenantBreakdown({ drawId }: { drawId: string }) {
  const { navigateToTenantInDraw } = useLotto535ReportFilters();

  const { data, isLoading, error } = useLotto535DrawTenants(drawId);

  if (isLoading) return <TableSkeleton rows={6} />;
  if (error) return <ErrorCard />;
  if (!data?.length) return <EmptyCard msg="Không có dữ liệu tenant cho kỳ quay này." />;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Breakdown theo đại lý — Kỳ {drawId}</CardTitle>
        <CardDescription className="text-xs">Click đại lý để xem players</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Đại lý</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">Trả thưởng</TableHead>
                <TableHead className="text-right">GGR</TableHead>
                <TableHead className="text-right">Hoa hồng</TableHead>
                <TableHead className="text-right">Payout %</TableHead>
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
                    <TableCell>
                      <p className="font-medium">{row.tenantId}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.playerCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.lineCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatVND(row.totalStake)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${payoutPct > 0.95 ? "text-danger" : ""}`}
                    >
                      {formatVND(row.totalPayout)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatVND(row.ggr)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatVND(row.commission)}
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
      </CardContent>
    </Card>
  );
}

// ─── Level 3: Players ─────────────────────────────────────────────────────────

function PlayerBreakdown({ drawId, tenantId }: { drawId: string; tenantId: string }) {
  const { navigateToPlayer } = useLotto535ReportFilters();

  const { data, isLoading, error } = useLotto535Players(drawId, tenantId);

  if (isLoading) return <TableSkeleton rows={8} />;
  if (error) return <ErrorCard />;
  if (!data?.length) return <EmptyCard msg="Không có player nào trong phạm vi này." />;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          Players — Kỳ {drawId} / {tenantId}
        </CardTitle>
        <CardDescription className="text-xs">Click player để xem entries</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Cược</TableHead>
                <TableHead className="text-right">Thắng</TableHead>
                <TableHead className="text-right">Trả thưởng</TableHead>
                <TableHead className="text-right">Kết quả ròng</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const net = row.totalPayout - row.totalStake;
                return (
                  <TableRow
                    key={row.accountId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToPlayer(row.accountId)}
                  >
                    <TableCell>
                      <p className="font-medium">{row.username || row.accountId}</p>
                      <p className="font-mono text-xs text-muted-foreground">{row.accountId}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.lineCount)}
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
                    <TableCell
                      className={`text-right tabular-nums font-medium ${net >= 0 ? "text-success" : "text-danger"}`}
                    >
                      {net >= 0 ? "+" : ""}
                      {formatVND(net)}
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
  } = useLotto535ReportFilters();

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
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">{playerId}</span>
        </>
      )}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

/** Tab "Theo kỳ quay" — 4 cấp drill-down. */
export function ByDrawTab() {
  const { from, to, level, drawId, tenantId, playerId } = useLotto535ReportFilters();

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb />

      {/* KPI strip — chỉ hiện ở level list */}
      {level === "list" && <KpiStrip from={from} to={to} />}

      {/* Render theo level */}
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="space-y-2">
          {[...Array(rows)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorCard() {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        Lỗi tải dữ liệu. Vui lòng thử lại.
      </CardContent>
    </Card>
  );
}

function EmptyCard({ msg }: { msg: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">{msg}</CardContent>
    </Card>
  );
}

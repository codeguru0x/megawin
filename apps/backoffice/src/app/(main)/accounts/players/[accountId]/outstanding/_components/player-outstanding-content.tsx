"use client";

import React, { useMemo, useState } from "react";
import { useQueryState, parseAsString, parseAsInteger } from "nuqs";
import {
  Clock,
  CalendarClock,
  Ticket,
  HandCoins,
  Banknote,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { GAME_LABELS, REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber, formatVNDCompact } from "@megawin/shared/utils";
import { Pagination } from "@megawin/shared/constants/pagination";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getGameColors } from "@/lib/game-colors";
import { playerDetailKeys } from "@/lib/query-keys/player-detail";
import { cn } from "@/lib/utils";
import { GameEntryDetailDialog } from "@/components/reports/game/game-entry-detail-dialog";
import { OutstandingEntryList } from "@/components/reports/game/outstanding/outstanding-entry-list";
import type { OutstandingEntryRow } from "@/components/reports/game/outstanding/types";

import {
  usePlayerOutstanding,
  usePlayerEntryDetail,
  type PlayerOutstandingSummaryResponse,
  type PlayerOutstandingEntryResponse,
} from "../../_shared/queries";

interface PlayerOutstandingContentProps {
  accountId: string;
}

/** Map PlayerOutstandingEntryResponse -> OutstandingEntryRow cho OutstandingEntryList. */
function toOutstandingEntryRow(entry: PlayerOutstandingEntryResponse): OutstandingEntryRow {
  return {
    id: entry.entryId,
    ticketNo: entry.ticketNo || entry.entryId.slice(-8),
    createdAt: entry.createdAt,
    boardCount: entry.boardCount,
    lineCount: entry.lineCount,
    betUnitCount: entry.betUnitCount,
    commissionAmount: entry.commissionAmount,
    totalStake: entry.amount,
  };
}

/**
 * Noi dung tab "Dang cho" -- 3 cap drill-down.
 *
 * View 1 (mac dinh): Bang game co outstanding entries.
 *   Columns: Game | So ky | Phieu cuoc | Uoc tinh hoa hong | Tien cuoc
 * View 2 (chon game): Bang cac ky trong game do.
 *   Columns: Ky mo thuong | Phieu cuoc | Uoc tinh hoa hong | Tien cuoc
 * View 3 (chon ky): OutstandingEntryList phan trang + click -> dialog.
 *
 * URL state: og = game dang drill, od = drawId dang xem entries.
 */

/**
 * Animated dot báo hiệu live data — click để force refresh.
 */
function LiveDot({ isFetching, onRefresh }: { isFetching: boolean; onRefresh: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted/60 transition-colors"
          aria-label="Lấy dữ liệu mới nhất"
        >
          <span className="relative flex size-2">
            {isFetching ? (
              <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
            ) : (
              <>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </>
            )}
          </span>
          <span className="text-xs text-muted-foreground">Live</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        Tự động refresh mỗi 60s · Nhấn để lấy dữ liệu mới nhất
      </TooltipContent>
    </Tooltip>
  );
}
export function PlayerOutstandingContent({ accountId }: PlayerOutstandingContentProps) {
  const qc = useQueryClient();
  const { data, isLoading, isError, isFetching } = usePlayerOutstanding(accountId);

  // og = outstanding game dang drill (view 2 hoac 3)
  const [og, setOg] = useQueryState("og", parseAsString);
  // od = drawId dang xem entries (view 3)
  const [od, setOd] = useQueryState("od", parseAsString);
  // odp = page trong view 3 entry list
  const [odp, setOdp] = useQueryState("odp", parseAsInteger.withDefault(1));

  // Entry dang chon de mo dialog
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEntryGame, setSelectedEntryGame] = useState<string | null>(null);

  const { data: entryDetail, isLoading: isLoadingDetail } = usePlayerEntryDetail(
    accountId,
    selectedEntryId ?? "",
    selectedEntryGame ?? "",
  );

  function handleRefresh() {
    void qc.invalidateQueries({ queryKey: playerDetailKeys.outstanding(accountId) });
  }

  // Group entries by gameProduct -- view 1
  const byGame = useMemo(() => {
    if (!data?.entries) return [];
    const map = new Map<
      string,
      {
        gameProduct: string;
        drawCount: number;
        entryCount: number;
        totalCommission: number;
        totalStake: number;
        drawIds: Set<string>;
      }
    >();
    for (const entry of data.entries) {
      const gp = entry.gameProduct;
      if (!map.has(gp)) {
        map.set(gp, {
          gameProduct: gp,
          drawCount: 0,
          entryCount: 0,
          totalCommission: 0,
          totalStake: 0,
          drawIds: new Set(),
        });
      }
      const group = map.get(gp)!;
      group.drawIds.add(entry.drawId);
      group.entryCount += 1;
      group.totalCommission += entry.commissionAmount;
      group.totalStake += entry.amount;
    }
    // Compute drawCount from set size
    return [...map.values()]
      .map((g) => ({ ...g, drawCount: g.drawIds.size }))
      .sort((a, b) => b.totalStake - a.totalStake);
  }, [data?.entries]);

  // Group entries by drawId trong game dang chon -- view 2
  const byDraw = useMemo(() => {
    if (!og || !data?.entries) return [];
    const gameEntries = data.entries.filter((e) => e.gameProduct === og);
    const map = new Map<
      string,
      {
        drawId: string;
        entryCount: number;
        totalCommission: number;
        totalStake: number;
      }
    >();
    for (const entry of gameEntries) {
      if (!map.has(entry.drawId)) {
        map.set(entry.drawId, {
          drawId: entry.drawId,
          entryCount: 0,
          totalCommission: 0,
          totalStake: 0,
        });
      }
      const group = map.get(entry.drawId)!;
      group.entryCount += 1;
      group.totalCommission += entry.commissionAmount;
      group.totalStake += entry.amount;
    }
    return [...map.values()].sort((a, b) => a.drawId.localeCompare(b.drawId));
  }, [og, data?.entries]);

  // Entries cho draw dang chon (view 3) -- paginated
  const entriesForDraw = useMemo(() => {
    if (!od || !og || !data?.entries) return [];
    return data.entries.filter((e) => e.gameProduct === og && e.drawId === od);
  }, [od, og, data?.entries]);

  const view = od ? "entries" : og ? "draws" : "games";
  const gameLabel = og ? (GAME_LABELS[og as GameProduct] ?? og) : "";
  const tenantId = data?.entries?.[0]?.tenantId ?? "";

  // Check game co lines khong -- dua tren data thuc te
  const showLineCount = entriesForDraw.some((e) => (e.lineCount ?? 0) > 0);

  // Pagination cho view 3
  const PAGE_SIZE = Pagination.Default.Size;
  const totalEntryPages = Math.ceil(entriesForDraw.length / PAGE_SIZE);
  const safePage = Math.min(Math.max(odp, 1), Math.max(totalEntryPages, 1));
  const paginatedEntries = entriesForDraw.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Navigation handlers
  const handleSelectGame = (gp: string) => {
    void setOg(gp, { history: "push" });
    void setOd(null);
    void setOdp(null);
  };

  const handleSelectDraw = (drawId: string) => {
    void setOd(drawId, { history: "push" });
    void setOdp(null);
  };

  const handleBackToGames = () => {
    void setOg(null);
    void setOd(null);
    void setOdp(null);
  };

  const handleBackToDraws = () => {
    void setOd(null);
    void setOdp(null);
  };

  const handleSelectEntry = (entryId: string, game: string) => {
    setSelectedEntryId(entryId);
    setSelectedEntryGame(game);
  };

  const handleCloseDialog = () => {
    setSelectedEntryId(null);
    setSelectedEntryGame(null);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header: breadcrumb + actions ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1 text-sm">
            <Clock className="mr-1 size-4 shrink-0 text-muted-foreground" />
            {view === "games" ? (
              <span className="font-medium text-foreground">Đơn cược đang chờ</span>
            ) : view === "draws" ? (
              <>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={handleBackToGames}
                >
                  Đơn cược đang chờ
                </button>
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <span className="font-semibold text-foreground">{gameLabel}</span>
              </>
            ) : (
              <>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={handleBackToGames}
                >
                  Đơn cược đang chờ
                </button>
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={handleBackToDraws}
                >
                  {gameLabel}
                </button>
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <span className="font-semibold text-foreground">Kỳ {od}</span>
              </>
            )}
          </div>
          {view === "games" && (
            <div className="flex items-center gap-1.5 pl-5">
              <span className="text-xs text-muted-foreground">Phiếu cược đang chờ kết quả</span>
              <LiveDot isFetching={isFetching} onRefresh={handleRefresh} />
            </div>
          )}
        </div>
      </div>

      {/* ── KPI strip -- chi hien thi o view 1 ── */}
      {view === "games" && <OutstandingKpiStrip data={data} isLoading={isLoading} />}

      {/* ── Content ── */}
      {isLoading ? (
        <TableSkeleton cols={5} />
      ) : isError ? (
        <div className="flex h-40 items-center justify-center text-sm text-destructive">
          Không thể tải dữ liệu.
        </div>
      ) : !data || data.entries.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium text-muted-foreground">Không có đơn cược đang chờ</p>
          <p className="text-xs text-muted-foreground">Tất cả đơn cược đã được settle hoặc void.</p>
        </div>
      ) : view === "games" ? (
        <GamesView byGame={byGame} onSelectGame={handleSelectGame} />
      ) : view === "draws" ? (
        <DrawsView byDraw={byDraw} onSelectDraw={handleSelectDraw} />
      ) : (
        <EntriesView
          drawId={od!}
          tenantId={tenantId}
          game={og!}
          rows={paginatedEntries.map(toOutstandingEntryRow)}
          showLineCount={showLineCount}
          page={safePage}
          totalPages={totalEntryPages}
          totalCount={entriesForDraw.length}
          onPageChange={(p) => void setOdp(p)}
          onRowClick={(row) => handleSelectEntry(row.id, og!)}
        />
      )}

      {/* Entry Detail Dialog */}
      <GameEntryDetailDialog
        game={selectedEntryGame ?? ""}
        entry={isLoadingDetail ? null : (entryDetail ?? null)}
        open={!!selectedEntryId && !!selectedEntryGame && !isLoadingDetail}
        onClose={handleCloseDialog}
      />
    </div>
  );
}

// ─── View 1: Danh sach Game ──────────────────────────────────────────────────

function GamesView({
  byGame,
  onSelectGame,
}: {
  byGame: Array<{
    gameProduct: string;
    drawCount: number;
    entryCount: number;
    totalCommission: number;
    totalStake: number;
  }>;
  onSelectGame: (gp: string) => void;
}) {
  const totals = byGame.reduce(
    (acc, g) => ({
      drawCount: acc.drawCount + g.drawCount,
      entryCount: acc.entryCount + g.entryCount,
      totalCommission: acc.totalCommission + g.totalCommission,
      totalStake: acc.totalStake + g.totalStake,
    }),
    { drawCount: 0, entryCount: 0, totalCommission: 0, totalStake: 0 },
  );

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Ticket className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Đơn chờ theo game</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Game
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Số kỳ
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.entryCount}
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.estimatedCommission}
                </TableHead>
                <TableHead className="pr-5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.totalStake}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byGame.map((group) => {
                const c = getGameColors(group.gameProduct);
                const label = GAME_LABELS[group.gameProduct as GameProduct] ?? group.gameProduct;
                return (
                  <TableRow
                    key={group.gameProduct}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onSelectGame(group.gameProduct)}
                  >
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-2">
                        <span className={cn("inline-block size-2 shrink-0 rounded-full", c.twBg)} />
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(group.drawCount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(group.entryCount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatNumber(group.totalCommission)}
                    </TableCell>
                    <TableCell className="pr-5 text-right text-sm tabular-nums font-medium">
                      {formatNumber(group.totalStake)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            {byGame.length > 0 && (
              <tfoot>
                <TableRow className="border-t bg-muted/30 font-semibold">
                  <TableCell className="pl-5 text-sm font-semibold">
                    {REPORT_COLUMN_LABELS.summary}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.drawCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.entryCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.totalCommission)}
                  </TableCell>
                  <TableCell className="pr-5 text-right text-sm tabular-nums font-semibold">
                    {formatNumber(totals.totalStake)}
                  </TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── View 2: Danh sach Ky trong Game ─────────────────────────────────────────

function DrawsView({
  byDraw,
  onSelectDraw,
}: {
  byDraw: Array<{
    drawId: string;
    entryCount: number;
    totalCommission: number;
    totalStake: number;
  }>;
  onSelectDraw: (drawId: string) => void;
}) {
  if (byDraw.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Không có đơn chờ trong game này.
      </div>
    );
  }

  const totals = byDraw.reduce(
    (acc, d) => ({
      entryCount: acc.entryCount + d.entryCount,
      totalCommission: acc.totalCommission + d.totalCommission,
      totalStake: acc.totalStake + d.totalStake,
    }),
    { entryCount: 0, totalCommission: 0, totalStake: 0 },
  );

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Đơn chờ theo kỳ quay</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Kỳ mở thưởng
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.entryCount}
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.estimatedCommission}
                </TableHead>
                <TableHead className="pr-5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.totalStake}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byDraw.map((draw) => (
                <TableRow
                  key={draw.drawId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelectDraw(draw.drawId)}
                >
                  <TableCell className="pl-5 font-mono text-sm">{draw.drawId}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(draw.entryCount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(draw.totalCommission)}
                  </TableCell>
                  <TableCell className="pr-5 text-right text-sm tabular-nums font-medium">
                    {formatNumber(draw.totalStake)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <tfoot>
              <TableRow className="border-t bg-muted/30">
                <TableCell className="pl-5 text-sm font-semibold">
                  {REPORT_COLUMN_LABELS.summary}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.entryCount)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.totalCommission)}
                </TableCell>
                <TableCell className="pr-5 text-right text-sm tabular-nums font-semibold">
                  {formatNumber(totals.totalStake)}
                </TableCell>
              </TableRow>
            </tfoot>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── View 3: Entry List cho 1 ky ─────────────────────────────────────────────

function EntriesView({
  drawId,
  tenantId,
  game,
  rows,
  showLineCount,
  page,
  totalPages,
  totalCount,
  onPageChange,
  onRowClick,
}: {
  drawId: string;
  tenantId: string;
  game: string;
  rows: OutstandingEntryRow[];
  showLineCount: boolean;
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (p: number) => void;
  onRowClick: (row: OutstandingEntryRow) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <OutstandingEntryList
        drawId={drawId}
        tenantId={tenantId}
        displayName={`${formatNumber(totalCount)} phiếu cược`}
        rows={rows}
        isLoading={false}
        error={null}
        onRefetch={() => {}}
        onRowClick={onRowClick}
        showLineCount={showLineCount}
      />

      {/* Phân trang — chỉ hiện khi có nhiều trang */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            Trang {page} / {totalPages} &middot; {totalCount} phiếu
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="size-3.5" />
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Sau
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b px-5 py-3">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className="h-3 flex-1" />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  isLoading: boolean;
}

/** KPI card chuẩn — horizontal icon + value, pattern nhất quán với reports/outstanding. */
function KpiCard({ icon: Icon, iconBg, iconColor, label, value, sub, isLoading }: KpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {isLoading ? (
          <Skeleton className="my-0.5 h-6 w-24" />
        ) : (
          <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
        )}
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

function OutstandingKpiStrip({
  data,
  isLoading,
}: {
  data: PlayerOutstandingSummaryResponse | undefined;
  isLoading: boolean;
}) {
  // activeDrawCount tính từ entries — distinct drawIds cross-game
  const activeDrawCount = useMemo(() => {
    if (!data?.entries) return 0;
    return new Set(data.entries.map((e) => e.drawId)).size;
  }, [data?.entries]);

  const totalEntryCount = data?.totalEntryCount ?? 0;
  const totalCommission = data?.totalCommission ?? 0;
  const totalStake = data?.totalStake ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        icon={CalendarClock}
        iconBg="bg-indigo-100 dark:bg-indigo-900/50"
        iconColor="text-indigo-600 dark:text-indigo-400"
        label="Kỳ đang hoạt động"
        value={formatNumber(activeDrawCount)}
        sub=""
        isLoading={isLoading}
      />
      <KpiCard
        icon={Ticket}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label={REPORT_COLUMN_LABELS.entryCount}
        value={formatNumber(totalEntryCount)}
        sub=""
        isLoading={isLoading}
      />
      <KpiCard
        icon={HandCoins}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label={REPORT_COLUMN_LABELS.estimatedCommission}
        value={formatVNDCompact(totalCommission)}
        sub=""
        isLoading={isLoading}
      />
      <KpiCard
        icon={Banknote}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label={REPORT_COLUMN_LABELS.totalStake}
        value={formatVNDCompact(totalStake)}
        sub=""
        isLoading={isLoading}
      />
    </div>
  );
}

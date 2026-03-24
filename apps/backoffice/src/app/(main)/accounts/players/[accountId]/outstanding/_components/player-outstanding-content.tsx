"use client";

import { useMemo, useState } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { Clock, RefreshCw, Receipt, DollarSign, Gamepad2, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { GAME_LABELS } from "@megawin/game-core/labels";
import { formatNumber, formatVNDCompact } from "@megawin/shared/utils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { getGameColors } from "@/lib/game-colors";
import { playerDetailKeys } from "@/lib/query-keys/player-detail";
import { cn } from "@/lib/utils";
import { GameEntryDetailDialog } from "@/components/games/game-entry-detail-dialog";

import {
  usePlayerOutstanding,
  usePlayerEntryDetail,
  type PlayerOutstandingSummaryResponse,
  type PlayerOutstandingEntryResponse,
} from "../../_shared/queries";

interface PlayerOutstandingContentProps {
  accountId: string;
}

/**
 * Nội dung tab "Đang chờ" — 3 cấp drill-down.
 *
 * View 1 (mặc định): Danh sách game đang có entries outstanding.
 * View 2 (khi chọn game): Entries nhóm theo drawId trong game đó.
 * View 3 (khi click entry): EntryDetailDialog game-specific.
 *
 * URL state: og (outstanding game) — lưu gameProduct đang drill.
 * Outstanding entry KHÔNG có payout/result/outcome — dialog chỉ hiển thị
 * bộ số đặt cược, drawId, tiền cược (không có kết quả).
 *
 * 1 player = 1 tenant duy nhất.
 */
export function PlayerOutstandingContent({ accountId }: PlayerOutstandingContentProps) {
  const qc = useQueryClient();
  const { data, isLoading, isError, isFetching } = usePlayerOutstanding(accountId);

  // og = outstanding game đang drill (view 2)
  const [og, setOg] = useQueryState("og", parseAsString);

  // entryId đang chọn để mở dialog (view 3)
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

  // Group entries by gameProduct (view 1 summary)
  const byGame = useMemo(() => {
    if (!data?.entries) return [];
    const map = new Map<
      string,
      { gameProduct: string; entries: PlayerOutstandingEntryResponse[]; totalStake: number }
    >();
    for (const entry of data.entries) {
      const gp = entry.gameProduct;
      if (!map.has(gp)) {
        map.set(gp, { gameProduct: gp, entries: [], totalStake: 0 });
      }
      const group = map.get(gp)!;
      group.entries.push(entry);
      group.totalStake += entry.amount;
    }
    return [...map.values()].sort((a, b) => b.totalStake - a.totalStake);
  }, [data?.entries]);

  // Entries của game đang chọn, grouped by drawId (view 2)
  const byDraw = useMemo(() => {
    if (!og || !data?.entries) return [];
    const gameEntries = data.entries.filter((e) => e.gameProduct === og);
    const map = new Map<
      string,
      { drawId: string; entries: PlayerOutstandingEntryResponse[]; totalStake: number }
    >();
    for (const entry of gameEntries) {
      if (!map.has(entry.drawId)) {
        map.set(entry.drawId, { drawId: entry.drawId, entries: [], totalStake: 0 });
      }
      const group = map.get(entry.drawId)!;
      group.entries.push(entry);
      group.totalStake += entry.amount;
    }
    return [...map.values()].sort((a, b) => a.drawId.localeCompare(b.drawId));
  }, [og, data?.entries]);

  const isDrillingGame = !!og;
  const gameLabel = og ? (GAME_LABELS[og as GameProduct] ?? og) : "";

  const handleSelectGame = (gp: string) => {
    void setOg(gp);
  };

  const handleBackToGames = () => {
    void setOg(null);
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
      {/* Section header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Clock className="size-4 shrink-0 text-muted-foreground" />
          {isDrillingGame ? (
            <div className="flex items-center gap-1 text-sm">
              <button
                className="font-medium text-muted-foreground hover:text-foreground"
                onClick={handleBackToGames}
              >
                Đơn cược đang chờ
              </button>
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <span className="font-semibold text-foreground">{gameLabel}</span>
            </div>
          ) : (
            <span className="text-sm font-medium text-foreground">Đơn cược đang chờ</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDrillingGame && (
            <Button variant="outline" size="sm" onClick={handleBackToGames}>
              ← Quay lại
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
            Làm mới
          </Button>
        </div>
      </div>

      {/* KPI strip — chỉ hiển thị ở view 1 */}
      {!isDrillingGame && <OutstandingKpiStrip data={data} isLoading={isLoading} />}

      {/* Content */}
      {isLoading ? (
        <Card className="gap-0 py-0">
          <CardContent className="space-y-0 p-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 border-b px-5 py-3">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-3 flex-1" />
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : isError ? (
        <div className="flex h-[160px] items-center justify-center text-sm text-destructive">
          Không thể tải dữ liệu.
        </div>
      ) : !data || data.entries.length === 0 ? (
        <div className="flex h-[160px] flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium text-muted-foreground">Không có đơn cược đang chờ</p>
          <p className="text-xs text-muted-foreground">Tất cả đơn cược đã được settle hoặc void.</p>
        </div>
      ) : isDrillingGame ? (
        /* View 2: Entries grouped by drawId trong 1 game */
        <OutstandingDrawsView
          gameLabel={gameLabel}
          byDraw={byDraw}
          onSelectEntry={handleSelectEntry}
          selectedGame={og}
        />
      ) : (
        /* View 1: Danh sách game */
        <OutstandingGamesView byGame={byGame} onSelectGame={handleSelectGame} />
      )}

      {/* View 3: Entry Detail Dialog — hiển thị outstanding entry */}
      <GameEntryDetailDialog
        game={selectedEntryGame ?? ""}
        entry={isLoadingDetail ? null : (entryDetail ?? null)}
        open={!!selectedEntryId && !!selectedEntryGame && !isLoadingDetail}
        onClose={handleCloseDialog}
      />
    </div>
  );
}

// ─── View 1: Danh sách game ───────────────────────────────────────────────────

function OutstandingGamesView({
  byGame,
  onSelectGame,
}: {
  byGame: Array<{
    gameProduct: string;
    entries: PlayerOutstandingEntryResponse[];
    totalStake: number;
  }>;
  onSelectGame: (gp: string) => void;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Receipt className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Đơn chờ theo game</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>Game</TableHead>
                <TableHead className="text-right">Số đơn</TableHead>
                <TableHead className="text-right">Tiền cược</TableHead>
                <TableHead className="w-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {byGame.map((group) => {
                const gp = group.gameProduct;
                const c = getGameColors(gp);
                const label = GAME_LABELS[gp as GameProduct] ?? gp;
                return (
                  <TableRow
                    key={gp}
                    className="cursor-pointer text-xs hover:bg-muted/50"
                    onClick={() => onSelectGame(gp)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={cn("inline-block size-2 rounded-full", c.twBg)} />
                        <span className="font-medium">{label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge variant="secondary">{group.entries.length}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatNumber(group.totalStake)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-3.5 text-muted-foreground" />
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

// ─── View 2: Entries grouped by draw ─────────────────────────────────────────

function OutstandingDrawsView({
  gameLabel,
  byDraw,
  onSelectEntry,
  selectedGame,
}: {
  gameLabel: string;
  byDraw: Array<{
    drawId: string;
    entries: PlayerOutstandingEntryResponse[];
    totalStake: number;
  }>;
  onSelectEntry: (entryId: string, game: string) => void;
  selectedGame: string;
}) {
  if (byDraw.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center text-sm text-muted-foreground">
        Không có đơn chờ trong game này.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {byDraw.map((drawGroup) => (
        <Card key={drawGroup.drawId} className="gap-0 py-0">
          <CardHeader className="px-5 pb-2 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Kỳ {drawGroup.drawId}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {drawGroup.entries.length} đơn · {gameLabel} · Tổng cược:{" "}
                  {formatNumber(drawGroup.totalStake)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Mã vé</TableHead>
                    <TableHead>Ngày tài chính</TableHead>
                    <TableHead className="text-right">Tiền cược</TableHead>
                    <TableHead className="text-right">Hoa hồng</TableHead>
                    <TableHead>Thời gian đặt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drawGroup.entries.map((entry) => (
                    <TableRow
                      key={entry.entryId}
                      className="cursor-pointer text-xs hover:bg-muted/50"
                      onClick={() => onSelectEntry(entry.entryId, entry.gameProduct)}
                    >
                      <TableCell>
                        <button className="font-mono text-primary underline-offset-2 hover:underline">
                          {entry.ticketNo || entry.entryId.slice(-8)}
                        </button>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {entry.financialDate}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(entry.commissionAmount)}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {entry.createdAt
                          ? new Date(entry.createdAt).toLocaleString("vi-VN", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function OutstandingKpiStrip({
  data,
  isLoading,
}: {
  data: PlayerOutstandingSummaryResponse | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-xl" />
        ))}
      </div>
    );
  }

  const totalEntryCount = data?.totalEntryCount ?? 0;
  const totalStake = data?.totalStake ?? 0;
  const activeGameCount = data?.activeGameCount ?? 0;

  const cards = [
    {
      icon: Receipt,
      iconBg: "bg-blue-100 dark:bg-blue-900/50",
      iconColor: "text-blue-600 dark:text-blue-400",
      label: "Đơn đang chờ",
      value: formatNumber(totalEntryCount),
      sub: "Chưa có kết quả",
    },
    {
      icon: DollarSign,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      label: "Tiền cược chờ",
      value: formatVNDCompact(totalStake),
      sub: "Chưa settle",
    },
    {
      icon: Gamepad2,
      iconBg: "bg-violet-100 dark:bg-violet-900/50",
      iconColor: "text-violet-600 dark:text-violet-400",
      label: "Game hoạt động",
      value: formatNumber(activeGameCount),
      sub: `Trong ${formatNumber(7)} game`,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm"
        >
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              card.iconBg,
            )}
          >
            <card.icon className={cn("size-5", card.iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">{card.label}</p>
            <p className="text-lg font-bold tabular-nums text-foreground">{card.value}</p>
            <p className="truncate text-[11px] text-muted-foreground">{card.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

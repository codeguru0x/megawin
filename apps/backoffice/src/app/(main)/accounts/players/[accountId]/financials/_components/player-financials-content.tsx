"use client";

import { useQueryState, parseAsString } from "nuqs";
import { BarChart3, ChevronRight, Layers } from "lucide-react";
import { todayVN, formatNumber } from "@megawin/shared/utils";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { GAME_LABELS } from "@megawin/game-core/labels";

import { FinancialDateRangePicker } from "@/components/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getGameColors } from "@/lib/game-colors";
import { cn } from "@/lib/utils";

import { usePlayerFinancials, type PlayerFinancialRecord } from "../../_shared/queries";
import { PlayerFinancialEntriesView } from "./player-financial-entries";

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

interface PlayerFinancialsContentProps {
  accountId: string;
}

/**
 * Nội dung tab "Tài chính" — Client Component.
 *
 * URL state: from/to/game — filters chính. fd/gp — drill cấp 2 (entries ngày × game).
 * Khi fd+gp có giá trị → chuyển sang view entries thay vì bảng tổng hợp.
 * Back button → xoá fd+gp → quay về bảng tổng hợp.
 */
export function PlayerFinancialsContent({ accountId }: PlayerFinancialsContentProps) {
  const today = todayVN();
  const [from, setFrom] = useQueryState("from", parseAsString.withDefault(defaultFrom()));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault(today));
  const [game, setGame] = useQueryState("game", parseAsString.withDefault("all"));
  // Drill cấp 2: fd = financialDate đang drill, gp = gameProduct đang drill
  const [fd, setFd] = useQueryState("fd", parseAsString);
  const [gp, setGp] = useQueryState("gp", parseAsString);

  const {
    data: rawData,
    isLoading,
    isError,
  } = usePlayerFinancials(accountId, from, to, game === "all" ? undefined : game);

  const records: PlayerFinancialRecord[] = rawData ?? [];

  // Totals cho footer
  const totals = records.reduce(
    (acc, r) => ({
      drawCount: acc.drawCount + r.drawCount,
      entryCount: acc.entryCount + r.entryCount,
      settledCount: acc.settledCount + r.settledCount,
      winCount: acc.winCount + r.winCount,
      voidCount: acc.voidCount + r.voidCount,
      totalStake: acc.totalStake + r.totalStake,
      totalPayout: acc.totalPayout + r.totalPayout,
      ggr: acc.ggr + r.ggr,
      totalCommission: acc.totalCommission + r.totalCommission,
      netProfit: acc.netProfit + r.netProfit,
    }),
    {
      drawCount: 0,
      entryCount: 0,
      settledCount: 0,
      winCount: 0,
      voidCount: 0,
      totalStake: 0,
      totalPayout: 0,
      ggr: 0,
      totalCommission: 0,
      netProfit: 0,
    },
  );

  const isDrilling = !!fd && !!gp;

  const handleRowClick = (financialDate: string, gameProduct: string) => {
    void setFd(financialDate);
    void setGp(gameProduct);
  };

  const handleBackToList = () => {
    void setFd(null);
    void setGp(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Section header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 shrink-0 text-muted-foreground" />
          {isDrilling ? (
            <div className="flex items-center gap-1 text-sm">
              <button
                className="font-medium text-muted-foreground hover:text-foreground"
                onClick={handleBackToList}
              >
                Chi tiết tài chính
              </button>
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <span className="font-semibold text-foreground">
                {GAME_LABELS[gp as GameProduct] ?? gp} · {fd}
              </span>
            </div>
          ) : (
            <span className="text-sm font-medium text-foreground">Chi tiết tài chính</span>
          )}
        </div>
        {!isDrilling && (
          <div className="flex flex-wrap items-center gap-2">
            <FinancialDateRangePicker
              from={from}
              to={to}
              onChange={(f, t) => {
                void setFrom(f);
                void setTo(t);
              }}
            />
            <Select value={game} onValueChange={(v) => void setGame(v || null)}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue placeholder="Tất cả game" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả game</SelectItem>
                {Object.values(GameProduct).map((gProd) => (
                  <SelectItem key={gProd} value={gProd}>
                    {GAME_LABELS[gProd as GameProduct] ?? gProd}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {isDrilling && (
          <Button variant="outline" size="sm" onClick={handleBackToList}>
            ← Quay lại
          </Button>
        )}
      </div>

      {/* Drill cấp 2: xem entries trong ngày × game */}
      {isDrilling ? (
        <PlayerFinancialEntriesView accountId={accountId} financialDate={fd!} game={gp!} />
      ) : (
        /* Bảng tổng hợp cấp 1 */
        <Card className="gap-0 py-0">
          <CardHeader className="px-5 pb-2 pt-4">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Chi tiết tài chính theo ngày</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0">
            <div className="overflow-hidden rounded-md border">
              {isLoading ? (
                <div className="space-y-0">
                  <div className="flex gap-4 border-b px-4 py-3">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <Skeleton key={i} className="h-3 flex-1" />
                    ))}
                  </div>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex gap-4 border-b px-4 py-3">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <Skeleton key={j} className="h-3 flex-1" />
                      ))}
                    </div>
                  ))}
                </div>
              ) : isError ? (
                <div className="flex h-[160px] items-center justify-center">
                  <p className="text-sm text-destructive">Không thể tải dữ liệu.</p>
                </div>
              ) : records.length === 0 ? (
                <div className="flex h-[160px] flex-col items-center justify-center gap-1 text-center">
                  <p className="text-sm font-medium text-muted-foreground">Chưa có dữ liệu</p>
                  <p className="text-xs text-muted-foreground">
                    Thử thay đổi khoảng thời gian hoặc bộ lọc game.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-24">Ngày</TableHead>
                      <TableHead className="w-24">Game</TableHead>
                      <TableHead className="text-right">Kỳ</TableHead>
                      <TableHead className="text-right">Đơn</TableHead>
                      <TableHead className="text-right">Settled</TableHead>
                      <TableHead className="text-right">W / V</TableHead>
                      <TableHead className="text-right">Tiền cược</TableHead>
                      <TableHead className="text-right">Trả thưởng</TableHead>
                      <TableHead className="text-right">GGR</TableHead>
                      <TableHead className="text-right">Hoa hồng</TableHead>
                      <TableHead className="text-right">Lợi nhuận</TableHead>
                      <TableHead className="w-6" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((row, idx) => {
                      const gProd = row.gameProduct;
                      const c = getGameColors(gProd);
                      const gameLabel = GAME_LABELS[gProd as GameProduct] ?? gProd;
                      return (
                        <TableRow
                          key={`${row.financialDate}-${gProd}-${idx}`}
                          className="h-10 cursor-pointer text-xs hover:bg-muted/50"
                          onClick={() => handleRowClick(row.financialDate, gProd)}
                        >
                          <TableCell className="tabular-nums text-muted-foreground">
                            {row.financialDate}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className={cn("inline-block size-2 rounded-full", c.twBg)} />
                              <span className="font-medium">{gameLabel}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(row.drawCount)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(row.entryCount)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(row.settledCount)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {formatNumber(row.winCount)}
                            </span>
                            {" / "}
                            <span className="text-muted-foreground">
                              {formatNumber(row.voidCount)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(row.totalStake)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(row.totalPayout)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right tabular-nums font-medium",
                              row.ggr < 0 ? "text-destructive" : "",
                            )}
                          >
                            {formatNumber(row.ggr)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatNumber(row.totalCommission)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right tabular-nums font-medium",
                              row.netProfit < 0 ? "text-destructive" : "",
                            )}
                          >
                            {formatNumber(row.netProfit)}
                          </TableCell>
                          <TableCell>
                            <ChevronRight className="size-3.5 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="h-10 text-xs font-semibold">
                      <TableCell colSpan={2}>TỔNG CỘNG</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(totals.drawCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(totals.entryCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(totals.settledCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {formatNumber(totals.winCount)}
                        </span>
                        {" / "}
                        <span className="text-muted-foreground">
                          {formatNumber(totals.voidCount)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(totals.totalStake)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(totals.totalPayout)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          totals.ggr < 0 ? "text-destructive" : "",
                        )}
                      >
                        {formatNumber(totals.ggr)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(totals.totalCommission)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          totals.netProfit < 0 ? "text-destructive" : "",
                        )}
                      >
                        {formatNumber(totals.netProfit)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

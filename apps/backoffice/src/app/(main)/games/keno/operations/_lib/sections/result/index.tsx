"use client";

/**
 * Keno – Result Section
 *
 * Kết quả + phân bổ giải thưởng sau khi draw published/settled.
 * Keno khác Mega 6/45:
 * - 20 số trúng (01-80)
 * - Không có PrizeTier enum → dùng pickCount × matchCount (basic) + side bets
 * - Có bigCount/smallCount/evenCount/oddCount (kết quả side bets)
 * - settleSummary: basicPrizes (pickCount × matchCount) + sideBetPrizes (playType × bet)
 * - Không có jackpot
 */

import { useMemo, useState } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KenoNumberBall } from "@/components/games/keno/keno-number-ball";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@megawin/shared/utils/number";
import {
  Trophy,
  TrendingDown,
  Users,
  Coins,
  ArrowDownRight,
  TrendingUp,
  ExternalLink,
  ChartNoAxesColumnIncreasing,
} from "lucide-react";

import { useDrawContext } from "../../use-draw-context";
import { useDrawDetail } from "../../use-operations";
import { WinningEntriesDialog } from "./winning-entries-dialog";

const RESULT_SHOW = new Set([DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled]);

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BasicPrizeRow {
  pickCount: number;
  matchCount: number;
  winnerCount: number;
  prizePerUnit: number;
  totalPrize: number;
}

interface SideBetPrizeRow {
  playType: string;
  bet: string;
  label: string;
  winnerCount: number;
  prizePerUnit: number;
  totalPrize: number;
}

interface KenoResultData {
  winningNumbers: string[];
  bigCount: number;
  smallCount: number;
  evenCount: number;
  oddCount: number;
  basicPrizes: BasicPrizeRow[];
  sideBetPrizes: SideBetPrizeRow[];
  financial: {
    totalRevenue: number;
    totalPrizes: number;
    totalAgentCommission: number;
    companyTake: number;
  };
}

// ─── Label helpers ─────────────────────────────────────────────────────────────

function basicPrizeLabel(pickCount: number, matchCount: number): string {
  return `Pick ${pickCount} — Trúng ${matchCount}`;
}

function sideBetLabel(playType: string, bet: string): string {
  const betLabels: Record<string, string> = {
    big: "Lớn (13+)",
    small: "Nhỏ (0-7)",
    bigSmallDraw: "Hoà (8-12)",
    even: "Chẵn",
    odd: "Lẻ",
    evenDraw: "Hoà chẵn/lẻ",
  };
  const typeLabel = playType === "bigSmall" ? "Lớn/Nhỏ" : "Chẵn/Lẻ";
  return `${typeLabel} — ${betLabels[bet] ?? bet}`;
}

// ─── Result + Prize Breakdown ─────────────────────────────────────────────────

function ResultAndPrize({ result, drawId }: { result: KenoResultData; drawId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const totalWinners =
    result.basicPrizes.reduce((a, r) => a + r.winnerCount, 0) +
    result.sideBetPrizes.reduce((a, r) => a + r.winnerCount, 0);
  const totalPrize = result.financial.totalPrizes;

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/50 shrink-0">
              <Trophy className="size-3.5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Kết quả & Phân bổ giải thưởng</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                <span className="font-semibold text-foreground tabular-nums">
                  {formatNumber(totalWinners)}
                </span>{" "}
                người trúng thưởng · Tổng giải{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatNumber(totalPrize)}
                </span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {/* Kết quả 20 số — có side bet stats */}
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className={cn(
              "group w-full flex flex-col items-center gap-3 rounded-xl border px-4 py-4",
              "transition-all duration-150 cursor-pointer bg-muted/20",
              "hover:shadow-sm hover:border-primary/30 hover:bg-muted/30",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                20 Số trúng
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 group-hover:text-primary/60 transition-colors">
                <ExternalLink className="size-3" />
                Xem entries trúng
              </span>
            </div>
            {/* Grid 4×5 = 20 số */}
            <div className="grid grid-cols-10 gap-1.5 w-full max-w-sm">
              {result.winningNumbers.slice(0, 20).map((n, i) => (
                <KenoNumberBall key={i} number={Number(n)} size="sm" />
              ))}
            </div>
            {/* Side bet stats */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Badge
                  variant="outline"
                  className="h-4.5 px-1.5 text-[10px] bg-red-50 text-red-600 border-red-200 dark:bg-red-950/20 dark:text-red-400"
                >
                  Lớn {result.bigCount}
                </Badge>
              </span>
              <span className="flex items-center gap-1">
                <Badge
                  variant="outline"
                  className="h-4.5 px-1.5 text-[10px] bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400"
                >
                  Nhỏ {result.smallCount}
                </Badge>
              </span>
              <span className="flex items-center gap-1">
                <Badge
                  variant="outline"
                  className="h-4.5 px-1.5 text-[10px] bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400"
                >
                  Chẵn {result.evenCount}
                </Badge>
              </span>
              <span className="flex items-center gap-1">
                <Badge
                  variant="outline"
                  className="h-4.5 px-1.5 text-[10px] bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400"
                >
                  Lẻ {result.oddCount}
                </Badge>
              </span>
            </div>
          </button>

          {/* Basic prizes table */}
          {result.basicPrizes.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <div className="grid grid-cols-[1fr_5rem_7rem_7rem] gap-x-2 px-3 py-2 bg-muted/40 border-b">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Cơ bản (Pick × Trúng)
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Boards
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Tiền/board
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Tổng giải
                </span>
              </div>

              {result.basicPrizes.map((r, idx) => (
                <div
                  key={`${r.pickCount}-${r.matchCount}`}
                  className={cn(
                    "grid grid-cols-[1fr_5rem_7rem_7rem] gap-x-2 px-3 py-2.5 items-center",
                    idx < result.basicPrizes.length - 1 && "border-b border-border/50",
                    r.winnerCount > 0 ? "bg-orange-50/40 dark:bg-orange-950/5" : "",
                  )}
                >
                  <span className="text-xs text-muted-foreground">
                    {basicPrizeLabel(r.pickCount, r.matchCount)}
                  </span>
                  <span
                    className={cn(
                      "text-right tabular-nums text-sm font-semibold",
                      r.winnerCount > 0
                        ? "text-orange-700 dark:text-orange-400"
                        : "text-muted-foreground/30",
                    )}
                  >
                    {r.winnerCount > 0 ? formatNumber(r.winnerCount) : "—"}
                  </span>
                  <span
                    className={cn(
                      "text-right tabular-nums text-sm",
                      r.winnerCount > 0 ? "text-muted-foreground" : "text-muted-foreground/30",
                    )}
                  >
                    {r.prizePerUnit > 0 && r.winnerCount > 0 ? formatNumber(r.prizePerUnit) : "—"}
                  </span>
                  <span
                    className={cn(
                      "text-right tabular-nums text-sm font-bold",
                      r.totalPrize > 0 ? "text-foreground" : "text-muted-foreground/30",
                    )}
                  >
                    {r.totalPrize > 0 ? formatNumber(r.totalPrize) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Side bet prizes table */}
          {result.sideBetPrizes.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <div className="grid grid-cols-[1fr_5rem_7rem_7rem] gap-x-2 px-3 py-2 bg-muted/40 border-b">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Side Bets
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Bets
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Tiền/bet
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Tổng giải
                </span>
              </div>

              {result.sideBetPrizes.map((r, idx) => (
                <div
                  key={`${r.playType}-${r.bet}`}
                  className={cn(
                    "grid grid-cols-[1fr_5rem_7rem_7rem] gap-x-2 px-3 py-2.5 items-center",
                    idx < result.sideBetPrizes.length - 1 && "border-b border-border/50",
                    r.winnerCount > 0 ? "bg-cyan-50/40 dark:bg-cyan-950/5" : "",
                  )}
                >
                  <span className="text-xs text-muted-foreground">{r.label}</span>
                  <span
                    className={cn(
                      "text-right tabular-nums text-sm font-semibold",
                      r.winnerCount > 0
                        ? "text-cyan-700 dark:text-cyan-400"
                        : "text-muted-foreground/30",
                    )}
                  >
                    {r.winnerCount > 0 ? formatNumber(r.winnerCount) : "—"}
                  </span>
                  <span
                    className={cn(
                      "text-right tabular-nums text-sm",
                      r.winnerCount > 0 ? "text-muted-foreground" : "text-muted-foreground/30",
                    )}
                  >
                    {r.prizePerUnit > 0 && r.winnerCount > 0 ? formatNumber(r.prizePerUnit) : "—"}
                  </span>
                  <span
                    className={cn(
                      "text-right tabular-nums text-sm font-bold",
                      r.totalPrize > 0 ? "text-foreground" : "text-muted-foreground/30",
                    )}
                  >
                    {r.totalPrize > 0 ? formatNumber(r.totalPrize) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <WinningEntriesDialog drawId={drawId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

// ─── Financial Summary (Keno — không có Jackpot) ─────────────────────────────

function FinancialSummary({ financial: f }: { financial: KenoResultData["financial"] }) {
  const netAfterAll = f.totalRevenue - f.totalAgentCommission - f.totalPrizes - f.companyTake;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50 shrink-0">
            <Coins className="size-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Tài chính kỳ</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Phân bổ doanh thu sau kết sổ
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-2">
        {[
          {
            icon: TrendingUp,
            iconBg: "bg-orange-100 dark:bg-orange-900/50",
            iconColor: "text-orange-600 dark:text-orange-400",
            label: "Doanh thu gộp",
            value: f.totalRevenue,
            sign: "+" as const,
            valueColor: "text-orange-700 dark:text-orange-400",
            bold: true,
          },
          {
            icon: Users,
            iconBg: "bg-slate-100 dark:bg-slate-800",
            iconColor: "text-slate-500 dark:text-slate-400",
            label: "Hoa hồng đại lý",
            value: f.totalAgentCommission,
            sign: "-" as const,
            valueColor: "text-destructive",
          },
          {
            icon: Trophy,
            iconBg: "bg-amber-100 dark:bg-amber-900/50",
            iconColor: "text-amber-600 dark:text-amber-400",
            label: "Chi trả giải thưởng",
            value: f.totalPrizes,
            sign: "-" as const,
            valueColor: "text-destructive",
          },
          ...(f.companyTake > 0
            ? [
                {
                  icon: Coins,
                  iconBg: "bg-slate-100 dark:bg-slate-800",
                  iconColor: "text-slate-500 dark:text-slate-400",
                  label: "Công ty thu",
                  value: f.companyTake,
                  sign: "-" as const,
                  valueColor: "text-destructive",
                },
              ]
            : []),
          {
            icon: ArrowDownRight,
            iconBg: "bg-blue-100 dark:bg-blue-900/50",
            iconColor: "text-blue-600 dark:text-blue-400",
            label: "Thu thuần",
            value: netAfterAll,
            sign: "=" as const,
            valueColor: netAfterAll >= 0 ? "text-blue-700 dark:text-blue-400" : "text-destructive",
            bold: true,
            separator: true,
          },
        ].map((row) => (
          <div
            key={row.label}
            className={cn(
              "flex items-center justify-between gap-3 py-2",
              row.separator && "border-t border-border/60 mt-1 pt-3",
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={cn(
                  "flex size-6 items-center justify-center rounded-md shrink-0",
                  row.iconBg,
                )}
              >
                <row.icon className={cn("size-3.5", row.iconColor)} />
              </div>
              <span
                className={cn(
                  "text-sm",
                  row.bold ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {row.label}
              </span>
            </div>
            <span
              className={cn(
                "tabular-nums text-sm font-mono shrink-0",
                row.bold ? "font-bold" : "",
                row.valueColor,
              )}
            >
              {row.sign !== "=" ? row.sign : ""}
              {formatNumber(row.value)}
            </span>
          </div>
        ))}

        {/* Note: Keno không có Jackpot pool */}
        <div className="mt-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <ChartNoAxesColumnIncreasing className="size-3.5 text-orange-500 shrink-0" />
            <span className="text-[11px] text-muted-foreground">
              Keno không có Jackpot tích luỹ. Toàn bộ giải thưởng trả ngay theo bảng giải cố định.
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── ResultSection ─────────────────────────────────────────────────────────────

export function ResultSection() {
  const { draw, effectiveDrawId } = useDrawContext();

  const shouldFetch = draw && RESULT_SHOW.has(draw.status as any);
  const { data: drawDetailData } = useDrawDetail(shouldFetch ? effectiveDrawId : undefined);

  const result: KenoResultData | undefined = useMemo(() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;

    const basicPrizes: BasicPrizeRow[] = (d.settleSummary?.basicPrizes ?? []).map((r: any) => ({
      pickCount: r.pickCount as number,
      matchCount: r.matchCount as number,
      winnerCount: r.winnerCount as number,
      prizePerUnit: r.prizePerUnit as number,
      totalPrize: (r.winnerCount as number) * (r.prizePerUnit as number),
    }));

    const sideBetPrizes: SideBetPrizeRow[] = (d.settleSummary?.sideBetPrizes ?? []).map(
      (r: any) => ({
        playType: r.playType as string,
        bet: r.bet as string,
        label: sideBetLabel(r.playType, r.bet),
        winnerCount: r.winnerCount as number,
        prizePerUnit: r.prizePerUnit as number,
        totalPrize: (r.winnerCount as number) * (r.prizePerUnit as number),
      }),
    );

    return {
      winningNumbers: d.result.winningNumbers ?? [],
      bigCount: d.result.bigCount ?? 0,
      smallCount: d.result.smallCount ?? 0,
      evenCount: d.result.evenCount ?? 0,
      oddCount: d.result.oddCount ?? 0,
      basicPrizes,
      sideBetPrizes,
      financial: {
        totalRevenue: d.financial?.totalRevenue ?? 0,
        totalPrizes: d.financial?.totalPrizes ?? 0,
        totalAgentCommission: d.financial?.totalAgentCommission ?? 0,
        companyTake: d.financial?.companyTake ?? 0,
      },
    };
  }, [drawDetailData]);

  if (!draw || !RESULT_SHOW.has(draw.status as any) || !result) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Kết quả & Tài chính
      </h2>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <ResultAndPrize result={result} drawId={effectiveDrawId} />
        <FinancialSummary financial={result.financial} />
      </div>
    </section>
  );
}

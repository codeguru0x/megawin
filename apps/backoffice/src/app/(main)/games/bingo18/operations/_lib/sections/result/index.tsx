"use client";

/**
 * Bingo 18 – Result Section
 *
 * Kết quả + phân bổ giải thưởng sau khi draw published/settled.
 * Bingo 18 khác Keno:
 * - Kết quả: 3 xúc xắc (1-6) + tổng 3-18
 * - Không có PrizeTier enum riêng → dùng playType + matchConfig
 * - settleSummary.prizes[]: cả cơ bản và bổ sung, UI filter theo playType
 * - Không có jackpot, không có payout caps
 * - profit = totalRevenue - totalPrizes - totalAgentCommission
 */

import { useMemo, useState } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import {
  Bingo18PlayType,
  BINGO18_BASIC_PLAY_TYPE_SET,
  BINGO18_SIDE_BET_PLAY_TYPE_SET,
} from "@megawin/game-bingo18/entities";
import {
  BINGO18_PLAY_TYPE_LABELS,
  BINGO18_TRIPLE_KIND_LABELS,
} from "@megawin/game-bingo18/labels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@megawin/shared/utils";
import {
  Trophy,
  TrendingDown,
  Users,
  Coins,
  TrendingUp,
  ExternalLink,
  ChartNoAxesColumnIncreasing,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DiceDisplay } from "@/components/games/bingo18/dice-display";

import { useDrawContext } from "../../use-draw-context";
import { useDrawDetail } from "../../use-operations";
import { WinningEntriesDialog } from "./winning-entries-dialog";

const RESULT_SHOW = new Set([DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled]);

// ─── Types ──────────────────────────────────────────────────────────────────────

interface BoardPrizeRow {
  playType: string;
  label: string;
  winnerCount: number;
  prizePerUnit: number;
  totalPrize: number;
}

interface SideBetPrizeRow {
  playType: string;
  result: string;
  label: string;
  winnerCount: number;
  prizePerUnit: number;
  totalPrize: number;
}

interface Bingo18ResultData {
  diceNumbers: number[];
  sum: number;
  boardPrizes: BoardPrizeRow[];
  sideBetPrizes: SideBetPrizeRow[];
  financial: {
    totalRevenue: number;
    totalPrizes: number;
    totalAgentCommission: number;
  };
}

// ─── Label helpers ──────────────────────────────────────────────────────────────

const BOARD_PRIZE_LABELS: Record<string, string> = {
  [Bingo18PlayType.SingleNum]: `${BINGO18_PLAY_TYPE_LABELS[Bingo18PlayType.SingleNum]} — Trúng`,
  [Bingo18PlayType.DoubleMatch]: `${BINGO18_PLAY_TYPE_LABELS[Bingo18PlayType.DoubleMatch]} — Trúng`,
  "tripleMatch-specific": `${BINGO18_TRIPLE_KIND_LABELS["specific"]} — Trúng`,
  "tripleMatch-any": `${BINGO18_TRIPLE_KIND_LABELS["any"]} — Trúng`,
};

const SIDE_BET_RESULT_LABELS: Record<string, string> = {
  big: "Lớn (11-18)",
  small: "Nhỏ (3-10)",
  draw: "Hoà",
};

// ─── Result + Prize ──────────────────────────────────────────────────────────────

function ResultAndPrize({ result, drawId }: { result: Bingo18ResultData; drawId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const totalWinners =
    result.boardPrizes.reduce((a, r) => a + r.winnerCount, 0) +
    result.sideBetPrizes.reduce((a, r) => a + r.winnerCount, 0);

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50 shrink-0">
              <Trophy className="size-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Kết quả & Phân bổ giải thưởng</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                <span className="font-semibold text-foreground tabular-nums">
                  {formatNumber(totalWinners)}
                </span>{" "}
                người trúng thưởng · Tổng giải{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatNumber(result.financial.totalPrizes)}
                </span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {/* Dice Result */}
          <div className="rounded-xl border bg-muted/20 px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex-1" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Kết quả
              </span>
              <div className="flex-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary/70 transition-colors"
                >
                  <ExternalLink className="size-3" />
                  Xem entries trúng
                </button>
              </div>
            </div>
            <div className="flex justify-center">
              <DiceDisplay numbers={result.diceNumbers} size="lg" showSum />
            </div>
          </div>

          {/* Board prizes */}
          {result.boardPrizes.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <div className="grid grid-cols-[1fr_5rem_7rem_7rem] gap-x-2 px-3 py-2 bg-muted/40 border-b">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Boards
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Trúng
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Tiền/board
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Tổng giải
                </span>
              </div>
              {result.boardPrizes.map((r, idx) => (
                <div
                  key={`${r.playType}-${idx}`}
                  className={cn(
                    "grid grid-cols-[1fr_5rem_7rem_7rem] gap-x-2 px-3 py-2.5 items-center",
                    idx < result.boardPrizes.length - 1 && "border-b border-border/50",
                    r.winnerCount > 0 ? "bg-amber-50/40 dark:bg-amber-950/5" : "",
                  )}
                >
                  <span className="text-xs text-muted-foreground">{r.label}</span>
                  <span
                    className={cn(
                      "text-right tabular-nums text-sm font-semibold",
                      r.winnerCount > 0
                        ? "text-amber-700 dark:text-amber-400"
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

          {/* Side bet prizes */}
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
                  key={`${r.playType}-${r.result}-${idx}`}
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

// ─── Financial Summary ───────────────────────────────────────────────────────────

function FinancialSummary({ financial: f }: { financial: Bingo18ResultData["financial"] }) {
  // profit = revenue - commission - prizes (Bingo 18 không có companyRate)
  const profit = f.totalRevenue - f.totalAgentCommission - f.totalPrizes;

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
            iconBg: "bg-amber-100 dark:bg-amber-900/50",
            iconColor: "text-amber-600 dark:text-amber-400",
            label: "Doanh thu gộp",
            value: f.totalRevenue,
            sign: "+" as const,
            valueColor: "text-amber-700 dark:text-amber-400",
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
          {
            icon: TrendingDown,
            iconBg: "bg-blue-100 dark:bg-blue-900/50",
            iconColor: "text-blue-600 dark:text-blue-400",
            label: "Lợi nhuận thuần",
            value: profit,
            sign: "=" as const,
            valueColor: profit >= 0 ? "text-blue-700 dark:text-blue-400" : "text-destructive",
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

        {/* Note: Bingo 18 không có Jackpot pool, không có companyRate */}
        <div className="mt-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <ChartNoAxesColumnIncreasing className="size-3.5 text-amber-500 shrink-0" />
            <span className="text-[11px] text-muted-foreground">
              Bingo 18 không có Jackpot. Giải thưởng trả ngay theo bảng giải cố định sau mỗi kỳ.
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── ResultSection ─────────────────────────────────────────────────────────────────

export function ResultSection() {
  const { draw, effectiveDrawId } = useDrawContext();

  const shouldFetch = draw && RESULT_SHOW.has(draw.status as any);
  const { data: drawDetailData } = useDrawDetail(shouldFetch ? effectiveDrawId : undefined);

  const result: Bingo18ResultData | undefined = useMemo(() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;
    const r = d.result as any;

    // settleSummary.prizes[] chứa cả cơ bản và bổ sung, filter theo playType
    const allPrizes: any[] = (d.settleSummary as any)?.prizes ?? [];

    // Build boardPrizes từ prizes thuộc basic playType
    const boardPrizes: BoardPrizeRow[] = allPrizes
      .filter((row: any) => BINGO18_BASIC_PLAY_TYPE_SET.has(row.playType))
      .map((row: any) => {
        const key =
          row.playType === "tripleMatch" ? `tripleMatch-${row.tripleKind ?? "any"}` : row.playType;
        return {
          playType: key,
          label: BOARD_PRIZE_LABELS[key] ?? row.playType,
          winnerCount: row.winnerCount as number,
          prizePerUnit: row.prizePerUnit as number,
          totalPrize: (row.winnerCount as number) * (row.prizePerUnit as number),
        };
      });

    // Build sideBetPrizes từ prizes thuộc side bet playType
    const sideBetPrizes: SideBetPrizeRow[] = allPrizes
      .filter((row: any) => BINGO18_SIDE_BET_PLAY_TYPE_SET.has(row.playType))
      .map((row: any) => {
        const playTypeLabel =
          row.playType === "sumTotal"
            ? `Tổng điểm ${row.sum ?? ""}`
            : `Lớn/Nhỏ — ${SIDE_BET_RESULT_LABELS[row.bet] ?? row.bet}`;
        return {
          playType: row.playType as string,
          result: (row.sum?.toString() ?? row.bet ?? "") as string,
          label: playTypeLabel,
          winnerCount: row.winnerCount as number,
          prizePerUnit: row.prizePerUnit as number,
          totalPrize: (row.winnerCount as number) * (row.prizePerUnit as number),
        };
      });

    return {
      diceNumbers: r.diceNumbers ?? [],
      sum: r.sum ?? 0,
      boardPrizes,
      sideBetPrizes,
      financial: {
        totalRevenue: (d.financial as any)?.totalRevenue ?? 0,
        totalPrizes: (d.financial as any)?.totalPrizes ?? 0,
        totalAgentCommission: (d.financial as any)?.totalAgentCommission ?? 0,
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

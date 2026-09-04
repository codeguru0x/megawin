"use client";

/**
 * Bingo 18 – Result Section
 *
 * Kết quả + phân bổ giải thưởng sau khi draw published/settled.
 * Bingo 18 khác Keno:
 * - Kết quả: 3 xúc xắc (1-6) + tổng 3-18
 * - Không có PrizeTier enum riêng → dùng playType + matchConfig
 * - settleSummary.prizes[]: cả cơ bản và bổ sung, UI filter theo playType
 * - Không có Jackpot / snapshot jackpot trên draw, không có payout caps
 * - profit = totalRevenue - totalPrizes - totalAgentCommission
 *
 * Tài chính kỳ: CHỈ map khi `draw.financial` có mặt (đã settle). Sau republish,
 * financial bị $unset — không render ledger toàn 0 giả tạo.
 */

import { useMemo, useState } from "react";

import {
  BINGO18_BASIC_PLAY_TYPE_SET,
  BINGO18_SIDE_BET_PLAY_TYPE_SET,
  Bingo18PlayType,
} from "@megawin/game-bingo18/entities";
import { BINGO18_PLAY_TYPE_LABELS, BINGO18_TRIPLE_KIND_LABELS } from "@megawin/game-bingo18/labels";
import { DrawStatus } from "@megawin/game-core/entities";
import { formatNumber } from "@megawin/shared/utils";
import { Coins, ExternalLink, Info, TrendingDown, TrendingUp, Trophy, Users } from "lucide-react";

import { DiceDisplay } from "@/components/games/bingo18/dice-display";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
  /** Chỉ có sau settle; undefined khi Published chờ kết sổ / chờ kết sổ lại. */
  financial?: {
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
  big: "Lớn (12-18)",
  small: "Nhỏ (3-9)",
  draw: "Hoà (10-11)",
};

// ─── Dice stats helpers ──────────────────────────────────────────────────────

/** Xác định kết quả Lớn/Nhỏ/Hoà dựa vào tổng. */
function getBigSmallResult(sum: number): "big" | "small" | "draw" {
  if (sum <= 9) return "small";
  if (sum >= 12) return "big";
  return "draw";
}

/** Kiểm tra có đôi (≥2 số giống nhau) không. */
function hasDouble(nums: number[]): boolean {
  const counts = nums.reduce<Record<number, number>>((acc, n) => {
    acc[n] = (acc[n] ?? 0) + 1;
    return acc;
  }, {});
  return Object.values(counts).some((c) => c >= 2);
}

/** Kiểm tra có ba giống nhau không. */
function hasTriple(nums: number[]): boolean {
  return nums.length === 3 && nums[0] === nums[1] && nums[1] === nums[2];
}

// ─── DiceStat Badge ──────────────────────────────────────────────────────────

function DiceStatBadge({
  label,
  sublabel,
  active,
  colorClass,
  activeClass,
}: {
  label: string;
  sublabel?: string;
  active: boolean;
  colorClass: string;
  activeClass: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all duration-150",
        active ? cn("shadow-sm ring-1 ring-offset-1", activeClass) : colorClass,
      )}
    >
      {label}
      {sublabel && (
        <span
          className={cn(
            "rounded-full px-1 py-0 text-[10px] font-bold tabular-nums min-w-[1.2rem] text-center",
            active ? "bg-white/30" : "bg-current/10 opacity-80",
          )}
        >
          {sublabel}
        </span>
      )}
    </div>
  );
}

// ─── Result + Prize ──────────────────────────────────────────────────────────────

function ResultAndPrize({ result, drawId }: { result: Bingo18ResultData; drawId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const totalWinners =
    result.boardPrizes.reduce((a, r) => a + r.winnerCount, 0) +
    result.sideBetPrizes.reduce((a, r) => a + r.winnerCount, 0);
  // Ưu tiên financial.totalPrizes sau settle; khi chờ kết sổ lại (financial $unset)
  // cộng từ prize rows (settleSummary cũng empty → 0).
  const totalPrize =
    result.financial?.totalPrizes ??
    result.boardPrizes.reduce((a, r) => a + r.totalPrize, 0) +
      result.sideBetPrizes.reduce((a, r) => a + r.totalPrize, 0);

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
                <span className="font-semibold text-foreground tabular-nums">{formatNumber(totalWinners)}</span> người
                trúng thưởng · Tổng giải{" "}
                <span className="font-semibold text-foreground tabular-nums">{formatNumber(totalPrize)}</span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {/* Dice Result */}
          <div className="rounded-xl border bg-muted/20 px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex-1" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Kết quả</span>
              <div className="flex-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary/70 transition-colors cursor-pointer"
                >
                  <ExternalLink className="size-3" />
                  Phiếu cược trúng thưởng
                </button>
              </div>
            </div>
            <div className="flex justify-center">
              <DiceDisplay numbers={result.diceNumbers} size="md" showSum />
            </div>

            {/* Stats badges — Lớn/Nhỏ/Hoà + phân tích đôi/ba */}
            {result.diceNumbers.length === 3 && (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {/* Badge Lớn / Nhỏ / Hoà */}
                {(() => {
                  const bsResult = getBigSmallResult(result.sum);
                  return (
                    <>
                      <DiceStatBadge
                        label="Nhỏ (3-9)"
                        active={bsResult === "small"}
                        colorClass="bg-blue-50/70 text-blue-400 border-blue-200/70 dark:bg-blue-950/10 dark:text-blue-500/70 dark:border-blue-900/50"
                        activeClass="bg-amber-500 text-white border-amber-500 dark:bg-amber-500 ring-amber-400"
                      />
                      <DiceStatBadge
                        label="Hoà (10-11)"
                        active={bsResult === "draw"}
                        colorClass="bg-slate-50/70 text-slate-400 border-slate-200/70 dark:bg-slate-950/10 dark:text-slate-500/70 dark:border-slate-900/50"
                        activeClass="bg-amber-500 text-white border-amber-500 dark:bg-amber-500 ring-amber-400"
                      />
                      <DiceStatBadge
                        label="Lớn (12-18)"
                        active={bsResult === "big"}
                        colorClass="bg-red-50/70 text-red-400 border-red-200/70 dark:bg-red-950/10 dark:text-red-500/70 dark:border-red-900/50"
                        activeClass="bg-amber-500 text-white border-amber-500 dark:bg-amber-500 ring-amber-400"
                      />
                    </>
                  );
                })()}

                {/* Separator */}
                <span className="text-border/80 select-none">·</span>

                {/* Badge đôi / ba */}
                {hasTriple(result.diceNumbers) ? (
                  <DiceStatBadge
                    label="Ba giống nhau"
                    sublabel={String(result.diceNumbers[0])}
                    active
                    colorClass=""
                    activeClass="bg-amber-500 text-white border-amber-500 dark:bg-amber-500 ring-amber-400"
                  />
                ) : hasDouble(result.diceNumbers) ? (
                  <DiceStatBadge
                    label="Có đôi"
                    active
                    colorClass=""
                    activeClass="bg-amber-500/80 text-white border-amber-400 dark:bg-amber-500/80 ring-amber-300"
                  />
                ) : (
                  <DiceStatBadge
                    label="Tất cả khác nhau"
                    active={false}
                    colorClass="bg-muted/60 text-muted-foreground/50 border-border/50"
                    activeClass=""
                  />
                )}
              </div>
            )}
          </div>

          {/* Board prizes */}
          {result.boardPrizes.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <div className="grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2 bg-muted/40 border-b">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Boards</span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Trúng
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Giá trị thưởng
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Tổng thưởng
                </span>
              </div>
              {result.boardPrizes.map((r, idx) => (
                <div
                  key={`${r.playType}-${idx}`}
                  className={cn(
                    "grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2.5 items-center",
                    idx < result.boardPrizes.length - 1 && "border-b border-border/50",
                    r.winnerCount > 0 ? "bg-amber-50/40 dark:bg-amber-950/5" : "",
                  )}
                >
                  <span className="text-xs text-muted-foreground">{r.label}</span>
                  <span
                    className={cn(
                      "text-right tabular-nums text-sm font-semibold",
                      r.winnerCount > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground/40",
                    )}
                  >
                    {formatNumber(r.winnerCount)}
                  </span>
                  <span
                    className={cn(
                      "text-right tabular-nums text-sm",
                      r.winnerCount > 0 ? "text-muted-foreground" : "text-muted-foreground/40",
                    )}
                  >
                    {formatNumber(r.prizePerUnit)}
                  </span>
                  <span
                    className={cn(
                      "text-right tabular-nums text-sm font-bold",
                      r.totalPrize > 0 ? "text-foreground" : "text-muted-foreground/40",
                    )}
                  >
                    {formatNumber(r.totalPrize)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Side bet prizes */}
          {result.sideBetPrizes.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <div className="grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2 bg-muted/40 border-b">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Side Bets
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Bets
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Giá trị thưởng
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Tổng thưởng
                </span>
              </div>
              {result.sideBetPrizes.map((r, idx) => (
                <div
                  key={`${r.playType}-${r.result}-${idx}`}
                  className={cn(
                    "grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2.5 items-center",
                    idx < result.sideBetPrizes.length - 1 && "border-b border-border/50",
                    r.winnerCount > 0 ? "bg-cyan-50/40 dark:bg-cyan-950/5" : "",
                  )}
                >
                  <span className="text-xs text-muted-foreground">{r.label}</span>
                  <span
                    className={cn(
                      "text-right tabular-nums text-sm font-semibold",
                      r.winnerCount > 0 ? "text-cyan-700 dark:text-cyan-400" : "text-muted-foreground/40",
                    )}
                  >
                    {formatNumber(r.winnerCount)}
                  </span>
                  <span
                    className={cn(
                      "text-right tabular-nums text-sm",
                      r.winnerCount > 0 ? "text-muted-foreground" : "text-muted-foreground/40",
                    )}
                  >
                    {formatNumber(r.prizePerUnit)}
                  </span>
                  <span
                    className={cn(
                      "text-right tabular-nums text-sm font-bold",
                      r.totalPrize > 0 ? "text-foreground" : "text-muted-foreground/40",
                    )}
                  >
                    {formatNumber(r.totalPrize)}
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

// ─── Financial Summary (Bingo 18 — không có Jackpot) ─────────────────────────

function FinancialSummary({
  financial: f,
  awaitingResettle = false,
}: {
  financial?: Bingo18ResultData["financial"];
  /** true khi Published sau khi đã từng settle (republish). */
  awaitingResettle?: boolean;
}) {
  // Chưa có financial (publish lần đầu hoặc sau republish $unset) —
  // KHÔNG render ledger toàn 0. Bingo 18 không có snapshot Jackpot trên draw.
  if (!f) {
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
                {awaitingResettle ? "Chờ kết sổ lại" : "Chờ kết sổ"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-0">
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-5 space-y-2">
            <p className="text-sm font-medium text-foreground">
              {awaitingResettle ? "Kỳ đang chờ kết sổ lại" : "Kỳ đang chờ kết sổ"}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Số liệu tài chính sẽ cập nhật sau khi kết sổ hoàn tất. KPI cược phía trên phản ánh số liệu live — không
              phải báo cáo phân bổ doanh thu kỳ này.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Bingo 18 KHÔNG có quỹ Jackpot và không có companyRate riêng → không có khoản trích quỹ:
  //   Doanh thu − Hoa hồng − Giải thưởng = Kết quả công ty (P&L kỳ).
  // Có thể ÂM khi chi trả giải vượt doanh thu (trúng Ba giống nhau / nhiều side bets cùng lúc).
  const profit = f.totalRevenue - f.totalAgentCommission - f.totalPrizes;
  const isProfit = profit >= 0;

  const resultHint = isProfit
    ? "Bingo 18 không có quỹ Jackpot — công ty giữ toàn bộ phần dư sau hoa hồng và giải thưởng."
    : "Chi trả giải vượt doanh thu — công ty bù phần thiếu. Bingo 18 không có quỹ Jackpot nên toàn bộ chênh lệch tính thẳng vào P&L kỳ.";

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50 shrink-0">
            <Coins className="size-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Tài chính kỳ</CardTitle>
            <CardDescription className="text-xs mt-0.5">Phân bổ doanh thu sau kết sổ</CardDescription>
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
            // Dòng input gốc → trung tính, chỉ khoản trừ & lợi nhuận mới có màu ngữ nghĩa
            sign: "+" as const,
            valueColor: "text-foreground",
            bold: true,
          },
          {
            icon: Users,
            iconBg: "bg-slate-100 dark:bg-slate-800",
            iconColor: "text-slate-500 dark:text-slate-400",
            label: "Hoa hồng đại lý",
            value: f.totalAgentCommission,
            // Khoản chi bình thường → muted (không dùng destructive để tránh "báo động giả")
            sign: "-" as const,
            valueColor: "text-muted-foreground",
            indent: true,
          },
          {
            icon: Trophy,
            iconBg: "bg-amber-100 dark:bg-amber-900/50",
            iconColor: "text-amber-600 dark:text-amber-400",
            label: "Chi trả giải thưởng",
            value: f.totalPrizes,
            sign: "-" as const,
            valueColor: "text-muted-foreground",
            indent: true,
            hint: "Gồm cả board cơ bản (Chọn số, Cặp đôi, Ba giống nhau) và side bets (Tổng điểm, Lớn/Nhỏ/Hoà).",
          },
          {
            icon: isProfit ? TrendingUp : TrendingDown,
            iconBg: isProfit ? "bg-emerald-100 dark:bg-emerald-900/50" : "bg-red-100 dark:bg-red-900/50",
            iconColor: isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
            label: "Kết quả công ty (P&L kỳ)",
            value: profit,
            sign: "=" as const,
            valueColor: isProfit ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
            bold: true,
            separator: true,
            hint: resultHint,
          },
        ].map((row) => {
          // Giá trị 0 là trung tính (không phải khoản chi) → bỏ dấu +/− và ép màu muted,
          // tránh hiển thị "−0" đỏ gây nhiễu. Riêng dòng kết quả (sign "=") giữ nguyên logic màu.
          const isZeroDeduction = row.value === 0 && row.sign !== "=";
          const displaySign = isZeroDeduction ? "" : row.sign;
          const displayColor = isZeroDeduction ? "text-muted-foreground" : row.valueColor;

          return (
            <div
              key={row.label}
              className={cn(
                "flex items-center justify-between gap-3 py-2",
                row.separator && "border-t border-border/60 mt-1 pt-3",
                row.indent && "pl-5",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={cn("flex size-6 items-center justify-center rounded-md shrink-0", row.iconBg)}>
                  <row.icon className={cn("size-3.5", row.iconColor)} />
                </div>
                <span className={cn("text-sm", row.bold ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {row.label}
                </span>
                {row.hint && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-help"
                        aria-label={`Giải thích ${row.label}`}
                      >
                        <Info className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64">{row.hint}</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <span
                className={cn("tabular-nums text-sm font-mono shrink-0", row.bold ? "font-bold" : "", displayColor)}
              >
                {displaySign !== "=" ? displaySign : ""}
                {formatNumber(row.value)}
              </span>
            </div>
          );
        })}

        {/* Cảnh báo khi kỳ lỗ — Bingo 18 có thể âm khi chi trả giải vượt doanh thu */}
        {!isProfit && (
          <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/20 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <TrendingDown className="size-3.5 text-red-600 dark:text-red-400 shrink-0" />
              <span className="text-xs text-red-700 dark:text-red-300">
                Kỳ này chi trả vượt doanh thu — kiểm tra các entry trúng giải lớn.
              </span>
            </div>
          </div>
        )}
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
        const key = row.playType === "tripleMatch" ? `tripleMatch-${row.tripleKind ?? "any"}` : row.playType;
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
      diceNumbers: r.numbers ?? r.diceNumbers ?? [],
      sum: r.sum ?? 0,
      boardPrizes,
      sideBetPrizes,
      // Chỉ map khi đã settle — tránh ledger giả toàn 0 sau republish ($unset financial).
      financial: d.financial
        ? {
            totalRevenue: d.financial.totalRevenue,
            totalPrizes: d.financial.totalPrizes,
            totalAgentCommission: d.financial.totalAgentCommission,
          }
        : undefined,
    };
  }, [drawDetailData]);

  if (!draw || !RESULT_SHOW.has(draw.status as any) || !result) {
    return null;
  }

  // Published + đã từng settle → chờ kết sổ lại; Published lần đầu → chờ kết sổ.
  const awaitingResettle = draw.status === DrawStatus.Published && !!draw.settledAt;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Kết quả & Tài chính</h2>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <ResultAndPrize result={result} drawId={effectiveDrawId} />
        <FinancialSummary financial={result.financial} awaitingResettle={awaitingResettle} />
      </div>
    </section>
  );
}

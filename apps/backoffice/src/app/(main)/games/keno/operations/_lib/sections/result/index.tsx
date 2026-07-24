"use client";

/**
 * Keno – Result Section
 *
 * Kết quả + phân bổ giải thưởng sau khi draw published/settled.
 * Keno khác Mega 6/45:
 * - 20 số trúng (01-80)
 * - Không có PrizeTier enum → dùng pickCount × matchCount (basic) + side bets
 * - Có bigCount/smallCount/evenCount/oddCount (kết quả side bets)
 * - settleSummary.prizes[]: unified cho cả cơ bản và bổ sung, phân biệt qua pickCount != null (basic) / bet defined (side bet)
 * - Không có jackpot
 */

import { useMemo, useState } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@megawin/shared/utils";
import { Trophy, TrendingDown, Users, Coins, TrendingUp, ExternalLink, Info } from "lucide-react";

import { useDrawContext } from "../../use-draw-context";
import { useDrawDetail } from "../../use-operations";
import { WinningEntriesDialog } from "./winning-entries-dialog";
import { KENO_BIG_SMALL_BET_LABELS, KENO_EVEN_ODD_BET_LABELS } from "@megawin/game-keno/labels";

const RESULT_SHOW = new Set([DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled]);

// ─── Merged bet labels (bigSmall + evenOdd) ───────────────────────────────────

const KENO_BET_LABELS: Record<string, string> = {
  ...KENO_BIG_SMALL_BET_LABELS,
  ...KENO_EVEN_ODD_BET_LABELS,
};

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
  const typeLabel = playType === "bigSmall" ? "Lớn/Nhỏ" : "Chẵn/Lẻ";
  return `${typeLabel} — ${KENO_BET_LABELS[bet] ?? bet}`;
}

// ─── Highlight filter type ───────────────────────────────────────────────────

type HighlightFilter = "big" | "small" | "even" | "odd" | null;

// Lớn: 41-80, Nhỏ: 1-40, Chẵn: số chẵn, Lẻ: số lẻ
function getNumberHighlight(n: number, filter: HighlightFilter): "match" | "dim" | "none" {
  if (!filter) return "none";
  const isBig = n >= 41;
  const isEven = n % 2 === 0;
  if (filter === "big") return isBig ? "match" : "dim";
  if (filter === "small") return !isBig ? "match" : "dim";
  if (filter === "even") return isEven ? "match" : "dim";
  if (filter === "odd") return !isEven ? "match" : "dim";
  return "none";
}

// ─── Highlighted Keno Number Ball ────────────────────────────────────────────

function HighlightedBall({
  number,
  highlight,
}: {
  number: number;
  highlight: "match" | "dim" | "none";
  filter: HighlightFilter;
}) {
  const baseClass =
    "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none size-9 text-sm transition-all duration-150";

  if (highlight === "dim") {
    // Số không thuộc nhóm chọn → mờ đi
    return (
      <span className={cn(baseClass, "bg-orange-500 text-white opacity-20")}>
        {String(number).padStart(2, "0")}
      </span>
    );
  }

  if (highlight === "match") {
    // Số thuộc nhóm chọn → giữ màu cam + thêm ring để nổi bật
    return (
      <span
        className={cn(baseClass, "bg-orange-500 text-white ring-2 ring-orange-400 ring-offset-1")}
      >
        {String(number).padStart(2, "0")}
      </span>
    );
  }

  // none — mặc định không filter
  return (
    <span className={cn(baseClass, "bg-orange-500 text-white")}>
      {String(number).padStart(2, "0")}
    </span>
  );
}

// ─── Filter Badge Button ──────────────────────────────────────────────────────

function FilterBadge({
  label,
  count,
  active,
  colorClass,
  activeClass,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  /** Màu hiển thị khi không active — luôn có màu. */
  colorClass: string;
  /** Màu override khi đang active (highlight). */
  activeClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums transition-all duration-150",
        "hover:scale-105 active:scale-95",
        active ? cn("shadow-sm ring-1 ring-offset-1", activeClass) : colorClass,
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1 py-0 text-[10px] font-bold tabular-nums min-w-[1.2rem] text-center",
          active ? "bg-white/30" : "bg-current/10 opacity-80",
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Result + Prize Breakdown ─────────────────────────────────────────────────

function ResultAndPrize({ result, drawId }: { result: KenoResultData; drawId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [highlight, setHighlight] = useState<HighlightFilter>(null);

  function toggleFilter(f: HighlightFilter) {
    setHighlight((prev) => (prev === f ? null : f));
  }

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
          {/* Kết quả 20 số với interactive highlight */}
          <div className="rounded-xl border bg-muted/20 px-4 py-4 space-y-3">
            {/* Header: "KẾT QUẢ" căn giữa + link xem entries */}
            <div className="flex items-center justify-between">
              <div className="flex-1" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Kết quả
              </span>
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

            {/* Grid 10 cột — 20 số căn giữa, gap nhỏ */}
            <div className="flex justify-center">
              <div className="grid grid-cols-10 gap-1">
                {[...result.winningNumbers]
                  .slice(0, 20)
                  .sort((a, b) => Number(a) - Number(b))
                  .map((n) => {
                    const num = Number(n);
                    const hl = getNumberHighlight(num, highlight);
                    return (
                      <HighlightedBall key={n} number={num} highlight={hl} filter={highlight} />
                    );
                  })}
              </div>
            </div>

            {/* Filter badges bên dưới grid — màu nhạt mặc định, active → cam */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <FilterBadge
                label="Lớn (41-80)"
                count={result.bigCount}
                active={highlight === "big"}
                colorClass="bg-red-50/70 text-red-400 border-red-200/70 dark:bg-red-950/10 dark:text-red-500/70 dark:border-red-900/50"
                activeClass="bg-orange-500 text-white border-orange-500 dark:bg-orange-500"
                onClick={() => toggleFilter("big")}
              />
              <FilterBadge
                label="Nhỏ (1-40)"
                count={result.smallCount}
                active={highlight === "small"}
                colorClass="bg-blue-50/70 text-blue-400 border-blue-200/70 dark:bg-blue-950/10 dark:text-blue-500/70 dark:border-blue-900/50"
                activeClass="bg-orange-500 text-white border-orange-500 dark:bg-orange-500"
                onClick={() => toggleFilter("small")}
              />
              <FilterBadge
                label="Chẵn"
                count={result.evenCount}
                active={highlight === "even"}
                colorClass="bg-amber-50/70 text-amber-400 border-amber-200/70 dark:bg-amber-950/10 dark:text-amber-500/70 dark:border-amber-900/50"
                activeClass="bg-orange-500 text-white border-orange-500 dark:bg-orange-500"
                onClick={() => toggleFilter("even")}
              />
              <FilterBadge
                label="Lẻ"
                count={result.oddCount}
                active={highlight === "odd"}
                colorClass="bg-purple-50/70 text-purple-400 border-purple-200/70 dark:bg-purple-950/10 dark:text-purple-500/70 dark:border-purple-900/50"
                activeClass="bg-orange-500 text-white border-orange-500 dark:bg-orange-500"
                onClick={() => toggleFilter("odd")}
              />
              {highlight && (
                <button
                  type="button"
                  onClick={() => setHighlight(null)}
                  className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground underline underline-offset-2"
                >
                  Xoá lọc
                </button>
              )}
            </div>

            {/* Chú thích khi đang filter */}
            {highlight && (
              <p className="text-[10px] text-muted-foreground/60 text-center">
                {highlight === "big" &&
                  `${result.bigCount} số Lớn (≥41) · ${result.smallCount} số Nhỏ`}
                {highlight === "small" &&
                  `${result.smallCount} số Nhỏ (≤40) · ${result.bigCount} số Lớn`}
                {highlight === "even" && `${result.evenCount} số Chẵn · ${result.oddCount} số Lẻ`}
                {highlight === "odd" && `${result.oddCount} số Lẻ · ${result.evenCount} số Chẵn`}
              </p>
            )}
          </div>

          {/* Basic prizes table */}
          {result.basicPrizes.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <div className="grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2 bg-muted/40 border-b">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Cơ bản (Pick × Trúng)
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Boards
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Giá trị thưởng
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Tổng thưởng
                </span>
              </div>

              {result.basicPrizes.map((r, idx) => (
                <div
                  key={`${r.pickCount}-${r.matchCount}`}
                  className={cn(
                    "grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2.5 items-center",
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
                        : "text-muted-foreground/40",
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
                  Giá trị thưởng
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Tổng thưởng
                </span>
              </div>

              {result.sideBetPrizes.map((r, idx) => (
                <div
                  key={`${r.playType}-${r.bet}`}
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
                      r.winnerCount > 0
                        ? "text-cyan-700 dark:text-cyan-400"
                        : "text-muted-foreground/40",
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

// ─── Financial Summary (Keno — không có Jackpot) ─────────────────────────────

function FinancialSummary({ financial: f }: { financial: KenoResultData["financial"] }) {
  // Keno KHÔNG có quỹ Jackpot → không có khoản trích quỹ:
  //   Doanh thu − Hoa hồng − Giải thưởng = Kết quả công ty (P&L kỳ) = companyTake.
  // Có thể ÂM khi chi trả giải vượt doanh thu (trúng giải lớn ở bậc pick cao).
  const isProfit = f.companyTake >= 0;

  const resultHint = isProfit
    ? "Keno không có quỹ Jackpot — công ty giữ toàn bộ phần dư sau hoa hồng và giải thưởng."
    : "Chi trả giải vượt doanh thu — công ty bù phần thiếu. Keno không có quỹ Jackpot nên toàn bộ chênh lệch tính thẳng vào P&L kỳ.";

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
            hint: "Gồm cả giải cơ bản (Pick × Trúng) và side bets (Lớn/Nhỏ, Chẵn/Lẻ). Bậc cao (Pick 8-10) có payout cap theo quy tắc Vietlott.",
          },
          {
            icon: isProfit ? TrendingUp : TrendingDown,
            iconBg: isProfit
              ? "bg-emerald-100 dark:bg-emerald-900/50"
              : "bg-red-100 dark:bg-red-900/50",
            iconColor: isProfit
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400",
            label: "Kết quả công ty (P&L kỳ)",
            value: f.companyTake,
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
                className={cn(
                  "tabular-nums text-sm font-mono shrink-0",
                  row.bold ? "font-bold" : "",
                  displayColor,
                )}
              >
                {displaySign !== "=" ? displaySign : ""}
                {formatNumber(row.value)}
              </span>
            </div>
          );
        })}

        {/* Cảnh báo khi kỳ lỗ — Keno có thể âm khi trúng giải lớn ở bậc pick cao */}
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

// ─── ResultSection ─────────────────────────────────────────────────────────────

export function ResultSection() {
  const { draw, effectiveDrawId } = useDrawContext();

  const shouldFetch = draw && RESULT_SHOW.has(draw.status as any);
  const { data: drawDetailData } = useDrawDetail(shouldFetch ? effectiveDrawId : undefined);

  const result: KenoResultData | undefined = useMemo(() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;

    // Unified prizes[] — filter by pickCount != null cho cơ bản, bet defined cho bổ sung
    const allPrizes: any[] = d.settleSummary?.prizes ?? [];

    const basicPrizes: BasicPrizeRow[] = allPrizes
      .filter((r: any) => r.pickCount != null)
      .map((r: any) => ({
        pickCount: r.pickCount as number,
        matchCount: r.matchCount as number,
        winnerCount: r.winnerCount as number,
        prizePerUnit: r.prizePerUnit as number,
        totalPrize: (r.winnerCount as number) * (r.prizePerUnit as number),
      }));

    const sideBetPrizes: SideBetPrizeRow[] = allPrizes
      .filter((r: any) => r.bet !== undefined)
      .map((r: any) => ({
        playType: r.playType as string,
        bet: r.bet as string,
        label: sideBetLabel(r.playType, r.bet),
        winnerCount: r.winnerCount as number,
        prizePerUnit: r.prizePerUnit as number,
        totalPrize: (r.winnerCount as number) * (r.prizePerUnit as number),
      }));

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

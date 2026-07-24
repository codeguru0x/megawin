"use client";

/**
 * Max 3D Pro Operations — Result Section
 *
 * Hiển thị kết quả 20 bộ ba số và tổng hợp tài chính sau khi draw published/settled.
 * Chỉ render khi draw ở trạng thái Published/Settling/Settled.
 *
 * Max 3D Pro: 8 PrizeTier (bao gồm specialSub), không có Jackpot.
 * Tier specialSub = Giải phụ Đặc Biệt (đảo thứ tự bộ đôi ĐB).
 */

import { useMemo, useState } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import { PrizeTier } from "@megawin/game-max3dpro/entities";
import { MAX3DPRO_PRIZE_TIER_LABELS } from "@megawin/game-max3dpro/labels";
import { formatNumber } from "@megawin/shared/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TripletDisplay } from "@/components/games/max3dpro/triplet-display";
import { Trophy, Users, Coins, ExternalLink, TrendingUp, TrendingDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

import { useDrawContext } from "../../use-draw-context";
import { useDrawDetail } from "../../use-operations";
import type { DrawResult, DrawFinancialDisplay } from "../../types";
import { WinningEntriesDialog } from "./winning-entries-dialog";

// ─── Tier config ──────────────────────────────────────────────────────────────

type TierCfg = { badge: string; row: string; icon?: React.ElementType };

const TIER_CONFIG: Record<string, TierCfg> = {
  [PrizeTier.Special]: {
    badge:
      "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700",
    row: "bg-amber-50/60 dark:bg-amber-950/10 border-l-2 border-l-amber-400",
    icon: Trophy,
  },
  [PrizeTier.SpecialSub]: {
    badge:
      "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-700",
    row: "bg-orange-50/40 dark:bg-orange-950/5 border-l-2 border-l-orange-300",
  },
  [PrizeTier.First]: {
    badge:
      "border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-700",
    row: "bg-yellow-50/40 dark:bg-yellow-950/5",
  },
  [PrizeTier.Second]: {
    badge:
      "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700",
    row: "",
  },
  [PrizeTier.Third]: {
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700",
    row: "",
  },
  [PrizeTier.Fourth]: { badge: "border-border bg-muted/40 text-muted-foreground", row: "" },
  [PrizeTier.Fifth]: { badge: "border-border bg-muted/40 text-muted-foreground", row: "" },
  [PrizeTier.Sixth]: { badge: "border-border bg-muted/40 text-muted-foreground", row: "" },
};

const RESULT_SHOW = new Set<string>([
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Settled,
]);

// ─── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({ result, drawId }: { result: DrawResult; drawId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const totalWinnerCount = result.tiers.reduce((a, t) => a + t.winnerCount, 0);
  const totalPrize = result.tiers.reduce((a, t) => a + t.totalPrize, 0);

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
                  {formatNumber(totalWinnerCount)}
                </span>{" "}
                line trúng thưởng · Tổng giải{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatNumber(totalPrize)}
                </span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {/* 20 bộ ba số — header bên trong card */}
          <div className="rounded-xl border bg-muted/20 px-4 py-4 space-y-3">
            <div className="flex items-center justify-between w-full">
              <div className="flex-1" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
            <div className="flex justify-center">
              <div className="space-y-2">
                {[
                  { label: "Đặc Biệt", triplets: result.special, variant: "special" as const },
                  { label: "Giải Nhất", triplets: result.first, variant: "first" as const },
                  { label: "Giải Nhì", triplets: result.second, variant: "second" as const },
                  { label: "Giải Ba", triplets: result.third, variant: "third" as const },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-muted-foreground w-16 shrink-0">
                      {row.label}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {row.triplets.map((t, i) => (
                        <TripletDisplay key={i} value={t} variant={row.variant} size="sm" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Prize tiers table — 8 tiers Max 3D Pro */}
          {result.tiers.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <div className="grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2 bg-muted/40 border-b">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Hạng giải
                </span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Số trúng
                </span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Giá trị thưởng
                </span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Tổng thưởng
                </span>
              </div>

              {result.tiers.map((tier, idx) => {
                const cfg = TIER_CONFIG[tier.tier] ?? {
                  badge: "border-border bg-muted/40 text-muted-foreground",
                  row: "",
                };
                const label = MAX3DPRO_PRIZE_TIER_LABELS[tier.tier as PrizeTier] ?? tier.tier;
                const hasWinner = tier.winnerCount > 0;

                return (
                  <div
                    key={tier.tier}
                    className={cn(
                      "grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2.5 items-center",
                      idx < result.tiers.length - 1 && "border-b border-border/50",
                      hasWinner ? cfg.row : "",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {cfg.icon ? (
                        <cfg.icon className="size-3.5 shrink-0 text-amber-500" />
                      ) : (
                        <span className="size-3.5 shrink-0" />
                      )}
                      <Badge
                        variant="outline"
                        className={cn("text-xs border px-2 py-0 h-5", cfg.badge)}
                      >
                        {label}
                      </Badge>
                    </div>

                    <span
                      className={cn(
                        "text-right tabular-nums text-sm font-semibold",
                        hasWinner
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-muted-foreground/40",
                      )}
                    >
                      {formatNumber(tier.winnerCount)}
                    </span>

                    <span
                      className={cn(
                        "text-right tabular-nums text-sm",
                        hasWinner ? "text-muted-foreground" : "text-muted-foreground/40",
                      )}
                    >
                      {formatNumber(tier.prizeAmount)}
                    </span>

                    <span
                      className={cn(
                        "text-right tabular-nums text-sm font-bold",
                        hasWinner ? "text-foreground" : "text-muted-foreground/40",
                      )}
                    >
                      {formatNumber(tier.totalPrize)}
                    </span>
                  </div>
                );
              })}

              <div className="grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2.5 items-center border-t bg-muted/20">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Tổng cộng
                </span>
                <span className="text-right tabular-nums text-sm font-bold text-foreground">
                  {formatNumber(result.tiers.reduce((a, t) => a + t.winnerCount, 0))}
                </span>
                <span />
                <span className="text-right tabular-nums text-sm font-bold text-foreground">
                  {formatNumber(result.tiers.reduce((a, t) => a + t.totalPrize, 0))}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <WinningEntriesDialog drawId={drawId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

// ─── Financial Summary ────────────────────────────────────────────────────────

function FinancialSummary({ financial: f }: { financial: DrawFinancialDisplay }) {
  // Max 3D Pro KHÔNG có quỹ Jackpot và không có companyRate riêng → không có khoản trích quỹ:
  //   Doanh thu − Hoa hồng − Giải thưởng = Kết quả công ty (P&L kỳ) = f.profit.
  // Có thể ÂM khi chi trả giải vượt doanh thu (trúng nhiều Đặc Biệt/specialSub cùng lúc).
  const isProfit = f.profit >= 0;

  const resultHint = isProfit
    ? "Max 3D Pro không có quỹ Jackpot — công ty giữ toàn bộ phần dư sau hoa hồng và giải thưởng."
    : "Chi trả giải vượt doanh thu — công ty bù phần thiếu. Max 3D Pro không có quỹ Jackpot nên toàn bộ chênh lệch tính thẳng vào P&L kỳ.";

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
            iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
            iconColor: "text-emerald-600 dark:text-emerald-400",
            label: "Doanh thu gộp",
            value: f.totalRevenue,
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
            sign: "-" as const,
            valueColor: "text-muted-foreground",
            indent: true,
          },
          {
            icon: Trophy,
            iconBg: "bg-amber-100 dark:bg-amber-900/50",
            iconColor: "text-amber-600 dark:text-amber-400",
            label: "Chi trả giải thưởng",
            value: f.totalFixedPrizes,
            sign: "-" as const,
            valueColor: "text-muted-foreground",
            indent: true,
            hint: "Gồm 8 hạng giải (Đặc Biệt, specialSub, Nhất→Sáu). specialSub = giải phụ đảo thứ tự bộ đôi Đặc Biệt.",
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
            value: f.profit,
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

        {/* Cảnh báo khi kỳ lỗ — Max 3D Pro có thể âm khi chi trả giải vượt doanh thu */}
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

// ─── Main Section ─────────────────────────────────────────────────────────────

export function ResultSection() {
  const { draw, effectiveDrawId } = useDrawContext();

  const shouldFetch = draw && RESULT_SHOW.has(draw.status);
  const { data: drawDetailData } = useDrawDetail(shouldFetch ? effectiveDrawId : undefined);

  const result: DrawResult | undefined = useMemo(() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;

    const tierMap = new Map((d.settleSummary?.tiers ?? []).map((t) => [t.tier, t]));
    const tiers = Object.values(PrizeTier).map((tier) => {
      const t = tierMap.get(tier);
      const winnerCount = t?.winnerCount ?? 0;
      const prizeAmount =
        winnerCount > 0 && t?.prizeAmount ? Math.round(t.prizeAmount / winnerCount) : 0;
      return {
        tier,
        label: MAX3DPRO_PRIZE_TIER_LABELS[tier] ?? String(tier),
        winnerCount,
        prizeAmount,
        totalPrize: t?.prizeAmount ?? 0,
      };
    });

    const r = d.result;
    return {
      special: r.special as [string, string],
      first: r.first as [string, string, string, string],
      second: r.second as [string, string, string, string, string, string],
      third: r.third as [string, string, string, string, string, string, string, string],
      settledAt:
        r.publishedAt instanceof Date ? r.publishedAt.toISOString() : String(r.publishedAt ?? ""),
      tiers,
      financial: {
        totalRevenue: d.financial?.totalRevenue ?? 0,
        totalFixedPrizes: d.financial?.totalFixedPrizes ?? 0,
        totalAgentCommission: d.financial?.totalAgentCommission ?? 0,
        profit:
          (d.financial?.totalRevenue ?? 0) -
          (d.financial?.totalFixedPrizes ?? 0) -
          (d.financial?.totalAgentCommission ?? 0),
      },
    };
  }, [drawDetailData]);

  if (!draw || !RESULT_SHOW.has(draw.status) || !result) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Kết quả & Tài chính
      </h2>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <ResultCard result={result} drawId={effectiveDrawId} />
        <FinancialSummary financial={result.financial} />
      </div>
    </section>
  );
}

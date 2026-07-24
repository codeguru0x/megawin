"use client";

/**
 * Max 3D Operations — Result Section
 *
 * Hiển thị kết quả 20 bộ ba số và tổng hợp tài chính sau khi draw published/settled.
 * Chỉ render khi draw ở trạng thái Published/Settling/Settled.
 *
 * Max 3D không có Jackpot → FinancialSummary không hiển thị jackpot fields.
 */

import { useMemo, useState } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import { BasicPrizeTier, PlusPrizeTier } from "@megawin/game-max3d/entities";
import {
  MAX3D_BASIC_PRIZE_TIER_LABELS,
  MAX3D_PLUS_PRIZE_TIER_LABELS,
  MAX3D_PLAY_MODE_LABELS,
} from "@megawin/game-max3d/labels";
import { formatNumber } from "@megawin/shared/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TripletDisplay } from "@/components/games/max3d/triplet-display";
import { Trophy, Users, Coins, ExternalLink, TrendingUp, TrendingDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

import { useDrawContext } from "../../use-draw-context";
import { useDrawDetail } from "../../use-operations";
import type { DrawResult, DrawFinancialDisplay } from "../../types";
import { WinningEntriesDialog } from "./winning-entries-dialog";

// ─── Tier config ──────────────────────────────────────────────────────────────

type TierConfig = { badge: string; row: string; icon?: React.ElementType };

/**
 * Config hiển thị cho từng hạng giải.
 * Basic và Plus chia sẻ key "special","first","second","third" nên dùng 1 map duy nhất.
 * Plus-only tiers "fourth","fifth","sixth" được thêm thêm vào.
 */
const TIER_CONFIG: Record<string, TierConfig> = {
  special: {
    badge:
      "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700",
    row: "bg-amber-50/60 dark:bg-amber-950/10 border-l-2 border-l-amber-400",
    icon: Trophy,
  },
  first: {
    badge:
      "border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-700",
    row: "bg-yellow-50/40 dark:bg-yellow-950/5",
  },
  second: {
    badge:
      "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-700",
    row: "",
  },
  third: {
    badge:
      "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700",
    row: "",
  },
  fourth: { badge: "border-border bg-muted/40 text-muted-foreground", row: "" },
  fifth: { badge: "border-border bg-muted/40 text-muted-foreground", row: "" },
  sixth: { badge: "border-border bg-muted/40 text-muted-foreground", row: "" },
};

const RESULT_SHOW = new Set<string>([
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Settled,
]);

// ─── Prize tier group (Cơ Bản hoặc Plus) ─────────────────────────────────────

type TierRow = DrawResult["tiers"][number];

/**
 * Bảng giải thưởng cho MỘT play mode (Cơ Bản hoặc Plus).
 * Max 3D Cơ Bản và Max 3D+ dùng chung tên tier (special/first/second/third) nhưng
 * là 2 cách chơi độc lập với mức thưởng khác nhau → PHẢI tách bảng riêng, không gộp
 * chung 1 danh sách (gộp sẽ khiến "Giải Đặc Biệt" xuất hiện 2 lần, gây hiểu nhầm là lỗi).
 */
function PrizeTierGroup({ title, tiers }: { title: string; tiers: TierRow[] }) {
  const totalWinnerCount = tiers.reduce((a, t) => a + t.winnerCount, 0);
  const totalPrize = tiers.reduce((a, t) => a + t.totalPrize, 0);

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2 bg-muted/40 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
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

      {tiers.map((tier, idx) => {
        const cfg = TIER_CONFIG[tier.tier] ?? {
          badge: "border-border bg-muted/40 text-muted-foreground",
          row: "",
        };
        const label =
          MAX3D_BASIC_PRIZE_TIER_LABELS[tier.tier as BasicPrizeTier] ??
          MAX3D_PLUS_PRIZE_TIER_LABELS[tier.tier as PlusPrizeTier] ??
          tier.tier;
        const hasWinner = tier.winnerCount > 0;

        return (
          <div
            key={tier.tier}
            className={cn(
              "grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2.5 items-center",
              idx < tiers.length - 1 && "border-b border-border/50",
              hasWinner ? cfg.row : "",
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              {cfg.icon ? (
                <cfg.icon className="size-3.5 shrink-0 text-amber-500" />
              ) : (
                <span className="size-3.5 shrink-0" />
              )}
              <Badge variant="outline" className={cn("text-xs border px-2 py-0 h-5", cfg.badge)}>
                {label}
              </Badge>
            </div>

            <span
              className={cn(
                "text-right tabular-nums text-sm font-semibold",
                hasWinner ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground/40",
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
          {formatNumber(totalWinnerCount)}
        </span>
        <span />
        <span className="text-right tabular-nums text-sm font-bold text-foreground">
          {formatNumber(totalPrize)}
        </span>
      </div>
    </div>
  );
}

// ─── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({ result, drawId }: { result: DrawResult; drawId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const basicTiers = result.tiers.filter((t) => t.mode === "basic");
  const plusTiers = result.tiers.filter((t) => t.mode === "plus");
  const totalWinnerCount = result.tiers.reduce((a, t) => a + t.winnerCount, 0);
  const totalPrize = result.tiers.reduce((a, t) => a + t.totalPrize, 0);

  return (
    <>
      <Card className="gap-0 py-0 shadow-sm">
        <CardHeader className="px-5 pb-2 pt-4">
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
        <CardContent className="px-5 pb-4 pt-0 space-y-4">
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

          {/* Prize tiers — tách riêng 2 bảng vì Cơ Bản và Plus là 2 cách chơi độc lập,
              tuy dùng chung tên tier (special/first/second/third) nhưng mức thưởng khác nhau */}
          {result.tiers.length > 0 && (
            <div className="space-y-3">
              {basicTiers.length > 0 && (
                <PrizeTierGroup title={MAX3D_PLAY_MODE_LABELS.basic} tiers={basicTiers} />
              )}
              {plusTiers.length > 0 && (
                <PrizeTierGroup title={MAX3D_PLAY_MODE_LABELS.plus} tiers={plusTiers} />
              )}
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
  // Max 3D KHÔNG có quỹ Jackpot và không có companyRate riêng → không có khoản trích quỹ:
  //   Doanh thu − Hoa hồng − Giải thưởng = Kết quả công ty (P&L kỳ).
  // Có thể ÂM khi chi trả giải vượt doanh thu (trúng nhiều Đặc Biệt/Giải Nhất cùng lúc).
  const netProfit = f.totalRevenue - f.totalFixedPrizes - f.totalAgentCommission;
  const isProfit = netProfit >= 0;

  const resultHint = isProfit
    ? "Max 3D không có quỹ Jackpot — công ty giữ toàn bộ phần dư sau hoa hồng và giải thưởng."
    : "Chi trả giải vượt doanh thu — công ty bù phần thiếu. Max 3D không có quỹ Jackpot nên toàn bộ chênh lệch tính thẳng vào P&L kỳ.";

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
            hint: "Gồm cả giải Basic (Đặc Biệt/Nhất/Nhì/Ba) và Plus (nếu board chọn thêm).",
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
            value: netProfit,
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

        {/* Cảnh báo khi kỳ lỗ — Max 3D có thể âm khi chi trả giải vượt doanh thu */}
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

    // settleSummary của Max 3D tách thành basicTiers và plusTiers (không có tiers chung)
    const basicTierMap = new Map((d.settleSummary?.basicTiers ?? []).map((t) => [t.tier, t]));
    const plusTierMap = new Map((d.settleSummary?.plusTiers ?? []).map((t) => [t.tier, t]));

    // Basic và Plus chia sẻ tên tier (special/first/second/third) nên phải gom riêng biệt
    // để tránh duplicate key và đọc sai data (plus special bị map sang basicTierMap).
    const basicTiers = Object.keys(MAX3D_BASIC_PRIZE_TIER_LABELS).map((tier) => {
      const t = basicTierMap.get(tier);
      const winnerCount = t?.winnerCount ?? 0;
      const prizeAmount =
        winnerCount > 0 && t?.prizeAmount ? Math.round(t.prizeAmount / winnerCount) : 0;
      return {
        mode: "basic" as const,
        tier: tier as BasicPrizeTier,
        label: MAX3D_BASIC_PRIZE_TIER_LABELS[tier as BasicPrizeTier] ?? String(tier),
        winnerCount,
        prizeAmount,
        totalPrize: t?.prizeAmount ?? 0,
      };
    });
    const plusTiers = Object.keys(MAX3D_PLUS_PRIZE_TIER_LABELS).map((tier) => {
      const t = plusTierMap.get(tier);
      const winnerCount = t?.winnerCount ?? 0;
      const prizeAmount =
        winnerCount > 0 && t?.prizeAmount ? Math.round(t.prizeAmount / winnerCount) : 0;
      return {
        mode: "plus" as const,
        tier: tier as PlusPrizeTier,
        label: MAX3D_PLUS_PRIZE_TIER_LABELS[tier as PlusPrizeTier] ?? String(tier),
        winnerCount,
        prizeAmount,
        totalPrize: t?.prizeAmount ?? 0,
      };
    });
    const tiers = [...basicTiers, ...plusTiers];

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
        companyTake: d.financial?.companyTake ?? 0,
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

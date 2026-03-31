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
} from "@megawin/game-max3d/labels";
import { formatNumber } from "@megawin/shared/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TripletDisplay } from "@/components/games/max3d/triplet-display";
import { Trophy, Users, Coins, ArrowDownRight, CircleDollarSign, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

import { useDrawContext } from "../../use-draw-context";
import { useDrawDetail, useWinningEntries, type WinningEntryItem } from "../../use-operations";
import type { DrawResult, DrawFinancialDisplay } from "../../types";

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

// ─── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({ result, drawId }: { result: DrawResult; drawId: string }) {
  const [showWinners, setShowWinners] = useState(false);
  const { data: winnersData, isLoading: winnersLoading } = useWinningEntries(drawId, showWinners);

  const nonZeroTiers = result.tiers.filter((t) => t.winnerCount > 0);

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Kết quả quay số</CardTitle>
          </div>
          {nonZeroTiers.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 text-xs"
              onClick={() => setShowWinners(!showWinners)}
            >
              <ExternalLink className="size-3" />
              Vé trúng thưởng
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0 space-y-4">
        {/* 20 bộ ba số */}
        <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
          {[
            { label: "Đặc Biệt", triplets: result.special, variant: "special" as const },
            { label: "Giải Nhất", triplets: result.first, variant: "first" as const },
            { label: "Giải Nhì", triplets: result.second, variant: "second" as const },
            { label: "Giải Ba", triplets: result.third, variant: "third" as const },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="text-xs font-semibold text-muted-foreground w-20 shrink-0">
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

        {/* Prize tiers table */}
        {result.tiers.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Giải thưởng
            </p>
            <div className="space-y-1">
              {result.tiers.map((tier) => {
                const cfg = TIER_CONFIG[tier.tier] ?? {
                  badge: "border-border bg-muted/40 text-muted-foreground",
                  row: "",
                };
                const label =
                  MAX3D_BASIC_PRIZE_TIER_LABELS[tier.tier as BasicPrizeTier] ??
                  MAX3D_PLUS_PRIZE_TIER_LABELS[tier.tier as PlusPrizeTier] ??
                  tier.tier;
                return (
                  <div
                    key={`${tier.mode}-${tier.tier}`}
                    className={cn(
                      "grid items-center gap-x-3 rounded-lg border border-transparent px-3 py-2",
                      cfg.row,
                      tier.winnerCount === 0 && "opacity-40",
                    )}
                    style={{ gridTemplateColumns: "7rem 4rem 6rem 6rem" }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {cfg.icon && <cfg.icon className="size-3.5 shrink-0 text-amber-500" />}
                      <Badge variant="outline" className={cn("text-xs py-0", cfg.badge)}>
                        {label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <Users className="size-3" />
                      {formatNumber(tier.winnerCount)}
                    </div>
                    <p className="text-xs tabular-nums text-right text-muted-foreground">
                      {tier.prizeAmount > 0 ? formatNumber(tier.prizeAmount) : "—"}
                    </p>
                    <p className="text-xs font-semibold tabular-nums text-right">
                      {tier.totalPrize > 0 ? formatNumber(tier.totalPrize) : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Winning entries quick view */}
        {showWinners && (
          <div className="rounded-xl border bg-muted/10 p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Vé trúng thưởng{" "}
              {winnersLoading
                ? "(đang tải...)"
                : winnersData
                  ? `(${winnersData.entries.length} vé)`
                  : ""}
            </p>
            {winnersData?.entries.slice(0, 10).map((entry: WinningEntryItem) => (
              <div key={entry.entryId} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground">{entry.entryId.slice(-8)}</span>
                <span className="font-semibold tabular-nums">{formatNumber(entry.winAmount)}</span>
              </div>
            ))}
            {winnersData && winnersData.entries.length > 10 && (
              <p className="text-xs text-muted-foreground">
                +{winnersData.entries.length - 10} vé khác
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Financial Summary ────────────────────────────────────────────────────────

function FinancialSummary({ financial }: { financial: DrawFinancialDisplay }) {
  const netProfit =
    financial.totalRevenue - financial.totalFixedPrizes - financial.totalAgentCommission;

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Tài chính</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0 space-y-3">
        <FinancialRow
          icon={CircleDollarSign}
          iconBg="bg-emerald-100 dark:bg-emerald-900/40"
          iconColor="text-emerald-600 dark:text-emerald-400"
          label="Doanh thu"
          value={formatNumber(financial.totalRevenue)}
          highlight
        />
        <FinancialRow
          icon={Trophy}
          iconBg="bg-amber-100 dark:bg-amber-900/40"
          iconColor="text-amber-600 dark:text-amber-400"
          label="Tổng giải thưởng"
          value={`−${formatNumber(financial.totalFixedPrizes)}`}
          negative
        />
        <FinancialRow
          icon={Coins}
          iconBg="bg-blue-100 dark:bg-blue-900/40"
          iconColor="text-blue-600 dark:text-blue-400"
          label="Hoa hồng ĐL"
          value={`−${formatNumber(financial.totalAgentCommission)}`}
          negative
        />
        <div className="border-t pt-2">
          <FinancialRow
            icon={ArrowDownRight}
            iconBg="bg-violet-100 dark:bg-violet-900/40"
            iconColor="text-violet-600 dark:text-violet-400"
            label="Lợi nhuận công ty"
            value={formatNumber(netProfit)}
            highlight
          />
        </div>
      </CardContent>
    </Card>
  );
}

function FinancialRow({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  highlight = false,
  negative = false,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  highlight?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", iconBg)}>
        <Icon className={cn("size-3.5", iconColor)} />
      </div>
      <span className="flex-1 text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-xs font-semibold tabular-nums",
          highlight
            ? "text-foreground"
            : negative
              ? "text-red-500 dark:text-red-400"
              : "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
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

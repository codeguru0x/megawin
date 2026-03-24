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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TripletDisplay } from "@/components/games/max3d/triplet-display";
import { Trophy, Users, Coins, ArrowDownRight, CircleDollarSign, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

import { useDrawContext } from "../../use-draw-context";
import { useDrawDetail, useWinningEntries, type WinningEntryItem } from "../../use-operations";
import type { DrawResult, DrawFinancialDisplay } from "../../types";

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
  const [showWinners, setShowWinners] = useState(false);
  const { data: winnersData, isLoading: winnersLoading } = useWinningEntries(drawId, showWinners);

  const nonZeroTiers = result.tiers.filter((t) => t.winnerCount > 0);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Kết quả quay số</CardTitle>
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
      <CardContent className="space-y-4">
        {/* 20 bộ ba số */}
        <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
          {[
            { label: "Đặc Biệt", triplets: result.special, variant: "special" as const },
            { label: "Giải Nhất", triplets: result.first, variant: "first" as const },
            { label: "Giải Nhì", triplets: result.second, variant: "second" as const },
            { label: "Giải Ba", triplets: result.third, variant: "third" as const },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="text-[11px] font-semibold text-muted-foreground w-20 shrink-0">
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

        {/* Prize tiers table — 8 tiers Max 3D Pro */}
        {result.tiers.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Giải thưởng
            </p>
            <div className="space-y-1">
              {result.tiers.map((tier) => {
                const cfg = TIER_CONFIG[tier.tier] ?? {
                  badge: "border-border bg-muted/40 text-muted-foreground",
                  row: "",
                };
                const label = MAX3DPRO_PRIZE_TIER_LABELS[tier.tier as PrizeTier] ?? tier.tier;
                return (
                  <div
                    key={tier.tier}
                    className={cn(
                      "grid items-center gap-x-3 rounded-lg border border-transparent px-3 py-2",
                      cfg.row,
                      tier.winnerCount === 0 && "opacity-40",
                    )}
                    style={{ gridTemplateColumns: "8rem 4rem 6rem 6rem" }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {cfg.icon && <cfg.icon className="size-3.5 shrink-0 text-amber-500" />}
                      <Badge variant="outline" className={cn("text-[10px] py-0", cfg.badge)}>
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
              <p className="text-[11px] text-muted-foreground">
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
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Tài chính</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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

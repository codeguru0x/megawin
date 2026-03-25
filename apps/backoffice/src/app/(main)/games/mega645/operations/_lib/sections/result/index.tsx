"use client";

/**
 * Mega 6/45 Operations — Result Section
 *
 * Hiển thị kết quả quay số và tổng hợp tài chính sau khi draw published/settled.
 * Mega 6/45: 6 số chính, 4 tiers, không có winningSpecial.
 */

import { useMemo } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import { PrizeTier } from "@megawin/game-mega645/entities";
import { MEGA645_PRIZE_TIER_LABELS } from "@megawin/game-mega645/labels";

import { useDrawContext } from "../../use-draw-context";
import { useDrawDetail } from "../../use-operations";
import { ResultAndPrize, FinancialSummary } from "./result-panels";

import type { DrawResult } from "../../types";

const RESULT_SHOW = new Set([DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled]);

const TIER_ORDER: PrizeTier[] = [
  PrizeTier.Jackpot,
  PrizeTier.Tier1,
  PrizeTier.Tier2,
  PrizeTier.Tier3,
];

export function ResultSection() {
  const { draw, effectiveDrawId } = useDrawContext();

  const shouldFetch = draw && RESULT_SHOW.has(draw.status as any);
  const { data: drawDetailData } = useDrawDetail(shouldFetch ? effectiveDrawId : undefined);

  const result: DrawResult | undefined = useMemo(() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;

    const tierMap = new Map((d.settleSummary?.tiers ?? []).map((t) => [t.tier as PrizeTier, t]));
    const tiers = TIER_ORDER.map((tier) => {
      const t = tierMap.get(tier);
      const winnerCount = t?.winnerCount ?? 0;
      const prizeAmount =
        winnerCount > 0 && t?.prizeAmount ? Math.round(t.prizeAmount / winnerCount) : 0;
      return {
        tier,
        label: MEGA645_PRIZE_TIER_LABELS[tier] ?? String(tier),
        winnerCount,
        prizeAmount,
        totalPrize: t?.prizeAmount ?? 0,
      };
    });

    return {
      // Mega 6/45: 6 số chính (01-45), không có winningSpecial
      winningNumbers: d.result.winningNumbers as [string, string, string, string, string, string],
      settledAt:
        d.result.publishedAt instanceof Date
          ? d.result.publishedAt.toISOString()
          : String(d.result.publishedAt ?? ""),
      tiers,
      financial: {
        totalRevenue: d.financial?.totalRevenue ?? 0,
        totalFixedPrizes: d.financial?.totalFixedPrizes ?? 0,
        totalAgentCommission: d.financial?.totalAgentCommission ?? 0,
        companyTake: d.financial?.companyTake ?? 0,
        jackpotContribution: d.financial?.jackpotContribution ?? 0,
        jackpotBefore: d.jackpot?.openingAmount ?? 0,
        jackpotAfter: d.jackpot?.closingAmount ?? 0,
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

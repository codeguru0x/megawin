"use client";

/**
 * Power 6/55 Operations — Result Section
 *
 * Hiển thị kết quả quay số và tổng hợp tài chính sau khi draw published/settled.
 * Power 6/55 khác Mega 6/45:
 * - Có bonusNumber trong kết quả
 * - 6 tiers (JP1, JP2, tier1-4)
 * - Jackpot kép: JP1 pool + JP2 pool
 */

import { useMemo } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import { PrizeTier } from "@megawin/game-power655/entities";

import { useDrawContext } from "../../use-draw-context";
import { useDrawDetail } from "../../use-operations";
import { ResultAndPrize, FinancialSummary } from "./result-panels";

import type { DrawResult } from "../../types";

const RESULT_SHOW = new Set([DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled]);

const TIER_ORDER: PrizeTier[] = [
  PrizeTier.Jackpot1,
  PrizeTier.Jackpot2,
  PrizeTier.Tier1,
  PrizeTier.Tier2,
  PrizeTier.Tier3,
];

const TIER_LABELS: Record<string, string> = {
  [PrizeTier.Jackpot1]: "Jackpot 1",
  [PrizeTier.Jackpot2]: "Jackpot 2",
  [PrizeTier.Tier1]: "Giải Nhất",
  [PrizeTier.Tier2]: "Giải Nhì",
  [PrizeTier.Tier3]: "Giải Ba",
};

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
        label: TIER_LABELS[tier] ?? String(tier),
        winnerCount,
        prizeAmount,
        totalPrize: t?.prizeAmount ?? 0,
      };
    });

    return {
      winningMain: d.result.winningMain as [string, string, string, string, string, string],
      bonusNumber: d.result.bonusNumber ?? "",
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
        jackpot1Contribution: d.financial?.jackpot1Contribution ?? 0,
        jackpot2Contribution: d.financial?.jackpot2Contribution ?? 0,
        jackpot1Before: d.jackpot?.openingJackpot1 ?? 0,
        jackpot1After: d.jackpot?.closingJackpot1 ?? 0,
        jackpot2Before: d.jackpot?.openingJackpot2 ?? 0,
        jackpot2After: d.jackpot?.closingJackpot2 ?? 0,
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

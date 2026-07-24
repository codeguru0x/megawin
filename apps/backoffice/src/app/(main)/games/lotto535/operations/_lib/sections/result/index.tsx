"use client";

/**
 * Lotto 5/35 Operations — Result Section
 *
 * Hiển thị kết quả quay số và tổng hợp tài chính sau khi draw published/settled.
 * Tự fetch draw detail và render ResultAndPrize + FinancialSummary.
 *
 * Visibility logic: chỉ render khi draw ở trạng thái Published/Settling/Settled.
 */

import { useMemo } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import { PrizeTier } from "@megawin/game-lotto535/entities";
import { LOTTO535_PRIZE_TIER_LABELS } from "@megawin/game-lotto535/labels";

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
  PrizeTier.Tier4,
  PrizeTier.Tier5,
  PrizeTier.Consolation,
];

export function ResultSection() {
  const { draw, effectiveDrawId } = useDrawContext();

  const shouldFetch = draw && RESULT_SHOW.has(draw.status as any);
  const { data: drawDetailData } = useDrawDetail(shouldFetch ? effectiveDrawId : undefined);

  const result: DrawResult | undefined = useMemo(() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;

    // prizeAmounts từ API: unit prize per winning line theo config (không bao gồm Jackpot biến động)
    const configPricePerLine: Record<string, number> = drawDetailData?.prizeAmounts ?? {};

    const tierMap = new Map((d.settleSummary?.tiers ?? []).map((t) => [t.tier as PrizeTier, t]));
    const tiers = TIER_ORDER.map((tier) => {
      const t = tierMap.get(tier);
      const winnerCount = t?.winnerCount ?? 0;
      // prizeAmount = tiền/line: ưu tiên từ config, fallback 0 cho Jackpot (tích luỹ)
      const prizeAmount =
        winnerCount > 0 && t?.prizeAmount
          ? Math.round(t.prizeAmount / winnerCount)
          : (configPricePerLine[tier] ?? 0);
      return {
        tier,
        label: LOTTO535_PRIZE_TIER_LABELS[tier] ?? String(tier),
        winnerCount,
        prizeAmount,
        totalPrize: t?.prizeAmount ?? 0,
      };
    });

    const jackpotTier = tierMap.get(PrizeTier.Jackpot);
    const hasJackpotWinner = (jackpotTier?.winnerCount ?? 0) > 0;
    const isSplitCycle = d.jackpot?.isSplitCycle ?? false;
    const jackpotBefore = d.jackpot?.openingAmount ?? 0;
    const jackpotContribution = d.financial?.jackpotContribution ?? 0;
    // Pool xử lý kỳ này = opening + contribution.
    // Winner: trao winner. Split: chia tier1-5. Roll-over: 0 (không "trao" gì).
    const jackpotPrizeAwarded =
      hasJackpotWinner || isSplitCycle ? jackpotBefore + jackpotContribution : 0;

    return {
      winningMain: d.result.winningMain as [string, string, string, string, string],
      winningSpecial: d.result.winningSpecial,
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
        actualCompanyTake: d.financial?.actualCompanyTake ?? 0,
        jackpotContribution,
        jackpotBefore,
        jackpotAfter: d.jackpot?.closingAmount ?? 0,
        hasJackpotWinner,
        isSplitCycle,
        jackpotPrizeAwarded,
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

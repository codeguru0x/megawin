/**
 * Mega 6/45 – Match Result
 *
 * So sánh 1 line với kết quả quay.
 * Mega 6/45 chỉ có số chính, không có số đặc biệt/bonus.
 */

import type { PrizeTier } from "../entities/enums";
import type { LineValue, MainTuple } from "../entities/types";
import { determineTier, type LineMatchResult } from "../rules/prize-tiers";

export interface DrawResultForMatch {
  winningMain: MainTuple;
}

function countMainMatches(lineMain: MainTuple, winMain: MainTuple): number {
  const winSet = new Set(winMain);
  let count = 0;
  for (const n of lineMain) {
    if (winSet.has(n)) count++;
  }
  return count;
}

export function matchLine(
  line: LineValue,
  result: DrawResultForMatch
): LineMatchResult {
  const mainMatchCount = countMainMatches(line.main, result.winningMain);
  const tier = determineTier(mainMatchCount);
  return { tier, mainMatchCount };
}

// ─────────────────────────────────────────────
// Batch Match
// ─────────────────────────────────────────────

export interface PerLineMatchResult {
  mainMatchCount: number;
  tier: PrizeTier | null;
}

export interface DetailedMatchResult {
  totalLines: number;
  winningLines: number;
  tierCounts: Map<PrizeTier, number>;
  perLineResults: PerLineMatchResult[];
}

export function matchLines(
  lines: LineValue[],
  result: DrawResultForMatch
): DetailedMatchResult {
  const tierCounts = new Map<PrizeTier, number>();
  const perLineResults: PerLineMatchResult[] = [];
  let winningLines = 0;

  for (const line of lines) {
    const { tier, mainMatchCount } = matchLine(line, result);
    perLineResults.push({ mainMatchCount, tier });

    if (tier != null) {
      winningLines++;
      tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
    }
  }

  return { totalLines: lines.length, winningLines, tierCounts, perLineResults };
}

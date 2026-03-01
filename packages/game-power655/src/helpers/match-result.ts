/**
 * Power 6/55 – Match Result
 *
 * So sánh 1 line (6 số) với kết quả quay:
 * - mainMatchCount: bao nhiêu số chính trùng (0-6)
 * - bonusMatched: bonus number có nằm trong dãy số player chọn không
 * - tiers: hạng giải trúng (luôn tối đa 1 tier theo quy tắc lĩnh hạng cao nhất)
 *
 * Bonus number logic:
 * - Bonus number luôn KHÁC 6 số winning chính (quay từ 49 còn lại)
 * - bonusMatched = bonus ∈ player's 6 numbers
 * - Khi player trùng 6/6 → cả 6 số = winning → bonus không thể match
 *   (vì bonus ∉ winning) → luôn chỉ trúng JP1
 * - Khi player trùng 5/6 → có 1 số "sai" → bonus match nếu bonus = số sai đó
 *   → trúng JP2
 */

import type { PrizeTier } from "../entities/enums";
import type { LineValue, MainTuple, BonusNumber } from "../entities/types";
import { determineTiers, type LineMatchResult } from "../rules/prize-tiers";

export interface DrawResultForMatch {
  winningMain: MainTuple;
  bonusNumber: BonusNumber;
}

function countMainMatches(lineMain: MainTuple, winMain: MainTuple): number {
  const winSet = new Set(winMain);
  let count = 0;
  for (const n of lineMain) {
    if (winSet.has(n)) count++;
  }
  return count;
}

/**
 * Bonus match: bonus number nằm trong số player chọn.
 * Vì bonus luôn ∉ winning 6, chỉ có ý nghĩa khi player trùng < 6/6.
 */
function checkBonusMatch(
  lineMain: MainTuple,
  bonusNumber: BonusNumber,
): boolean {
  return lineMain.includes(bonusNumber);
}

export function matchLine(
  line: LineValue,
  result: DrawResultForMatch
): { tiers: PrizeTier[]; mainMatchCount: number; bonusMatched: boolean } {
  const mainMatchCount = countMainMatches(line.main, result.winningMain);
  const bonusMatched = checkBonusMatch(line.main, result.bonusNumber);
  const tiers = determineTiers(mainMatchCount, bonusMatched);

  return { tiers, mainMatchCount, bonusMatched };
}

// ─── Batch Match ───

export interface PerLineMatchResult {
  mainMatchCount: number;
  bonusMatched: boolean;
  tiers: PrizeTier[];
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
    const { tiers, mainMatchCount, bonusMatched } = matchLine(line, result);
    perLineResults.push({ mainMatchCount, bonusMatched, tiers });

    if (tiers.length > 0) {
      winningLines++;
      for (const tier of tiers) {
        tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
      }
    }
  }

  return { totalLines: lines.length, winningLines, tierCounts, perLineResults };
}

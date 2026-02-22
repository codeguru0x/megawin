/**
 * Lotto 5/35 – Match Result
 *
 * So sánh 1 line với kết quả quay để xác định:
 * - Bao nhiêu số chính trùng
 * - Số đặc biệt có trùng không
 * - Hạng giải trúng
 *
 * Dùng trong settle flow: expand lines → match từng line → aggregate tier counts.
 */

import type { Lotto535PrizeTier } from "../entities/lotto535.enums";
import type {
  Lotto535LineValue,
  Lotto535MainTuple,
  Lotto535Special,
} from "../entities/lotto535.types";
import { determineTier, type LineMatchResult } from "../rules/prize-tiers";

// ─────────────────────────────────────────────
// Draw Result (input)
// ─────────────────────────────────────────────

/** Kết quả kỳ quay – input cho matching. */
export interface DrawResultForMatch {
  winningMain: Lotto535MainTuple;
  winningSpecial: Lotto535Special;
}

// ─────────────────────────────────────────────
// Match Functions
// ─────────────────────────────────────────────

/**
 * Đếm số lượng số chính trùng giữa line và kết quả.
 * Cả 2 đều phải sorted tăng dần (canonical).
 */
function countMainMatches(
  lineMain: Lotto535MainTuple,
  winMain: Lotto535MainTuple,
): number {
  const winSet = new Set(winMain);
  let count = 0;
  for (const n of lineMain) {
    if (winSet.has(n)) count++;
  }
  return count;
}

/**
 * Match 1 line với kết quả quay.
 *
 * @param line - Line con (5 chính + 1 đặc biệt)
 * @param result - Kết quả quay
 * @returns Chi tiết match: tier, mainMatchCount, specialMatched
 */
export function matchLine(
  line: Lotto535LineValue,
  result: DrawResultForMatch,
): LineMatchResult {
  const mainMatchCount = countMainMatches(line.main, result.winningMain);
  const specialMatched = line.special === result.winningSpecial;
  const tier = determineTier(mainMatchCount, specialMatched);

  return { tier, mainMatchCount, specialMatched };
}

// ─────────────────────────────────────────────
// Batch Match (cho settle)
// ─────────────────────────────────────────────

/** Kết quả match aggregate cho 1 board hoặc toàn bộ ticket. */
export interface AggregateMatchResult {
  /** Tổng lines. */
  totalLines: number;

  /** Số lines trúng (bất kỳ tier nào). */
  winningLines: number;

  /** Chi tiết theo tier: tier → số lines trúng. */
  tierCounts: Map<Lotto535PrizeTier, number>;
}

/**
 * Match nhiều lines với kết quả quay, aggregate theo tier.
 *
 * @param lines - Danh sách lines
 * @param result - Kết quả quay
 * @returns Aggregate: totalLines, winningLines, tierCounts
 */
export function matchLines(
  lines: Lotto535LineValue[],
  result: DrawResultForMatch,
): AggregateMatchResult {
  const tierCounts = new Map<Lotto535PrizeTier, number>();
  let winningLines = 0;

  for (const line of lines) {
    const { tier } = matchLine(line, result);
    if (tier != null) {
      winningLines++;
      tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
    }
  }

  return {
    totalLines: lines.length,
    winningLines,
    tierCounts,
  };
}

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

import type { PrizeTier } from "../entities/enums";
import type { LineValue, MainTuple, Special } from "../entities/types";
import { determineTier, type LineMatchResult } from "../rules/prize-tiers";

// ─────────────────────────────────────────────
// Draw Result (input)
// ─────────────────────────────────────────────

/** Kết quả kỳ quay – input cho matching. */
export interface DrawResultForMatch {
  winningMain: MainTuple;
  winningSpecial: Special;
}

// ─────────────────────────────────────────────
// Match Functions
// ─────────────────────────────────────────────

/**
 * Đếm số lượng số chính trùng giữa line và kết quả.
 * Cả 2 đều phải sorted tăng dần (canonical).
 */
function countMainMatches(lineMain: MainTuple, winMain: MainTuple): number {
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
  line: LineValue,
  result: DrawResultForMatch
): LineMatchResult {
  const mainMatchCount = countMainMatches(line.main, result.winningMain);
  const specialMatched = line.special === result.winningSpecial;
  const tier = determineTier(mainMatchCount, specialMatched);

  return { tier, mainMatchCount, specialMatched };
}

// ─────────────────────────────────────────────
// Batch Match (cho settle)
// ─────────────────────────────────────────────

/** Kết quả match 1 line — dùng để build TicketLineDoc. */
export interface PerLineMatchResult {
  mainMatchCount: number;
  specialMatched: boolean;
  tier: PrizeTier | null;
}

/** Kết quả match aggregate + per-line cho toàn bộ ticket. */
export interface DetailedMatchResult {
  /** Tổng lines. */
  totalLines: number;

  /** Số lines trúng (bất kỳ tier nào). */
  winningLines: number;

  /** Chi tiết theo tier: tier → số lines trúng. */
  tierCounts: Map<PrizeTier, number>;

  /** Kết quả match từng line (1:1 với input lines array). */
  perLineResults: PerLineMatchResult[];
}

/**
 * Match nhiều lines với kết quả quay.
 * Trả cả aggregate (tierCounts) lẫn per-line results trong 1 pass.
 *
 * @param lines - Danh sách lines
 * @param result - Kết quả quay
 * @returns Detailed: totalLines, winningLines, tierCounts, perLineResults
 */
export function matchLines(
  lines: LineValue[],
  result: DrawResultForMatch
): DetailedMatchResult {
  const tierCounts = new Map<PrizeTier, number>();
  const perLineResults: PerLineMatchResult[] = [];
  let winningLines = 0;

  for (const line of lines) {
    const { tier, mainMatchCount, specialMatched } = matchLine(line, result);
    perLineResults.push({ mainMatchCount, specialMatched, tier });

    if (tier != null) {
      winningLines++;
      tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
    }
  }

  return {
    totalLines: lines.length,
    winningLines,
    tierCounts,
    perLineResults,
  };
}

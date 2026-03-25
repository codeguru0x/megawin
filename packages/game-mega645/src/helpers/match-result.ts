/**
 * Mega 6/45 – Match Result
 *
 * So sánh lines của vé với kết quả quay để xác định hạng giải.
 * Mega 6/45 chỉ có số chính (6 số từ 1-45), không có số đặc biệt/bonus.
 *
 * Quy trình match cho 1 entry:
 *   expandAllBoards(ticket) → lines[] → matchLines(lines, drawResult)
 *     → { perLineResults, tierCounts }
 *   Mỗi line match độc lập, tổng hợp thành tierCounts để tính payout.
 */

import type { PrizeTier } from "../entities/enums";
import type { LineValue } from "../entities/types";
import { determineTier, type LineMatchResult } from "../rules/prize-tiers";

export interface DrawResultForMatch {
  /**
   * 6 số trúng thưởng theo thứ tự quay gốc.
   * readonly string[] — tương thích cả string[] (từ DB) và test data.
   */
  winningNumbers: readonly string[];
}

/**
 * Đếm số lượng số chính của 1 line trùng với kết quả quay.
 * Dùng Set để tra nhanh O(1) — tránh O(n²) của vòng lặp lồng nhau.
 *
 * @returns Số lượng số trùng (0-6).
 */
function countMatches(lineMain: readonly string[], winMain: readonly string[]): number {
  const winSet = new Set(winMain);
  let count = 0;
  for (const n of lineMain) {
    if (winSet.has(n)) count++;
  }
  return count;
}

/**
 * So khớp 1 line với kết quả quay → xác định hạng giải và số lượng trùng.
 *
 * @returns LineMatchResult: { tier, matchCount }
 *   - tier = null  nếu < 3 số trùng (không trúng giải nào)
 *   - tier = "jackpot" nếu 6/6 số trùng
 */
export function matchLine(line: LineValue, result: DrawResultForMatch): LineMatchResult {
  const matchCount = countMatches(line.numbers, result.winningNumbers);
  const tier = determineTier(matchCount);
  return { tier, matchCount };
}

// ─────────────────────────────────────────────
// Batch Match
// ─────────────────────────────────────────────

/** Kết quả match của 1 line cụ thể (dùng để tạo TicketLineDoc). */
export interface PerLineMatchResult {
  matchCount: number;
  tier: PrizeTier | null;
}

/**
 * Kết quả match toàn bộ lines của 1 entry (ticket trong 1 kỳ quay).
 *
 * tierCounts: Map<tier, số line trúng hạng đó> — dùng để tính payout.
 * perLineResults[i]: match result của lines[i] — dùng để lưu TicketLineDoc.
 */
export interface DetailedMatchResult {
  /** Tổng số lines đã match. */
  totalLines: number;
  /** Số lines trúng ít nhất 1 giải (tier != null). */
  winningLines: number;
  /** Số line trúng theo từng hạng giải. Chỉ chứa tier có hitCount > 0. */
  tierCounts: Map<PrizeTier, number>;
  /** Chi tiết từng line theo thứ tự tương ứng với mảng lines input. */
  perLineResults: PerLineMatchResult[];
}

/**
 * Match toàn bộ lines của 1 entry vs kết quả quay — trả về kết quả tổng hợp.
 * Dùng trong SettleEntries để tính winAmount và tạo TicketLineDocs.
 *
 * @param lines  - Output của expandAllBoards(ticket.boards).
 * @param result - Kết quả quay (winningNumbers từ DrawDoc).
 */
export function matchLines(lines: LineValue[], result: DrawResultForMatch): DetailedMatchResult {
  const tierCounts = new Map<PrizeTier, number>();
  const perLineResults: PerLineMatchResult[] = [];
  let winningLines = 0;

  for (const line of lines) {
    const { tier, matchCount } = matchLine(line, result);
    perLineResults.push({ matchCount, tier });

    if (tier != null) {
      winningLines++;
      // Cộng dồn số line trúng hạng này (1 entry bao có thể trúng nhiều lines cùng tier).
      tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
    }
  }

  return { totalLines: lines.length, winningLines, tierCounts, perLineResults };
}

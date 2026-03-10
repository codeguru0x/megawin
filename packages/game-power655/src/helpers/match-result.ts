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

/**
 * Đếm số lượng số chính trùng giữa line player chọn và kết quả quay.
 *
 * Thuật toán: chuyển winning numbers thành Set rồi duyệt line, đếm giao.
 * Công thức: mainMatchCount = |lineMain ∩ winMain|, kết quả 0-6.
 *
 * Dùng Set cho O(1) lookup → tổng O(6+6) = O(12) ≈ O(1) vì kích thước cố định.
 *
 * @param lineMain - 6 số chính player chọn (MainTuple)
 * @param winMain  - 6 số chính kết quả quay (MainTuple)
 * @returns Số lượng số trùng (0-6)
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
 * Kiểm tra bonus number có nằm trong 6 số player chọn không.
 *
 * Bonus number luôn ∉ winning set (quay từ 49 quả bóng còn lại sau khi rút 6 chính).
 * → Chỉ có ý nghĩa khi player trùng < 6/6 (1 trong các số "sai" = bonus → JP2).
 * → Khi player trùng 6/6, cả 6 số = winning set, bonus KHÔNG THỂ match → chỉ JP1.
 *
 * @param lineMain    - 6 số chính player chọn (MainTuple)
 * @param bonusNumber - Bonus number từ kết quả quay
 * @returns true nếu bonus number nằm trong 6 số player chọn
 */
function checkBonusMatch(
  lineMain: MainTuple,
  bonusNumber: BonusNumber,
): boolean {
  return lineMain.includes(bonusNumber);
}

/**
 * Match 1 line (bộ 6 số) với kết quả quay, trả về hạng giải.
 *
 * Pipeline: countMainMatches → checkBonusMatch → determineTiers.
 * determineTiers áp dụng quy tắc:
 *   6/6           → Jackpot1
 *   5/6 + bonus   → Jackpot2
 *   5/6 (no bonus)→ Tier1
 *   4/6           → Tier2
 *   3/6           → Tier3
 *   ≤2/6          → [] (không trúng)
 *
 * Mỗi line chỉ trúng hạng CAO NHẤT phù hợp (tiers.length ≤ 1).
 *
 * @param line   - Bộ 6 số player chọn (LineValue)
 * @param result - Kết quả quay (6 số chính + bonus number)
 * @returns tiers (mảng hạng giải, thường 0 hoặc 1 phần tử), mainMatchCount, bonusMatched
 */
export function matchLine(
  line: LineValue,
  result: DrawResultForMatch
): { tiers: PrizeTier[]; mainMatchCount: number; bonusMatched: boolean } {
  const mainMatchCount = countMainMatches(line.main, result.winningMain);
  const bonusMatched = checkBonusMatch(line.main, result.bonusNumber);
  const tiers = determineTiers(mainMatchCount, bonusMatched);

  return { tiers, mainMatchCount, bonusMatched };
}

// ─── Batch Match ────────────────────────────────────────────────────────────────

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

/**
 * Match nhiều lines cùng lúc với kết quả quay — dùng trong settle pipeline.
 *
 * Duyệt từng line, gọi matchLine() rồi tổng hợp:
 * - tierCounts: Map<PrizeTier, số lần trúng> — dùng để tính thưởng cố định.
 * - winningLines: tổng số line trúng ít nhất 1 hạng giải (≥ Tier3 = trùng 3/6).
 * - perLineResults: kết quả chi tiết từng line (cho UI và audit trail).
 *
 * Với Bao N, 1 board có thể sinh C(N,6) lines → nhiều line trúng các hạng khác nhau.
 * Ví dụ: Bao 8, trúng 6/8 số → C(6,6)=1 line JP1 + C(6,5)×C(2,1)=12 lines Tier1 + ...
 *
 * @param lines  - Mảng các bộ 6 số (đã expand từ boards)
 * @param result - Kết quả quay (6 số chính + bonus number)
 * @returns Kết quả match tổng hợp: totalLines, winningLines, tierCounts, perLineResults
 */
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

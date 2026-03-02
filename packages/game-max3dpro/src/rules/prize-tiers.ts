/**
 * Max 3D Pro – Prize Tier Rules
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * I. KẾT QUẢ QUAY THƯỞNG
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Mỗi kỳ quay 20 lần để chọn ra 20 bộ ba số:
 * - Giải Đặc Biệt: 02 lần → 2 bộ ba số
 * - Giải Nhất:      04 lần → 4 bộ ba số
 * - Giải Nhì:       06 lần → 6 bộ ba số
 * - Giải Ba:        08 lần → 8 bộ ba số
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * II. CÁCH TÍNH THƯỞNG MAX 3D PRO
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Max 3D Pro luôn chơi 2 bộ ba số (1 cặp). So khớp cả 2 bộ.
 *
 * Giải ĐB:        trùng 2 bộ ba số giải ĐB ĐÚNG thứ tự quay → 2,000,000,000
 * Giải phụ ĐB:    trùng 2 bộ ba số giải ĐB NGƯỢC thứ tự → 400,000,000
 * Giải Nhất:      trùng bất kỳ 2 trong 4 bộ ba số giải Nhất → 30,000,000
 * Giải Nhì:       trùng bất kỳ 2 trong 6 bộ ba số giải Nhì → 10,000,000
 * Giải Ba:        trùng bất kỳ 2 trong 8 bộ ba số giải Ba → 4,000,000
 * Giải Tư:        trùng bất kỳ 2 bộ ba số của giải ĐB/Nhất/Nhì/Ba → 1,000,000
 * Giải Năm:       trùng 1 bộ ba số giải ĐB bất kỳ → 100,000
 * Giải Sáu:       trùng 1 bộ ba số Nhất/Nhì/Ba bất kỳ → 40,000
 *
 * Nếu 2 bộ ba số GIỐNG NHAU → giải thưởng x2 (từ Nhất đến Sáu),
 * bằng tổng giá trị giải ĐB + phụ ĐB cho hạng ĐB/phụ ĐB.
 */

import { PrizeTier } from "../entities/enums";
import type { Triplet, PrizeAmounts } from "../entities/types";
import type { Max3dproDrawResult } from "../entities/draw-result";

// ─────────────────────────────────────────────
// Matching Utilities
// ─────────────────────────────────────────────

type BasicTier = "special" | "first" | "second" | "third";

export function flattenDrawResult(result: Max3dproDrawResult): {
  allTriplets: Triplet[];
  byTier: Map<BasicTier, Triplet[]>;
} {
  const byTier = new Map<BasicTier, Triplet[]>();
  byTier.set("special", [...result.special]);
  byTier.set("first", [...result.first]);
  byTier.set("second", [...result.second]);
  byTier.set("third", [...result.third]);

  const allTriplets = [
    ...result.special,
    ...result.first,
    ...result.second,
    ...result.third,
  ];

  return { allTriplets, byTier };
}

// ─────────────────────────────────────────────
// Max 3D Pro – Pair Matching
// ─────────────────────────────────────────────

export interface PairMatchResult {
  tier: PrizeTier | null;
  winAmount: number;
  matchedTriplets: Array<{ triplet: Triplet; matchedInTier: BasicTier }>;
}

/**
 * So khớp 1 cặp hai bộ ba số với kết quả quay (Max 3D Pro).
 *
 * Thứ tự ưu tiên:
 *   ĐB > phụ ĐB > Nhất > Nhì > Ba > Tư > Năm > Sáu
 *
 * Giải ĐB:     first trùng special[0] VÀ second trùng special[1] (ĐÚNG thứ tự)
 * Phụ ĐB:      first trùng special[1] VÀ second trùng special[0] (NGƯỢC thứ tự)
 * Giải Nhất:    cả 2 bộ đều trùng trong nhóm Nhất (4 bộ)
 * Giải Nhì:     cả 2 bộ đều trùng trong nhóm Nhì (6 bộ)
 * Giải Ba:      cả 2 bộ đều trùng trong nhóm Ba (8 bộ)
 * Giải Tư:      cả 2 bộ đều trùng trong bất kỳ nhóm ĐB/Nhất/Nhì/Ba (cross-tier)
 * Giải Năm:     chỉ 1 bộ trùng giải ĐB
 * Giải Sáu:     chỉ 1 bộ trùng Nhất/Nhì/Ba
 */
export function matchPair(
  first: Triplet,
  second: Triplet,
  result: Max3dproDrawResult,
  prizes: PrizeAmounts
): PairMatchResult {
  const { byTier, allTriplets } = flattenDrawResult(result);
  const isDuplicate = first === second;
  const multiplier = isDuplicate ? 2 : 1;

  const matchedTriplets: PairMatchResult["matchedTriplets"] = [];

  function findTier(t: Triplet): BasicTier | null {
    const tierPriority: BasicTier[] = ["special", "first", "second", "third"];
    for (const tier of tierPriority) {
      if (byTier.get(tier)!.includes(t)) return tier;
    }
    return null;
  }

  const tier1 = findTier(first);
  const tier2 = findTier(second);

  if (tier1) matchedTriplets.push({ triplet: first, matchedInTier: tier1 });
  if (tier2) matchedTriplets.push({ triplet: second, matchedInTier: tier2 });

  const matchCount = matchedTriplets.length;

  // Cả 2 bộ đều trùng
  if (matchCount === 2) {
    // Giải ĐB: đúng thứ tự quay
    if (first === result.special[0] && second === result.special[1]) {
      return {
        tier: PrizeTier.Special,
        winAmount: prizes.special * multiplier,
        matchedTriplets,
      };
    }

    // Phụ ĐB: ngược thứ tự quay
    if (first === result.special[1] && second === result.special[0]) {
      return {
        tier: PrizeTier.SpecialSub,
        winAmount: prizes.specialSub * multiplier,
        matchedTriplets,
      };
    }

    // Giải Nhất: cả 2 trùng trong nhóm Nhất
    if (tier1 === "first" && tier2 === "first") {
      return {
        tier: PrizeTier.First,
        winAmount: prizes.first * multiplier,
        matchedTriplets,
      };
    }

    // Giải Nhì: cả 2 trùng trong nhóm Nhì
    if (tier1 === "second" && tier2 === "second") {
      return {
        tier: PrizeTier.Second,
        winAmount: prizes.second * multiplier,
        matchedTriplets,
      };
    }

    // Giải Ba: cả 2 trùng trong nhóm Ba
    if (tier1 === "third" && tier2 === "third") {
      return {
        tier: PrizeTier.Third,
        winAmount: prizes.third * multiplier,
        matchedTriplets,
      };
    }

    // Giải Tư: cả 2 trùng bất kỳ nhóm nào (cross-tier)
    return {
      tier: PrizeTier.Fourth,
      winAmount: prizes.fourth * multiplier,
      matchedTriplets,
    };
  }

  // Chỉ 1 bộ trùng
  if (matchCount === 1) {
    const matchedTier = matchedTriplets[0]!.matchedInTier;
    if (matchedTier === "special") {
      return {
        tier: PrizeTier.Fifth,
        winAmount: prizes.fifth * multiplier,
        matchedTriplets,
      };
    }
    // Trùng Nhất/Nhì/Ba
    return {
      tier: PrizeTier.Sixth,
      winAmount: prizes.sixth * multiplier,
      matchedTriplets,
    };
  }

  return { tier: null, winAmount: 0, matchedTriplets: [] };
}

// ─────────────────────────────────────────────
// Combined Match for a Board
// ─────────────────────────────────────────────

export interface BoardMatchResult {
  boardNo: string;
  playMode: string;
  playType: string;
  totalWinAmount: number;
  lineResults: Array<{
    lineIndex: number;
    triplets: Triplet[];
    tier: PrizeTier | null;
    winAmount: number;
  }>;
}

/**
 * So khớp toàn bộ 1 board với kết quả quay.
 * Board tạo ra nhiều cặp (pairs), mỗi cặp 1 line.
 */
export function matchBoard(
  board: {
    boardNo: string;
    playMode: string;
    playType: string;
    pairs: Array<{ first: Triplet; second: Triplet }>;
  },
  result: Max3dproDrawResult,
  prizes: PrizeAmounts
): BoardMatchResult {
  const lineResults: BoardMatchResult["lineResults"] = [];
  let totalWinAmount = 0;

  for (let i = 0; i < board.pairs.length; i++) {
    const pair = board.pairs[i]!;
    const pairResult = matchPair(pair.first, pair.second, result, prizes);
    lineResults.push({
      lineIndex: i,
      triplets: [pair.first, pair.second],
      tier: pairResult.tier,
      winAmount: pairResult.winAmount,
    });
    totalWinAmount += pairResult.winAmount;
  }

  return {
    boardNo: board.boardNo,
    playMode: board.playMode,
    playType: board.playType,
    totalWinAmount,
    lineResults,
  };
}

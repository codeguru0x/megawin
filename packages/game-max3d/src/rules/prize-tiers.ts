/**
 * Max 3D – Prize Tier Rules
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
 * Mỗi bộ ba số gồm 3 chữ số từ 0-9 (000-999).
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * II. CÁCH TÍNH THƯỞNG
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * A) Max 3D Cơ Bản (1 bộ ba số, straight):
 *    So khớp ĐÚNG THỨ TỰ với kết quả quay.
 *    - Đặc Biệt: trùng 1 trong 2 bộ ĐB → 1,000,000 VND
 *    - Nhất: trùng 1 trong 4 bộ Nhất → 350,000 VND
 *    - Nhì: trùng 1 trong 6 bộ Nhì → 210,000 VND
 *    - Ba: trùng 1 trong 8 bộ Ba → 100,000 VND
 *
 * B) Max 3D Cơ Bản (1 bộ ba số, tổ hợp):
 *    So khớp KHÔNG CẦN THỨ TỰ.
 *    Tổ hợp 3 (2 chữ số giống): giải thưởng = straight × 3 hoán vị / tổng hoán vị
 *    Tổ hợp 6 (3 chữ số khác nhau): giải thưởng = straight × 6 hoán vị / tổng hoán vị
 *
 *    Combo3: ĐB=340k, Nhất=120k, Nhì=70k, Ba=30k
 *    Combo6: ĐB=170k, Nhất=60k, Nhì=35k, Ba=15k
 *
 * C) Max 3D+ (2 bộ ba số):
 *    Người chơi chọn 2 bộ ba số KHÁC NHAU. So khớp cả 2 bộ.
 *    Nếu chọn 2 bộ giống nhau, giải thưởng x2.
 *    7 hạng giải.
 */

import {
  BasicPrizeTier,
  PlusPrizeTier,
  PlayMode,
  PlayType,
} from "../entities/enums";
import type {
  Triplet,
  BasicPrizeAmounts,
  PlusPrizeAmounts,
  ComboPrizeAmounts,
  Max3dPrizeConfig,
} from "../entities/types";
import type { Max3dDrawResult } from "../entities/draw-result";

// ─────────────────────────────────────────────
// Matching Utilities
// ─────────────────────────────────────────────

/**
 * Tất cả bộ ba số trong kết quả quay, gom theo hạng giải.
 */
export function flattenDrawResult(result: Max3dDrawResult): {
  allTriplets: Triplet[];
  byTier: Map<BasicPrizeTier, Triplet[]>;
} {
  const byTier = new Map<BasicPrizeTier, Triplet[]>();
  byTier.set(BasicPrizeTier.Special, [...result.special]);
  byTier.set(BasicPrizeTier.First, [...result.first]);
  byTier.set(BasicPrizeTier.Second, [...result.second]);
  byTier.set(BasicPrizeTier.Third, [...result.third]);

  const allTriplets = [
    ...result.special,
    ...result.first,
    ...result.second,
    ...result.third,
  ];

  return { allTriplets, byTier };
}

// ─────────────────────────────────────────────
// Triplet Permutation Helpers
// ─────────────────────────────────────────────

/**
 * Tạo tất cả hoán vị duy nhất của 1 bộ ba số.
 * - 3 chữ số khác nhau (abc) → 6 hoán vị
 * - 2 chữ số giống (aab) → 3 hoán vị
 * - 3 chữ số giống (aaa) → 1 hoán vị
 */
export function getUniquePermutations(triplet: Triplet): Triplet[] {
  const digits = triplet.split("");
  const perms = new Set<string>();

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (j === i) continue;
      for (let k = 0; k < 3; k++) {
        if (k === i || k === j) continue;
        perms.add(`${digits[i]}${digits[j]}${digits[k]}`);
      }
    }
  }

  return Array.from(perms);
}

/**
 * Xác định loại tổ hợp dựa trên 3 chữ số.
 * - 3 chữ số khác nhau → 6 hoán vị (combo6)
 * - 2 chữ số giống → 3 hoán vị (combo3)
 * - 3 chữ số giống → 1 hoán vị (straight only)
 */
export function getPermutationCount(triplet: Triplet): number {
  const digits = triplet.split("");
  const unique = new Set(digits).size;
  if (unique === 3) return 6;
  if (unique === 2) return 3;
  return 1;
}

// ─────────────────────────────────────────────
// Max 3D Cơ Bản – Matching (1 bộ ba số)
// ─────────────────────────────────────────────

export interface BasicMatchResult {
  tier: BasicPrizeTier | null;
  winAmount: number;
  hitTriplet?: Triplet;
  hitTier?: BasicPrizeTier;
}

/**
 * So khớp 1 bộ ba số (straight) với kết quả quay.
 * Ưu tiên hạng giải cao nhất (ĐB > Nhất > Nhì > Ba).
 */
export function matchBasicStraight(
  playerTriplet: Triplet,
  result: Max3dDrawResult,
  prizes: BasicPrizeAmounts
): BasicMatchResult {
  const { byTier } = flattenDrawResult(result);
  const tierPriority: BasicPrizeTier[] = [
    BasicPrizeTier.Special,
    BasicPrizeTier.First,
    BasicPrizeTier.Second,
    BasicPrizeTier.Third,
  ];

  for (const tier of tierPriority) {
    const triplets = byTier.get(tier)!;
    if (triplets.includes(playerTriplet)) {
      return {
        tier,
        winAmount: prizes[tier],
        hitTriplet: playerTriplet,
        hitTier: tier,
      };
    }
  }

  return { tier: null, winAmount: 0 };
}

/**
 * So khớp 1 bộ ba số (combo) với kết quả quay.
 * Expand tất cả hoán vị → so khớp từng hoán vị straight.
 * Trả thưởng = số lần trùng × giải thưởng combo tương ứng.
 */
export function matchBasicCombo(
  playerTriplet: Triplet,
  playType: typeof PlayType.Combo3 | typeof PlayType.Combo6,
  result: Max3dDrawResult,
  comboPrizes: ComboPrizeAmounts
): BasicMatchResult {
  const permutations = getUniquePermutations(playerTriplet);
  const prizeSet =
    playType === PlayType.Combo3 ? comboPrizes.combo3 : comboPrizes.combo6;
  const { byTier } = flattenDrawResult(result);

  const tierPriority: BasicPrizeTier[] = [
    BasicPrizeTier.Special,
    BasicPrizeTier.First,
    BasicPrizeTier.Second,
    BasicPrizeTier.Third,
  ];

  let bestTier: BasicPrizeTier | null = null;
  let totalWin = 0;

  for (const perm of permutations) {
    for (const tier of tierPriority) {
      const triplets = byTier.get(tier)!;
      if (triplets.includes(perm)) {
        if (
          !bestTier ||
          tierPriority.indexOf(tier) < tierPriority.indexOf(bestTier)
        ) {
          bestTier = tier;
        }
        totalWin += prizeSet[tier];
        break;
      }
    }
  }

  return { tier: bestTier, winAmount: totalWin };
}

// ─────────────────────────────────────────────
// Max 3D+ – Matching (2 bộ ba số)
// ─────────────────────────────────────────────

export interface PlusMatchResult {
  tier: PlusPrizeTier | null;
  winAmount: number;
  matchedTriplets: Array<{ triplet: Triplet; matchedInTier: BasicPrizeTier }>;
}

/**
 * So khớp 2 bộ ba số (Max 3D+) với kết quả quay.
 *
 * Luật trả thưởng (áp dụng cho vé 2 bộ ba số KHÁC NHAU):
 *
 * Giải ĐB:  trùng 2 bộ ba số giải ĐB → 1,000,000,000
 * Giải Nhất: trùng 2 trong 4 bộ ba số giải Nhất → 40,000,000
 * Giải Nhì:  trùng 2 trong 6 bộ ba số giải Nhì → 10,000,000
 * Giải Ba:   trùng 2 trong 8 bộ ba số giải Ba → 5,000,000
 * Giải Tư:   trùng 2 bộ ba số thuộc bất kỳ giải ĐB/Nhất/Nhì/Ba → 1,000,000
 * Giải Năm:  trùng 1 bộ ba số giải ĐB bất kỳ → 150,000
 * Giải Sáu:  trùng 1 bộ ba số giải Nhất/Nhì/Ba bất kỳ → 40,000
 *
 * Nếu 2 bộ ba số GIỐNG NHAU → giải thưởng × 2.
 */
export function matchPlus(
  triplet1: Triplet,
  triplet2: Triplet,
  result: Max3dDrawResult,
  prizes: PlusPrizeAmounts
): PlusMatchResult {
  const { byTier, allTriplets } = flattenDrawResult(result);
  const isDuplicate = triplet1 === triplet2;

  const matchedTriplets: Array<{
    triplet: Triplet;
    matchedInTier: BasicPrizeTier;
  }> = [];

  function findTier(t: Triplet): BasicPrizeTier | null {
    const tierPriority: BasicPrizeTier[] = [
      BasicPrizeTier.Special,
      BasicPrizeTier.First,
      BasicPrizeTier.Second,
      BasicPrizeTier.Third,
    ];
    for (const tier of tierPriority) {
      if (byTier.get(tier)!.includes(t)) return tier;
    }
    return null;
  }

  const tier1 = findTier(triplet1);
  const tier2 = findTier(triplet2);

  if (tier1) matchedTriplets.push({ triplet: triplet1, matchedInTier: tier1 });
  if (tier2) matchedTriplets.push({ triplet: triplet2, matchedInTier: tier2 });

  const multiplier = isDuplicate ? 2 : 1;
  const matchCount = matchedTriplets.length;

  if (matchCount === 2) {
    if (tier1 === BasicPrizeTier.Special && tier2 === BasicPrizeTier.Special) {
      return {
        tier: PlusPrizeTier.Special,
        winAmount: prizes.special * multiplier,
        matchedTriplets,
      };
    }
    if (tier1 === BasicPrizeTier.First && tier2 === BasicPrizeTier.First) {
      return {
        tier: PlusPrizeTier.First,
        winAmount: prizes.first * multiplier,
        matchedTriplets,
      };
    }
    if (tier1 === BasicPrizeTier.Second && tier2 === BasicPrizeTier.Second) {
      return {
        tier: PlusPrizeTier.Second,
        winAmount: prizes.second * multiplier,
        matchedTriplets,
      };
    }
    if (tier1 === BasicPrizeTier.Third && tier2 === BasicPrizeTier.Third) {
      return {
        tier: PlusPrizeTier.Third,
        winAmount: prizes.third * multiplier,
        matchedTriplets,
      };
    }
    return {
      tier: PlusPrizeTier.Fourth,
      winAmount: prizes.fourth * multiplier,
      matchedTriplets,
    };
  }

  if (matchCount === 1) {
    const matchedTier = matchedTriplets[0]!.matchedInTier;
    if (matchedTier === BasicPrizeTier.Special) {
      return {
        tier: PlusPrizeTier.Fifth,
        winAmount: prizes.fifth * multiplier,
        matchedTriplets,
      };
    }
    return {
      tier: PlusPrizeTier.Sixth,
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
  playMode: PlayMode;
  playType: PlayType;
  tier: BasicPrizeTier | PlusPrizeTier | null;
  winAmount: number;
  lineResults: Array<{
    lineIndex: number;
    triplets: Triplet[];
    tier: BasicPrizeTier | PlusPrizeTier | null;
    winAmount: number;
  }>;
}

/**
 * So khớp toàn bộ 1 board với kết quả quay.
 */
export function matchBoard(
  board: {
    boardNo: string;
    playMode: PlayMode;
    playType: PlayType;
    triplets: Triplet[];
  },
  result: Max3dDrawResult,
  prizeConfig: Max3dPrizeConfig
): BoardMatchResult {
  const lineResults: BoardMatchResult["lineResults"] = [];

  if (board.playMode === PlayMode.Plus) {
    const [t1, t2] = board.triplets as [Triplet, Triplet];
    const plusResult = matchPlus(t1, t2, result, prizeConfig.plus);
    lineResults.push({
      lineIndex: 0,
      triplets: [t1, t2],
      tier: plusResult.tier,
      winAmount: plusResult.winAmount,
    });

    return {
      boardNo: board.boardNo,
      playMode: board.playMode,
      playType: board.playType,
      tier: plusResult.tier,
      winAmount: plusResult.winAmount,
      lineResults,
    };
  }

  // Basic mode
  const triplet = board.triplets[0]!;

  if (
    board.playType === PlayType.Straight ||
    board.playType === PlayType.QuickPick
  ) {
    const basicResult = matchBasicStraight(triplet, result, prizeConfig.basic);
    lineResults.push({
      lineIndex: 0,
      triplets: [triplet],
      tier: basicResult.tier,
      winAmount: basicResult.winAmount,
    });

    return {
      boardNo: board.boardNo,
      playMode: board.playMode,
      playType: board.playType,
      tier: basicResult.tier,
      winAmount: basicResult.winAmount,
      lineResults,
    };
  }

  // Combo play type
  if (
    board.playType === PlayType.Combo3 ||
    board.playType === PlayType.Combo6
  ) {
    const comboResult = matchBasicCombo(
      triplet,
      board.playType,
      result,
      prizeConfig.combo
    );
    const permutations = getUniquePermutations(triplet);

    for (let i = 0; i < permutations.length; i++) {
      const perm = permutations[i]!;
      const permResult = matchBasicStraight(perm, result, prizeConfig.basic);
      const comboMultiplier =
        board.playType === PlayType.Combo3 ? 1 / 3 : 1 / 6;
      const permPrizeSet =
        board.playType === PlayType.Combo3
          ? prizeConfig.combo.combo3
          : prizeConfig.combo.combo6;

      lineResults.push({
        lineIndex: i,
        triplets: [perm],
        tier: permResult.tier,
        winAmount: permResult.tier ? permPrizeSet[permResult.tier] : 0,
      });
    }

    return {
      boardNo: board.boardNo,
      playMode: board.playMode,
      playType: board.playType,
      tier: comboResult.tier,
      winAmount: comboResult.winAmount,
      lineResults,
    };
  }

  return {
    boardNo: board.boardNo,
    playMode: board.playMode,
    playType: board.playType,
    tier: null,
    winAmount: 0,
    lineResults,
  };
}

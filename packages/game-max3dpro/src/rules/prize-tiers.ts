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

import { PrizeTier, BasicTier, BASIC_TIER_PRIORITY } from "../entities/enums";
import type { Triplet, PrizeAmounts } from "../entities/types";
import type { Max3dproDrawResult } from "../entities/draw-result";

// ─────────────────────────────────────────────
// Matching Utilities
// ─────────────────────────────────────────────

export function flattenDrawResult(result: Max3dproDrawResult): {
  allTriplets: Triplet[];
  byTier: Map<BasicTier, Triplet[]>;
} {
  const byTier = new Map<BasicTier, Triplet[]>();
  byTier.set(BasicTier.Special, [...result.special]);
  byTier.set(BasicTier.First, [...result.first]);
  byTier.set(BasicTier.Second, [...result.second]);
  byTier.set(BasicTier.Third, [...result.third]);

  const allTriplets = [
    ...result.special,
    ...result.first,
    ...result.second,
    ...result.third,
  ];

  return { allTriplets, byTier };
}

/**
 * Tìm hạng giải cao nhất mà triplet khớp trong kết quả quay.
 *
 * Duyệt theo thứ tự ưu tiên ĐB > Nhất > Nhì > Ba, trả ngay khi khớp.
 * Nếu triplet không khớp bất kỳ hạng nào → null.
 */
export function findTierInResult(
  triplet: Triplet,
  byTier: Map<BasicTier, Triplet[]>,
): BasicTier | null {
  for (const tier of BASIC_TIER_PRIORITY) {
    if (byTier.get(tier)!.includes(triplet)) return tier;
  }
  return null;
}

/**
 * Bipartite matching: đếm số triplet player khớp với entries RIÊNG BIỆT trong pool.
 *
 * Mỗi draw entry chỉ được dùng 1 lần (remove sau khi match).
 * Giải quyết đúng case duplicate: player ["096","096"] vs pool ["096","389"]
 * → chỉ match 1 (không phải 2).
 *
 * @example
 *   // Player ["096","389"] vs pool ["096","389"] → 2
 *   // Player ["096","096"] vs pool ["096","389"] → 1 (pool chỉ có 1 entry "096")
 *   // Player ["096","096"] vs pool ["096","096"] → 2 (pool có 2 entry "096")
 */
function countDistinctMatches(playerTriplets: Triplet[], pool: Triplet[]): number {
  const remaining = [...pool];
  let matched = 0;

  for (const pt of playerTriplets) {
    const idx = remaining.indexOf(pt);
    if (idx !== -1) {
      remaining.splice(idx, 1);
      matched++;
    }
  }

  return matched;
}

// ─────────────────────────────────────────────
// Max 3D Pro – Pair Matching
// ─────────────────────────────────────────────

/**
 * Kết quả 1 giải Pro đã trúng (dùng trong mảng wonTiers).
 */
export interface PairWonTier {
  /** Hạng giải Pro (special → sixth). */
  tier: PrizeTier;
  /** Giá trị giải thưởng (đã áp dụng multiplier nếu duplicate). */
  winAmount: number;
}

/**
 * Kết quả matching Max 3D Pro — có thể trúng NHIỀU giải đồng thời (gộp giải).
 *
 * Theo luật Vietlott: "Trường hợp người tham gia dự thưởng có kết hợp hai bộ ba số
 * tham gia dự thưởng trúng nhiều giải thưởng, người tham gia dự thưởng được lĩnh
 * thưởng bằng tổng số giải thưởng."
 */
export interface PairMatchResult {
  /** Tất cả giải đã trúng (có thể trúng nhiều giải đồng thời). */
  wonTiers: PairWonTier[];
  /** Tổng tiền thắng = Σ(wonTiers[].winAmount). */
  winAmount: number;
  /** Các triplet đã khớp kết quả quay (dùng cho audit/display). */
  matchedTriplets: Array<{ triplet: Triplet; matchedInTier: BasicTier }>;
}

/**
 * So khớp 1 cặp hai bộ ba số với kết quả quay (Max 3D Pro) — GỘP TẤT CẢ giải đạt điều kiện.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * LUẬT VIETLOTT MAX 3D PRO:
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 8 hạng giải, KHÔNG loại trừ lẫn nhau — người chơi lĩnh TẤT CẢ giải đạt điều kiện.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────────┐
 * │ GIẢI ĐẶC BIỆT (ordered pair — thứ tự first/second quan trọng)                │
 * │                                                                                 │
 * │  Giải ĐB:      first===special[0] && second===special[1]  → 2,000,000,000     │
 * │  Giải phụ ĐB:  first===special[1] && second===special[0]  → 400,000,000       │
 * ├─────────────────────────────────────────────────────────────────────────────────┤
 * │ NHÓM CẶP (bipartite matching — mỗi draw entry chỉ dùng 1 lần)                │
 * │                                                                                 │
 * │  Giải Nhất:  2 bộ khớp 2 entry Nhất riêng biệt        →     30,000,000       │
 * │  Giải Nhì:   2 bộ khớp 2 entry Nhì riêng biệt         →     10,000,000       │
 * │  Giải Ba:    2 bộ khớp 2 entry Ba riêng biệt           →      4,000,000       │
 * │  Giải Tư:    2 bộ khớp 2 entry BẤT KỲ riêng biệt      →      1,000,000       │
 * ├─────────────────────────────────────────────────────────────────────────────────┤
 * │ NHÓM ĐƠN (kiểm tra từng bộ ba riêng lẻ)                                       │
 * │                                                                                 │
 * │  Giải Năm:   1 bộ khớp entry ĐB bất kỳ                →        100,000       │
 * │  Giải Sáu:   1 bộ khớp entry Nhất/Nhì/Ba bất kỳ       →         40,000       │
 * └─────────────────────────────────────────────────────────────────────────────────┘
 *
 * DUPLICATE (2 bộ ba giống nhau) — QUY TẮC ĐẶC BIỆT:
 *   Theo Vietlott: "Giá trị giải thưởng sẽ cao gấp hai lần giá trị nêu ở bảng trên
 *   cho các hạng giải thưởng từ giải Nhất đến giải Sáu, bằng tổng giá trị giải
 *   Đặc biệt và giải phụ Đặc biệt cho hạng giải Đặc biệt/phụ Đặc biệt."
 *
 *   → Nhất→Sáu: prize × 2
 *   → ĐB hoặc phụ ĐB: winAmount = special + specialSub (KHÔNG phải prize × 2)
 *
 *   VD: Player "096"+"096", Special=["096","096"]
 *     → Giải ĐB: special + specialSub = 2,000,000,000 + 400,000,000 = 2,400,000,000
 *     → Giải Tư:     1,000,000 × 2 =     2,000,000
 *     → Giải Năm:      100,000 × 2 =       200,000
 *     → TỔNG:                         2,402,200,000
 *
 * @example Non-duplicate "096"+"683", Special=["096","389"], First=["683",...]
 *   → Giải Tư: 1,000,000 (cả 2 khớp 2 entry bất kỳ trong 20)
 *   → Giải Năm: 100,000 (096 khớp ĐB)
 *   → Giải Sáu: 40,000 (683 khớp Nhất)
 *   → TỔNG: 1,140,000
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
  const playerTriplets: [Triplet, Triplet] = [first, second];

  // ── Thu thập thông tin match của từng triplet (dùng cho audit) ─────
  const matchedTriplets: PairMatchResult["matchedTriplets"] = [];
  const tier1 = findTierInResult(first, byTier);
  const tier2 = findTierInResult(second, byTier);

  if (tier1) matchedTriplets.push({ triplet: first, matchedInTier: tier1 });
  if (tier2 && !isDuplicate) matchedTriplets.push({ triplet: second, matchedInTier: tier2 });

  const wonTiers: PairWonTier[] = [];

  // ── GIẢI ĐẶC BIỆT: ordered pair — thứ tự first/second quan trọng ──
  // Giải ĐB: first===special[0] && second===special[1] (ĐÚNG thứ tự quay)
  if (first === result.special[0] && second === result.special[1]) {
    // Duplicate ĐB: winAmount = special + specialSub (theo luật Vietlott)
    // Non-duplicate ĐB: winAmount = special
    const winAmount = isDuplicate
      ? prizes.special + prizes.specialSub
      : prizes.special;
    wonTiers.push({ tier: PrizeTier.Special, winAmount });
  }

  // Giải phụ ĐB: first===special[1] && second===special[0] (NGƯỢC thứ tự quay)
  if (first === result.special[1] && second === result.special[0]) {
    // Duplicate phụ ĐB: winAmount = special + specialSub (theo luật Vietlott)
    // Non-duplicate phụ ĐB: winAmount = specialSub
    const winAmount = isDuplicate
      ? prizes.special + prizes.specialSub
      : prizes.specialSub;
    wonTiers.push({ tier: PrizeTier.SpecialSub, winAmount });
  }

  // ── NHÓM CẶP: Giải Nhất → Tư (bipartite matching) ──

  // Giải Nhất: cả 2 khớp 2 entry Nhất riêng biệt
  const firstMatches = countDistinctMatches(playerTriplets, byTier.get(BasicTier.First)!);
  if (firstMatches >= 2) {
    wonTiers.push({ tier: PrizeTier.First, winAmount: prizes.first * multiplier });
  }

  // Giải Nhì: cả 2 khớp 2 entry Nhì riêng biệt
  const secondMatches = countDistinctMatches(playerTriplets, byTier.get(BasicTier.Second)!);
  if (secondMatches >= 2) {
    wonTiers.push({ tier: PrizeTier.Second, winAmount: prizes.second * multiplier });
  }

  // Giải Ba: cả 2 khớp 2 entry Ba riêng biệt
  const thirdMatches = countDistinctMatches(playerTriplets, byTier.get(BasicTier.Third)!);
  if (thirdMatches >= 2) {
    wonTiers.push({ tier: PrizeTier.Third, winAmount: prizes.third * multiplier });
  }

  // Giải Tư: cả 2 khớp 2 entry BẤT KỲ riêng biệt trong toàn bộ 20 kết quả
  const allMatches = countDistinctMatches(playerTriplets, allTriplets);
  if (allMatches >= 2) {
    wonTiers.push({ tier: PrizeTier.Fourth, winAmount: prizes.fourth * multiplier });
  }

  // ── NHÓM ĐƠN: Giải Năm, Sáu (kiểm tra từng triplet riêng lẻ) ────
  // Duplicate: chỉ có 1 unique triplet → kiểm tra 1 lần, ×2 đã tính vào multiplier.
  // Non-duplicate: kiểm tra 2 triplet độc lập.
  const tripletsToCheck = isDuplicate ? [first] : [first, second];

  for (const t of tripletsToCheck) {
    const tier = findTierInResult(t, byTier);
    if (!tier) continue;

    if (tier === BasicTier.Special) {
      wonTiers.push({ tier: PrizeTier.Fifth, winAmount: prizes.fifth * multiplier });
    } else {
      wonTiers.push({ tier: PrizeTier.Sixth, winAmount: prizes.sixth * multiplier });
    }
  }

  // ── Tổng thưởng = Σ tất cả giải đạt điều kiện ────────────────────
  const winAmount = wonTiers.reduce((sum, wt) => sum + wt.winAmount, 0);

  return { wonTiers, winAmount, matchedTriplets };
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
 * Board tạo ra nhiều cặp (pairs), mỗi cặp match độc lập.
 * Mỗi cặp có thể trúng nhiều giải → tạo 1 lineResult riêng cho mỗi giải trúng.
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

    // Mỗi giải trúng tạo 1 lineResult riêng → buildPayoutTiers đếm đúng hitCount per tier.
    if (pairResult.wonTiers.length === 0) {
      lineResults.push({
        lineIndex: i,
        triplets: [pair.first, pair.second],
        tier: null,
        winAmount: 0,
      });
    } else {
      for (const wt of pairResult.wonTiers) {
        lineResults.push({
          lineIndex: i,
          triplets: [pair.first, pair.second],
          tier: wt.tier,
          winAmount: wt.winAmount,
        });
      }
    }

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

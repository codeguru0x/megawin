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

import { BasicPrizeTier, PlusPrizeTier, PlayMode, PlayType } from "../entities/enums";
import { sumBy } from "@megawin/shared/utils/array";
import type {
  Triplet,
  BasicPrizeAmounts,
  PlusPrizeAmounts,
  ComboPrizeAmounts,
  Max3dPrizeConfig,
} from "../entities/types";
import type { Max3dDrawResult } from "../entities/draw-result";
import type { EntryPayoutTier } from "../entities/entry";

// ─────────────────────────────────────────────
// Module-level Constants
// ─────────────────────────────────────────────

/**
 * Thứ tự ưu tiên hạng giải Basic (ĐB > Nhất > Nhì > Ba).
 *
 * Khai báo module-level để tránh khởi tạo lại mỗi lần gọi match functions.
 * Settle loop gọi hàng trăm nghìn lần — tiết kiệm allocation.
 */
const BASIC_TIER_PRIORITY: readonly BasicPrizeTier[] = [
  BasicPrizeTier.Special,
  BasicPrizeTier.First,
  BasicPrizeTier.Second,
  BasicPrizeTier.Third,
] as const;

// ─────────────────────────────────────────────
// Matching Utilities
// ─────────────────────────────────────────────

/**
 * Kết quả flatten của draw result — dùng làm tham số cho tất cả các hàm matching.
 *
 * Tính 1 lần bên ngoài vòng lặp entries bằng `flattenDrawResult(drawResult)`,
 * truyền vào `matchBoard()` / `matchPlus()` để tránh flatten lại cho mỗi board.
 */
export interface FlattenedDrawResult {
  /** Tất cả 20 bộ ba số trong kết quả quay (special + first + second + third). */
  allTriplets: Triplet[];
  /** 20 bộ ba số gom theo hạng giải — dùng cho bipartite matching và findAllTiersInResult. */
  byTier: Map<BasicPrizeTier, Triplet[]>;
}

/**
 * Flatten kết quả quay thành `FlattenedDrawResult` để dùng cho matching.
 */
export function flattenDrawResult(result: Max3dDrawResult): FlattenedDrawResult {
  const byTier = new Map<BasicPrizeTier, Triplet[]>();
  byTier.set(BasicPrizeTier.Special, result.special);
  byTier.set(BasicPrizeTier.First, result.first);
  byTier.set(BasicPrizeTier.Second, result.second);
  byTier.set(BasicPrizeTier.Third, result.third);

  const allTriplets = [...result.special, ...result.first, ...result.second, ...result.third];

  return { allTriplets, byTier };
}

/**
 * Tìm hạng giải cao nhất mà triplet khớp trong kết quả quay.
 *
 * Duyệt theo thứ tự ưu tiên ĐB > Nhất > Nhì > Ba, trả ngay khi khớp.
 * Dùng cho Plus mode (Giải Năm/Sáu) — chỉ cần biết triplet thuộc nhóm nào.
 * Nếu triplet không khớp bất kỳ hạng nào → null.
 *
 * @example
 *   // Special = ["096", "389"], First = ["683", ...]
 *   findTierInResult("096", byTier) → "special"
 *   findTierInResult("683", byTier) → "first"
 *   findTierInResult("999", byTier) → null
 */
export function findTierInResult(
  triplet: Triplet,
  byTier: Map<BasicPrizeTier, Triplet[]>,
): BasicPrizeTier | null {
  for (const tier of BASIC_TIER_PRIORITY) {
    if (byTier.get(tier)!.includes(triplet)) {
      return tier;
    }
  }
  return null;
}

/**
 * Tìm TẤT CẢ hạng giải mà triplet khớp trong kết quả quay.
 *
 * Khác `findTierInResult`: không dừng ở hạng đầu tiên mà duyệt hết 4 hạng.
 * Dùng cho Basic mode — theo luật Vietlott Max 3D, nếu bộ ba số trùng nhiều
 * hạng giải (VD: "096" xuất hiện cả trong pool ĐB lẫn Nhất), người chơi được
 * lĩnh tổng tất cả các giải đó.
 *
 * Trong thực tế, 20 bộ ba được quay độc lập nên có thể xuất hiện trùng nhau
 * giữa các hạng (VD: "096" vừa là ĐB vừa là Nhất).
 *
 * @example
 *   // Special = ["096", "389"], First = ["096", "683"] — "096" xuất hiện ở 2 hạng
 *   findAllTiersInResult("096", byTier) → ["special", "first"]
 *   findAllTiersInResult("683", byTier) → ["first"]
 *   findAllTiersInResult("999", byTier) → []
 */
export function findAllTiersInResult(
  triplet: Triplet,
  byTier: Map<BasicPrizeTier, Triplet[]>,
): BasicPrizeTier[] {
  const matched: BasicPrizeTier[] = [];
  for (const tier of BASIC_TIER_PRIORITY) {
    if (byTier.get(tier)!.includes(triplet)) {
      matched.push(tier);
    }
  }
  return matched;
}

/**
 * Bipartite matching: đếm số triplet player khớp với entries RIÊNG BIỆT trong pool.
 *
 * Mỗi draw entry chỉ được dùng 1 lần (remove sau khi match).
 * Giải quyết đúng case duplicate: player ["096","096"] vs pool ["096","389"]
 * → chỉ match 1 (không phải 2).
 *
 * @example
 *   // Player ["096","389"] vs pool ["096","389"] → 2 (cả 2 khớp entry riêng biệt)
 *   // Player ["096","096"] vs pool ["096","389"] → 1 (chỉ 1 entry "096" trong pool)
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
  const unique = new Set(triplet.split("")).size;

  if (unique === 3) {
    return 6;
  }

  if (unique === 2) {
    return 3;
  }

  return 1;
}

// ─────────────────────────────────────────────
// Max 3D Cơ Bản – Matching (1 bộ ba số)
// ─────────────────────────────────────────────

/**
 * Kết quả match Basic (Straight hoặc 1 hoán vị của Combo).
 *
 * `tiers`: tất cả hạng giải mà triplet khớp (có thể nhiều hơn 1 nếu triplet
 *   xuất hiện đồng thời ở nhiều hạng trong kết quả quay).
 * `winAmount`: tổng tiền = Σ(prizes[tier] for tier in tiers).
 */
export interface BasicMatchResult {
  /** Tất cả hạng giải trúng. Có thể trúng nhiều hạng cùng lúc nếu triplet xuất hiện ở nhiều pool. */
  tiers: BasicPrizeTier[];
  /** Tổng tiền thắng = Σ(prizes[tier] for tier in tiers). */
  winAmount: number;
}

/**
 * So khớp 1 bộ ba số (straight) với kết quả quay.
 *
 * Theo luật Vietlott Max 3D: nếu bộ ba số xuất hiện ở nhiều hạng giải
 * (VD: "096" vừa là ĐB vừa là Nhất), người chơi được lĩnh tổng tất cả.
 * KHÔNG chỉ lĩnh hạng cao nhất.
 */
export function matchBasicStraight(
  playerTriplet: Triplet,
  byTier: Map<BasicPrizeTier, Triplet[]>,
  prizes: BasicPrizeAmounts,
): BasicMatchResult {
  const tiers = findAllTiersInResult(playerTriplet, byTier);
  return { tiers, winAmount: sumBy(tiers, (t) => prizes[t]) };
}

/**
 * So khớp 1 bộ ba số (combo) với kết quả quay.
 *
 * Expand tất cả hoán vị → so khớp từng hoán vị straight.
 * Mỗi hoán vị trúng nhiều hạng → cộng tổng tất cả giải combo tương ứng.
 * Tổng thưởng = Σ(combo_prize[tier] cho mỗi hoán vị × mỗi tier trúng).
 */
export function matchBasicCombo(
  playerTriplet: Triplet,
  playType: typeof PlayType.Combo3 | typeof PlayType.Combo6,
  byTier: Map<BasicPrizeTier, Triplet[]>,
  comboPrizes: ComboPrizeAmounts,
): BasicMatchResult {
  const prizeSet = playType === PlayType.Combo3 ? comboPrizes.combo3 : comboPrizes.combo6;

  // Expand tất cả hoán vị → thu thập tất cả (perm, tier) trúng.
  // Một hoán vị có thể trùng nhiều hạng → không bỏ hạng nào.
  const tiers = getUniquePermutations(playerTriplet).flatMap((perm) =>
    findAllTiersInResult(perm, byTier),
  );

  return { tiers, winAmount: sumBy(tiers, (t) => prizeSet[t]) };
}

// ─────────────────────────────────────────────
// Max 3D+ – Matching (2 bộ ba số)
// ─────────────────────────────────────────────

/**
 * Kết quả 1 giải Plus đã trúng (dùng trong mảng wonTiers).
 */
export interface PlusWonTier {
  /** Hạng giải Plus (special → sixth). */
  tier: PlusPrizeTier;
  /** Giá trị giải thưởng (đã áp dụng multiplier ×2 nếu duplicate). */
  winAmount: number;
}

/**
 * Kết quả matching Max 3D+ — có thể trúng NHIỀU giải đồng thời (gộp giải).
 *
 * Theo luật Vietlott: "Trường hợp hai bộ số của người chơi trùng nhiều hạng
 * giải thưởng, người chơi được lãnh TẤT CẢ các giải thưởng đó."
 *
 * VD: Player "096"+"683", Special=["096","389"], First=["683",...]
 *   → wonTiers = [Tư(1M), Năm(150k), Sáu(40k)] → winAmount = 1,190,000
 */
export interface PlusMatchResult {
  /** Tất cả giải đã trúng (có thể trúng nhiều giải đồng thời). */
  wonTiers: PlusWonTier[];
  /** Tổng tiền thắng = Σ(wonTiers[].winAmount). Đã áp dụng multiplier ×2 nếu duplicate. */
  winAmount: number;
}

/**
 * So khớp 2 bộ ba số (Max 3D+) với kết quả quay — GỘP TẤT CẢ giải đạt điều kiện.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * LUẬT VIETLOTT MAX 3D+:
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 7 hạng giải, KHÔNG loại trừ lẫn nhau — người chơi lĩnh TẤT CẢ giải đạt điều kiện:
 *
 * ┌─────────────────────────────────────────────────────────────────────────────────┐
 * │ NHÓM CẶP (cần cả 2 bộ khớp 2 entry RIÊNG BIỆT trong kết quả)                │
 * │                                                                                 │
 * │  Giải ĐB:   2 bộ khớp 2 entry ĐB riêng biệt          →  1,000,000,000 VND    │
 * │  Giải Nhất:  2 bộ khớp 2 entry Nhất riêng biệt        →     40,000,000 VND    │
 * │  Giải Nhì:   2 bộ khớp 2 entry Nhì riêng biệt         →     10,000,000 VND    │
 * │  Giải Ba:    2 bộ khớp 2 entry Ba riêng biệt           →      5,000,000 VND    │
 * │  Giải Tư:    2 bộ khớp 2 entry BẤT KỲ riêng biệt      →      1,000,000 VND    │
 * │             (cross-tier hoặc cùng tier đều tính)                                │
 * ├─────────────────────────────────────────────────────────────────────────────────┤
 * │ NHÓM ĐƠN (kiểm tra từng bộ ba riêng lẻ)                                       │
 * │                                                                                 │
 * │  Giải Năm:   1 bộ khớp entry ĐB bất kỳ                →        150,000 VND    │
 * │  Giải Sáu:   1 bộ khớp entry Nhất/Nhì/Ba bất kỳ       →         40,000 VND    │
 * └─────────────────────────────────────────────────────────────────────────────────┘
 *
 * DUPLICATE (2 bộ ba giống nhau):
 *   Quy tắc: "Giá trị giải thưởng sẽ cao gấp hai lần giá trị nêu ở bảng trên"
 *   — chỉ áp dụng cho giải Nhất đến giải Sáu. Giải ĐB KHÔNG nhân ×2.
 *   Matching dùng 1 unique triplet, giải đơn tính 1 lần.
 *
 *   VD: Player "096"+"096", Special=["096","389"]
 *     → Chỉ khớp 1 entry ĐB (bipartite: pool ["096","389"] → match 1, còn ["389"])
 *     → Giải Năm: 150,000 × 2 = 300,000
 *     → KHÔNG trúng Giải ĐB (cần khớp 2 entry riêng biệt)
 *
 *   VD: Player "096"+"096", Special=["096","096"]
 *     → Bipartite: match "096" (entry 1), match "096" (entry 2) → 2 khớp
 *     → Giải ĐB: 1,000,000,000 (KHÔNG ×2)
 *     → Giải Tư:     1,000,000 × 2 =     2,000,000
 *     → Giải Năm:      150,000 × 2 =       300,000
 *     → TỔNG:                         1,002,300,000
 *
 * @example Non-duplicate "096"+"683", Special=["096","389"], First=["683","525","569","598"]
 *   → Giải Tư: 1,000,000 (cả 2 khớp 2 entry bất kỳ trong 20)
 *   → Giải Năm: 150,000 (096 khớp ĐB)
 *   → Giải Sáu: 40,000 (683 khớp Nhất)
 *   → TỔNG: 1,190,000
 */
export function matchPlus(
  triplet1: Triplet,
  triplet2: Triplet,
  drawResultByTier: Map<BasicPrizeTier, Triplet[]>,
  allTriplets: Triplet[],
  prizes: PlusPrizeAmounts,
): PlusMatchResult {
  // Kiểm tra 2 triplet có giống nhau không
  const isDuplicate = triplet1 === triplet2;

  // Nhân ×2 cho duplicate
  const multiplier = isDuplicate ? 2 : 1;

  // 2 triplet player
  const playerTriplets: [Triplet, Triplet] = [triplet1, triplet2];

  // ── NHÓM CẶP: Giải ĐB → Tư (bipartite matching — mỗi entry chỉ dùng 1 lần) ──
  const wonTiers: PlusWonTier[] = [];

  // Giải ĐB: cả 2 khớp 2 entry ĐB riêng biệt
  // Duplicate KHÔNG áp dụng ×2 cho giải ĐB — chỉ áp dụng từ giải Nhất trở xuống.
  const specialMatches = countDistinctMatches(
    playerTriplets,
    drawResultByTier.get(BasicPrizeTier.Special)!,
  );

  if (specialMatches >= 2) {
    wonTiers.push({ tier: PlusPrizeTier.Special, winAmount: prizes.special });
  }

  // Giải Nhất: cả 2 khớp 2 entry Nhất riêng biệt
  const firstMatches = countDistinctMatches(
    playerTriplets,
    drawResultByTier.get(BasicPrizeTier.First)!,
  );

  if (firstMatches >= 2) {
    wonTiers.push({ tier: PlusPrizeTier.First, winAmount: prizes.first * multiplier });
  }

  // Giải Nhì: cả 2 khớp 2 entry Nhì riêng biệt
  const secondMatches = countDistinctMatches(
    playerTriplets,
    drawResultByTier.get(BasicPrizeTier.Second)!,
  );

  if (secondMatches >= 2) {
    wonTiers.push({ tier: PlusPrizeTier.Second, winAmount: prizes.second * multiplier });
  }

  // Giải Ba: cả 2 khớp 2 entry Ba riêng biệt
  const thirdMatches = countDistinctMatches(
    playerTriplets,
    drawResultByTier.get(BasicPrizeTier.Third)!,
  );

  if (thirdMatches >= 2) {
    wonTiers.push({ tier: PlusPrizeTier.Third, winAmount: prizes.third * multiplier });
  }

  // Giải Tư: cả 2 khớp 2 entry BẤT KỲ riêng biệt trong toàn bộ 20 kết quả
  // (bao gồm cả cross-tier: 1 bộ ĐB + 1 bộ Nhất, hoặc cùng tier ĐB+ĐB, ...)
  const allMatches = countDistinctMatches(playerTriplets, allTriplets);
  if (allMatches >= 2) {
    wonTiers.push({ tier: PlusPrizeTier.Fourth, winAmount: prizes.fourth * multiplier });
  }

  // ── NHÓM ĐƠN: Giải Năm, Sáu (kiểm tra từng triplet riêng lẻ) ────
  // Với duplicate: chỉ có 1 unique triplet → kiểm tra 1 lần, ×2 đã tính vào multiplier.
  // Với non-duplicate: kiểm tra 2 triplet độc lập, mỗi triplet có thể trúng Năm hoặc Sáu.
  const tripletsToCheck = isDuplicate ? [triplet1] : [triplet1, triplet2];

  for (const t of tripletsToCheck) {
    const tier = findTierInResult(t, drawResultByTier);
    if (!tier) {
      continue;
    }

    if (tier === BasicPrizeTier.Special) {
      // Giải Năm: triplet khớp entry ĐB
      wonTiers.push({ tier: PlusPrizeTier.Fifth, winAmount: prizes.fifth * multiplier });
    } else {
      // Giải Sáu: triplet khớp entry Nhất/Nhì/Ba
      wonTiers.push({ tier: PlusPrizeTier.Sixth, winAmount: prizes.sixth * multiplier });
    }
  }

  // ── Tổng thưởng = Σ tất cả giải đạt điều kiện ────────────────────
  const winAmount = sumBy(wonTiers, (wt) => wt.winAmount);

  return { wonTiers, winAmount };
}

// ─────────────────────────────────────────────
// Combined Match for a Board
// ─────────────────────────────────────────────

/**
 * Kết quả match của 1 line (1 bộ ba hoặc 1 cặp bộ ba trong Plus mode).
 *
 * Basic Straight: 1 BoardLineResult per tier trúng (có thể nhiều hơn 1 nếu triplet xuất hiện ở nhiều pool).
 * Basic Combo: 1 BoardLineResult per hoán vị.
 * Plus: 1 BoardLineResult per giải đạt điều kiện (wonTiers).
 */
export interface BoardLineResult {
  lineIndex: number;
  triplets: Triplet[];
  /** Hạng giải trúng. null nếu không trúng. */
  tier: BasicPrizeTier | PlusPrizeTier | null;
  winAmount: number;
}

export interface BoardMatchResult {
  boardNo: string;
  playMode: PlayMode;
  playType: PlayType;
  winAmount: number;
  lineResults: BoardLineResult[];
}

/**
 * So khớp toàn bộ 1 board với kết quả quay.
 *
 * Plus mode: gộp tất cả giải đạt điều kiện, mỗi giải tạo 1 lineResult riêng
 * để settle-entries có thể buildPayoutTiers chính xác.
 *
 * `flattenedResult` nên được tính 1 lần bên ngoài vòng lặp entries bằng
 * `flattenDrawResult(drawResult)`, tránh tính lại cho mỗi board.
 */
export function matchBoard(
  board: {
    boardNo: string;
    playMode: PlayMode;
    playType: PlayType;
    triplets: Triplet[];
  },
  flattenedResult: FlattenedDrawResult,
  prizeConfig: Max3dPrizeConfig,
): BoardMatchResult {
  const { byTier: drawResultByTier, allTriplets } = flattenedResult;
  const lineResults: BoardLineResult[] = [];

  // 1) Chơi theo Plus mode: Max3D + Max3D
  if (board.playMode === PlayMode.Plus) {
    const [t1, t2] = board.triplets as [Triplet, Triplet];

    const plusResult = matchPlus(t1, t2, drawResultByTier, allTriplets, prizeConfig.plus);

    // Mỗi giải trúng tạo 1 lineResult riêng → buildPayoutTiers đếm đúng hitCount per tier.
    // Nếu không trúng giải nào, vẫn push 1 lineResult tier=null để có record trong line docs
    if (plusResult.wonTiers.length === 0) {
      lineResults.push({ lineIndex: 0, triplets: [t1, t2], tier: null, winAmount: 0 });
    } else {
      plusResult.wonTiers.forEach((wt, i) =>
        lineResults.push({
          lineIndex: i,
          triplets: [t1, t2],
          tier: wt.tier,
          winAmount: wt.winAmount,
        }),
      );
    }

    return {
      boardNo: board.boardNo,
      playMode: board.playMode,
      playType: board.playType,
      winAmount: plusResult.winAmount,
      lineResults,
    };
  }

  // 2) Chơi theo Basic mode: Max3D
  const triplet = board.triplets[0]!;

  if (board.playType === PlayType.Straight) {
    const tiers = findAllTiersInResult(triplet, drawResultByTier);

    // Theo luật Vietlott: trúng nhiều hạng → lĩnh tổng tất cả.
    // Mỗi hạng trúng tạo 1 lineResult riêng để buildPayoutTiers đếm hitCount per tier chính xác.
    if (tiers.length === 0) {
      // Nếu không trúng giải nào, vẫn push 1 lineResult với tier=null để có record trong line docs
      lineResults.push({ lineIndex: 0, triplets: [triplet], tier: null, winAmount: 0 });
    } else {
      tiers.forEach((t, i) =>
        lineResults.push({
          lineIndex: i,
          triplets: [triplet],
          tier: t,
          winAmount: prizeConfig.basic[t],
        }),
      );
    }

    return {
      boardNo: board.boardNo,
      playMode: board.playMode,
      playType: board.playType,
      winAmount: sumBy(lineResults, (l) => l.winAmount),
      lineResults,
    };
  }

  // Combo play type
  if (board.playType === PlayType.Combo3 || board.playType === PlayType.Combo6) {
    // Combo play type: 3 hoặc 6 hoán vị
    const permPrizeSet: BasicPrizeAmounts =
      board.playType === PlayType.Combo3 ? prizeConfig.combo.combo3 : prizeConfig.combo.combo6;

    // Mỗi hoán vị có thể trúng nhiều hạng → tách thành lineResult riêng per tier
    // để buildPayoutTiers đếm hitCount chính xác per tier.
    let lineIdx = 0;
    for (const perm of getUniquePermutations(triplet)) {
      // Tìm tất cả hạng giải mà hoán vị này khớp (có thể trúng nhiều hạng)
      const tiers = findAllTiersInResult(perm, drawResultByTier);

      if (tiers.length === 0) {
        // Nếu không trúng giải nào, vẫn push 1 lineResult với tier=null để có record trong line docs
        lineResults.push({ lineIndex: lineIdx++, triplets: [perm], tier: null, winAmount: 0 });
      } else {
        for (const t of tiers) {
          lineResults.push({
            lineIndex: lineIdx++,
            triplets: [perm],
            tier: t,
            winAmount: permPrizeSet[t],
          });
        }
      }
    }

    return {
      boardNo: board.boardNo,
      playMode: board.playMode,
      playType: board.playType,
      winAmount: sumBy(lineResults, (l) => l.winAmount),
      lineResults,
    };
  }

  return {
    boardNo: board.boardNo,
    playMode: board.playMode,
    playType: board.playType,
    winAmount: 0,
    lineResults,
  };
}

// ─────────────────────────────────────────────
// Payout Tier Aggregation
// ─────────────────────────────────────────────

/**
 * Tổng hợp `EntryPayoutTier[]` từ tất cả boards của 1 entry.
 *
 * Gom tất cả lineResults có tier != null và winAmount > 0,
 * group theo tier, đếm hitCount và sum totalAmount.
 * `unitAmount` = totalAmount / hitCount (làm tròn) — phản ánh giá trị 1 lần trúng.
 */
export function buildPayoutTiers(boardResults: BoardMatchResult[]): EntryPayoutTier[] {
  const tierMap = new Map<string, { hitCount: number; totalAmount: number }>();

  for (const br of boardResults) {
    for (const line of br.lineResults) {
      if (!line.tier || line.winAmount <= 0) continue;
      const acc = tierMap.get(line.tier);
      if (acc) {
        acc.hitCount++;
        acc.totalAmount += line.winAmount;
      } else {
        tierMap.set(line.tier, { hitCount: 1, totalAmount: line.winAmount });
      }
    }
  }

  return Array.from(tierMap, ([tier, { hitCount, totalAmount }]) => ({
    tier: tier as BasicPrizeTier | PlusPrizeTier,
    hitCount,
    unitAmount: Math.round(totalAmount / hitCount),
    amount: totalAmount,
  }));
}

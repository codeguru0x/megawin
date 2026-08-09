/**
 * Keno – Odds & Profit Calculator
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * I. MÔ TẢ TRÒ CHƠI
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Keno quay 20 số từ tập {1, 2, ..., 80}. Người chơi chọn 1-10 số.
 *   Ngoài ra có cách chơi bổ sung: Lớn/Nhỏ, Chẵn/Lẻ.
 *
 *   Giá vé: 10,000 VND / ticket.
 *   Lịch quay: mỗi 8 phút, ~120 kỳ/ngày (06:00 - 21:52).
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * II. KHÔNG GIAN MẪU (Sample Space)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Tổng cách quay 20 số từ 80 số:
 *     C(80,20) = 3,535,316,142,212,174,320 (≈ 3.535 × 10¹⁸)
 *
 *   Vượt quá Number.MAX_SAFE_INTEGER → dùng BigInt cho tính toán.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * III. CÔNG THỨC XÁC SUẤT – CÁCH CHƠI CƠ BẢN (Chọn 1-10 số)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Phân phối siêu hình học (Hypergeometric distribution):
 *
 *     P(trùng m số | chọn k số) = C(k, m) × C(80-k, 20-m) / C(80, 20)
 *
 *   Trong đó:
 *     k = số lượng số người chơi chọn (1-10)
 *     m = số lượng số trùng (0 ≤ m ≤ min(k, 20))
 *     C(k, m)       = số cách chọn m số trùng từ k số đã chọn
 *     C(80-k, 20-m) = số cách quay 20-m số KHÔNG trùng từ 80-k số còn lại
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ BẢNG XÁC SUẤT – CHỌN 1 SỐ (Pick 1)                                  │
 * ├──────────┬─────────────────────────────────┬──────────────────────────┤
 * │ Trùng    │ Cách tính                       │ Xác suất                 │
 * ├──────────┼─────────────────────────────────┼──────────────────────────┤
 * │ 1/1      │ C(1,1)×C(79,19) / C(80,20)     │ 20/80 = 1/4 = 25.00%    │
 * └──────────┴─────────────────────────────────┴──────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ BẢNG XÁC SUẤT – CHỌN 5 SỐ (Pick 5)                                  │
 * ├──────────┬─────────────────────────────────┬──────────────────────────┤
 * │ Trùng    │ Cách tính                       │ Xác suất ≈              │
 * ├──────────┼─────────────────────────────────┼──────────────────────────┤
 * │ 5/5      │ C(5,5)×C(75,15) / C(80,20)     │ 1/1,550,57 ≈ 6.4×10⁻⁷  │
 * │ 4/5      │ C(5,4)×C(75,16) / C(80,20)     │ 1/4,287 ≈ 2.33×10⁻⁴    │
 * │ 3/5      │ C(5,3)×C(75,17) / C(80,20)     │ 1/103.4 ≈ 9.67×10⁻³    │
 * │ 2/5      │ C(5,2)×C(75,18) / C(80,20)     │ ≈ 12.25%                │
 * └──────────┴─────────────────────────────────┴──────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ BẢNG XÁC SUẤT – CHỌN 10 SỐ (Pick 10)                                │
 * ├──────────┬─────────────────────────────────┬──────────────────────────┤
 * │ Trùng    │ Cách tính                       │ Xác suất ≈              │
 * ├──────────┼─────────────────────────────────┼──────────────────────────┤
 * │ 10/10    │ C(10,10)×C(70,10) / C(80,20)   │ 1/8,911,711 ≈ 1.1×10⁻⁷ │
 * │ 9/10     │ C(10,9)×C(70,11) / C(80,20)    │ 1/163,381               │
 * │ 8/10     │ C(10,8)×C(70,12) / C(80,20)    │ 1/7,384                 │
 * │ 7/10     │ C(10,7)×C(70,13) / C(80,20)    │ 1/621                   │
 * │ 6/10     │ C(10,6)×C(70,14) / C(80,20)    │ 1/87                    │
 * │ 5/10     │ C(10,5)×C(70,15) / C(80,20)    │ ≈ 5.14%                 │
 * │ 0/10     │ C(10,0)×C(70,20) / C(80,20)    │ ≈ 4.58%                 │
 * └──────────┴─────────────────────────────────┴──────────────────────────┘
 *
 *   Lưu ý: Pick 8/9/10 có giải đặc biệt khi trùng 0 số (0/8, 0/9, 0/10).
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * IV. CÔNG THỨC XÁC SUẤT – CƯỢC LỚN/NHỎ (Side Bet)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Pool chia đôi: 40 số nhỏ (1-40) + 40 số lớn (41-80).
 *   Quay 20 số → đếm bao nhiêu "lớn" (bigCount).
 *
 *   Phân phối hypergeometric:
 *     P(bigCount = x) = C(40, x) × C(40, 20-x) / C(80, 20)
 *
 * ┌────────────┬────────────────────────────────┬─────────────┬──────────────┐
 * │ Kết quả    │ Điều kiện                      │ Xác suất ≈  │ Giải thưởng  │
 * ├────────────┼────────────────────────────────┼─────────────┼──────────────┤
 * │ Lớn thắng  │ bigCount ≥ 13                  │ ~24.44%     │ 26,000 VND   │
 * │ Lớn 11-12  │ bigCount = 11 hoặc 12          │ ~36.68%     │ 10,000 VND   │
 * │ Hoà 10-10  │ bigCount = 10                  │ ~14.51%     │ 26,000 VND   │
 * │ Nhỏ 11-12  │ smallCount = 11 hoặc 12        │ ~36.68%     │ 10,000 VND   │
 * │ Nhỏ thắng  │ smallCount ≥ 13                │ ~24.44%     │ 26,000 VND   │
 * └────────────┴────────────────────────────────┴─────────────┴──────────────┘
 *
 *   Tổng: 24.44% + 36.68% + 14.51% ≈ 75.63% (Lớn side)
 *   Đối xứng cho Nhỏ side.
 *   Không trúng (cược Lớn nhưng kết quả Nhỏ): ~24.44%
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * V. CÔNG THỨC XÁC SUẤT – CƯỢC CHẴN/LẺ (Side Bet)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Pool chia đôi: 40 số chẵn + 40 số lẻ (trong tập 1-80).
 *   Phân phối hypergeometric tương tự Lớn/Nhỏ.
 *
 * ┌─────────────┬───────────────────────────────┬─────────────┬──────────────┐
 * │ Kết quả     │ Điều kiện                     │ Xác suất ≈  │ Giải thưởng  │
 * ├─────────────┼───────────────────────────────┼─────────────┼──────────────┤
 * │ Chẵn ≥15    │ evenCount ≥ 15                │ ~0.73%      │ 200,000 VND  │
 * │ Chẵn 13-14  │ evenCount = 13 hoặc 14        │ ~7.57%      │ 40,000 VND   │
 * │ Chẵn 11-12  │ evenCount = 11 hoặc 12        │ ~36.68%     │ 20,000 VND   │
 * │ Hoà 10-10   │ evenCount = 10                │ ~14.51%     │ 20,000 VND   │
 * │ Lẻ 11-12    │ oddCount = 11 hoặc 12         │ ~36.68%     │ 20,000 VND   │
 * │ Lẻ 13-14    │ oddCount = 13 hoặc 14         │ ~7.57%      │ 40,000 VND   │
 * │ Lẻ ≥15      │ oddCount ≥ 15                 │ ~0.73%      │ 200,000 VND  │
 * └─────────────┴───────────────────────────────┴─────────────┴──────────────┘
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * VI. PHÂN TÍCH LỢI NHUẬN
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Công thức cho mỗi mức thưởng:
 *     Expected Payout / ticket = P(match) × Prize(match)
 *     Payout Ratio             = Expected Payout / Unit Price
 *     Break-even Prize         = Unit Price / P(match)
 *
 *   Tổng hợp cho 1 bậc chơi:
 *     Total Expected Payout = Σ [P(m) × Prize(m)] cho tất cả m có giải
 *     Gross Margin / ticket = Unit Price - Total Expected Payout
 *     Gross Margin %        = Gross Margin / Unit Price × 100
 *
 *   Ví dụ Pick 10 (unit price = 10,000 VND, giải thưởng mặc định):
 *
 * ┌───────┬──────────────────┬───────────────┬─────────────────┬──────────────┐
 * │ Trùng │ Xác suất ≈       │ Giải thưởng   │ Expected Payout │ Payout Ratio │
 * ├───────┼──────────────────┼───────────────┼─────────────────┼──────────────┤
 * │ 10/10 │ 1/8,911,711      │ 2,000,000,000 │ 224.42 VND      │ 2.24%        │
 * │ 9/10  │ 1/163,381        │ 150,000,000   │ 918.14 VND      │ 9.18%        │
 * │ 8/10  │ 1/7,384          │ 8,000,000     │ 1,083.01 VND    │ 10.83%       │
 * │ 7/10  │ 1/621            │ 710,000       │ 1,143.32 VND    │ 11.43%       │
 * │ 6/10  │ 1/87             │ 80,000        │ 919.54 VND      │ 9.20%        │
 * │ 5/10  │ ~5.14%           │ 20,000        │ 1,028.56 VND    │ 10.29%       │
 * │ 0/10  │ ~4.58%           │ 10,000        │ 458.28 VND      │ 4.58%        │
 * └───────┴──────────────────┴───────────────┴─────────────────┴──────────────┘
 *
 *   Phân bổ doanh thu mỗi ticket (mặc định):
 *     100% Revenue = 10,000 VND
 *     ├── 20% Hoa hồng đại lý    = 2,000 VND
 *     ├── 15% Công ty thu về      = 1,500 VND
 *     └── ~65% Giải thưởng        ≈ 6,500 VND
 *
 *   Keno KHÔNG có jackpot tích luỹ — tất cả giải thưởng là giải cố định.
 */

import {
  KENO_BIG_SMALL_BOUNDARY,
  KENO_DRAW_COUNT,
  KENO_NUMBER_MAX,
  KENO_PICK_MAX,
  KENO_PICK_MIN,
} from "../entities/types";
import { getPlayTypeFromPickCount } from "./play-types";

const POOL = KENO_NUMBER_MAX; // 80
const DRAW = KENO_DRAW_COUNT; // 20

// ─────────────────────────────────────────────
// Combination helper (big numbers)
// ─────────────────────────────────────────────

/**
 * Tính C(n, k) bằng BigInt để tránh mất precision với số lớn.
 * C(80,20) = 3,535,316,142,212,174,320 ≈ 3.535 × 10^18 – vượt quá Number.MAX_SAFE_INTEGER.
 */
function combinationBig(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  if (k === 0 || k === n) return 1n;
  const kk = Math.min(k, n - k);
  let result = 1n;
  for (let i = 0; i < kk; i++) {
    result = (result * BigInt(n - i)) / BigInt(i + 1);
  }
  return result;
}

// ─────────────────────────────────────────────
// Total Outcomes
// ─────────────────────────────────────────────

/**
 * Tổng không gian mẫu = C(80, 20).
 * = 3,535,316,142,212,174,320 (≈ 3.535 × 10¹⁸)
 */
export const TOTAL_OUTCOMES = combinationBig(POOL, DRAW);

// ─────────────────────────────────────────────
// Basic Play Odds (pick1 – pick10)
// ─────────────────────────────────────────────

/** Thông tin xác suất và kỳ vọng cho 1 mức thưởng trong 1 bậc chơi cơ bản. */
export interface KenoTierOdds {
  /** Số lượng số chọn (1-10). */
  pickCount: number;
  /** Số lượng số trùng để được giải thưởng này. */
  matchCount: number;
  /** Số cách trúng (favorable outcomes). BigInt vì C(80,20) vượt MAX_SAFE_INTEGER. */
  waysBig: bigint;
  /** Xác suất P = ways / TOTAL_OUTCOMES. Float [0, 1]. */
  probability: number;
  /** 1 in N (nghịch đảo xác suất). Dùng để hiển thị "1 trong N lần". */
  oneInN: number;
}

/**
 * Tính số cách trúng đúng m số khi chọn k số từ pool 80, quay 20 số.
 * = C(k, m) × C(80-k, 20-m)
 */
function matchWays(k: number, m: number): bigint {
  return combinationBig(k, m) * combinationBig(POOL - k, DRAW - m);
}

/**
 * Tính xác suất cho tất cả mức thưởng có giải của 1 bậc chơi.
 *
 * Kết quả dùng để:
 * - Hiển thị bảng odds trên backoffice UI (staff xem RTP từng bậc)
 * - Tính gross margin khi staff muốn điều chỉnh bảng giải thưởng
 * - Tài liệu hóa cơ cấu giải thưởng
 *
 * @param pickCount - Số lượng số chọn (1-10)
 * @param matchCounts - Các mức matchCount có giải (ví dụ [10, 9, 8, 7, 6, 5, 0] cho pick10)
 */
export function getOddsForPick(pickCount: number, matchCounts: number[]): KenoTierOdds[] {
  return matchCounts.map((matchCount) => {
    const waysBig = matchWays(pickCount, matchCount);
    const probability = Number((waysBig * 1_000_000_000_000n) / TOTAL_OUTCOMES) / 1_000_000_000_000;
    const oneInN = probability > 0 ? 1 / probability : Infinity;
    return { pickCount, matchCount, waysBig, probability, oneInN };
  });
}

/**
 * Bảng match counts có giải cho mỗi bậc.
 * Chỉ bao gồm matchCount có giải (từ `DEFAULT_KENO_CONFIG.basicPrizes`, xem `./financials`).
 */
const PICK_MATCH_COUNTS: Record<number, number[]> = {
  1: [1],
  2: [2],
  3: [3, 2],
  4: [4, 3, 2],
  5: [5, 4, 3, 2],
  6: [6, 5, 4, 3],
  7: [7, 6, 5, 4, 3],
  8: [8, 7, 6, 5, 4, 3, 0],
  9: [9, 8, 7, 6, 5, 4, 0],
  10: [10, 9, 8, 7, 6, 5, 0],
};

/**
 * Bảng xác suất đầy đủ cho tất cả 10 bậc chơi cơ bản.
 *
 * Mỗi lần gọi tính lại — kết quả là pure function, không cache.
 * Dùng cho staff UI (backoffice game config) để xem RTP từng bậc
 * khi thay đổi bảng giải thưởng.
 *
 * @returns Map<pickCount (1-10), KenoTierOdds[]>
 */
export function getBasicOddsTable(): Map<number, KenoTierOdds[]> {
  const table = new Map<number, KenoTierOdds[]>();
  for (let pick = KENO_PICK_MIN; pick <= KENO_PICK_MAX; pick++) {
    const matchCounts = PICK_MATCH_COUNTS[pick] ?? [];
    table.set(pick, getOddsForPick(pick, matchCounts));
  }
  return table;
}

// ─────────────────────────────────────────────
// Side Bet Odds (Lớn/Nhỏ, Chẵn/Lẻ)
// ─────────────────────────────────────────────

/**
 * Xác suất có đúng x số "lớn" (41-80) trong 20 số quay.
 * Pool: 40 số lớn + 40 số nhỏ, quay 20 số.
 * P(bigCount = x) = C(40, x) × C(40, 20-x) / C(80, 20)
 *
 * Tương tự cho Chẵn/Lẻ vì pool cũng chia 40/40.
 */
/** Xác suất và kỳ vọng cho 1 outcome cụ thể của side bet. */
export interface SideBetOdds {
  /** Tên hiển thị outcome (ví dụ: "Lớn (≥13)", "Hoà (10-10)"). */
  label: string;
  /** Ngưỡng số để trúng outcome này (ví dụ: "≥13", "11-12", "10"). */
  count: number | string;
  /** Số cách trúng (BigInt). */
  waysBig: bigint;
  /** Xác suất xảy ra outcome [0, 1]. */
  probability: number;
  /** Nghịch đảo xác suất ("1 trong N lần"). */
  oneInN: number;
}

function sideBetWays(favorableCount: number): bigint {
  const half = KENO_BIG_SMALL_BOUNDARY; // 40
  return combinationBig(half, favorableCount) * combinationBig(half, DRAW - favorableCount);
}

/**
 * Xác suất cho cược Lớn/Nhỏ.
 *
 * bigCount ≥ 13 → Lớn thắng (prize big13Plus)
 * bigCount = 11 or 12 → Lớn hoàn vốn (prize big1112)
 * bigCount = 10 → Hoà (prize draw)
 * smallCount ≥ 13 → Nhỏ thắng
 * smallCount = 11 or 12 → Nhỏ hoàn vốn
 */
export function getBigSmallOdds(): {
  big13Plus: SideBetOdds;
  big1112: SideBetOdds;
  draw: SideBetOdds;
  small1112: SideBetOdds;
  small13Plus: SideBetOdds;
} {
  const ways13Plus = (() => {
    let total = 0n;
    for (let x = 13; x <= 20; x++) total += sideBetWays(x);
    return total;
  })();

  const ways1112 = sideBetWays(11) + sideBetWays(12);
  const waysDraw = sideBetWays(10);

  const toOdds = (label: string, count: string, w: bigint): SideBetOdds => {
    const prob = Number((w * 1_000_000_000_000n) / TOTAL_OUTCOMES) / 1_000_000_000_000;
    return {
      label,
      count,
      waysBig: w,
      probability: prob,
      oneInN: prob > 0 ? 1 / prob : Infinity,
    };
  };

  return {
    big13Plus: toOdds("Lớn (≥13)", "≥13", ways13Plus),
    big1112: toOdds("Lớn (11-12)", "11-12", ways1112),
    draw: toOdds("Hoà (10-10)", "10", waysDraw),
    small1112: toOdds("Nhỏ (11-12)", "11-12", ways1112),
    small13Plus: toOdds("Nhỏ (≥13)", "≥13", ways13Plus),
  };
}

/**
 * Xác suất cho cược Chẵn/Lẻ.
 * Cùng phân phối hypergeometric với 40 chẵn / 40 lẻ.
 */
export function getEvenOddOdds(): {
  even15Plus: SideBetOdds;
  even1314: SideBetOdds;
  even1112: SideBetOdds;
  draw: SideBetOdds;
  odd1112: SideBetOdds;
  odd1314: SideBetOdds;
  odd15Plus: SideBetOdds;
} {
  const ways15Plus = (() => {
    let total = 0n;
    for (let x = 15; x <= 20; x++) total += sideBetWays(x);
    return total;
  })();

  const ways1314 = sideBetWays(13) + sideBetWays(14);
  const ways1112 = sideBetWays(11) + sideBetWays(12);
  const waysDraw = sideBetWays(10);

  const toOdds = (label: string, count: string, w: bigint): SideBetOdds => {
    const prob = Number((w * 1_000_000_000_000n) / TOTAL_OUTCOMES) / 1_000_000_000_000;
    return {
      label,
      count,
      waysBig: w,
      probability: prob,
      oneInN: prob > 0 ? 1 / prob : Infinity,
    };
  };

  return {
    even15Plus: toOdds("Chẵn (≥15)", "≥15", ways15Plus),
    even1314: toOdds("Chẵn (13-14)", "13-14", ways1314),
    even1112: toOdds("Chẵn (11-12)", "11-12", ways1112),
    draw: toOdds("Hoà (10-10)", "10", waysDraw),
    odd1112: toOdds("Lẻ (11-12)", "11-12", ways1112),
    odd1314: toOdds("Lẻ (13-14)", "13-14", ways1314),
    odd15Plus: toOdds("Lẻ (≥15)", "≥15", ways15Plus),
  };
}

// ─────────────────────────────────────────────
// Profit Analysis (Basic Play)
// ─────────────────────────────────────────────

/** Phân tích lợi nhuận kỳ vọng cho 1 mức thưởng cụ thể. */
export interface TierProfitAnalysis {
  /** Số lượng số chọn. */
  pickCount: number;
  /** Số lượng số trùng ứng với mức thưởng này. */
  matchCount: number;
  /** Xác suất xảy ra [0, 1]. */
  probability: number;
  /** Nghịch đảo xác suất. */
  oneInN: number;
  /** Giá trị giải thưởng hiện tại (VND). Đọc từ config. */
  currentPrize: number;
  /** Kỳ vọng trả thưởng mỗi ticket = probability × prize (VND). */
  expectedPayout: number;
  /** Tỷ lệ hoàn trả = expectedPayout / unitPrice. Nếu > 1.0 → công ty lỗ ở tier này. */
  payoutRatio: number;
  /** Giải thưởng tối đa để hoà vốn = unitPrice / probability (VND). */
  breakEvenPrize: number;
}

/** Tổng hợp phân tích lợi nhuận cho toàn bộ 1 bậc chơi (pick N). */
export interface PickProfitSummary {
  /** Số lượng số chọn. */
  pickCount: number;
  /** Mệnh giá ticket (VND). */
  unitPrice: number;
  /** Phân tích từng mức thưởng có giải. */
  tiers: TierProfitAnalysis[];
  /** Tổng kỳ vọng trả thưởng mỗi ticket = Σ(tier.expectedPayout) (VND). */
  totalExpectedPayout: number;
  /** Tổng tỷ lệ hoàn trả = totalExpectedPayout / unitPrice. RTP > 1.0 → công ty lỗ bậc này. */
  totalPayoutRatio: number;
  /** Biên lợi nhuận gộp mỗi ticket = unitPrice - totalExpectedPayout (VND). */
  grossMarginPerTicket: number;
  /** Biên lợi nhuận gộp (%). Dùng để so sánh tổng quan giữa các bậc chơi. */
  grossMarginPercent: number;
}

/**
 * Phân tích lợi nhuận cho 1 bậc chơi cơ bản.
 *
 * Dùng trên backoffice UI khi staff muốn xem RTP của 1 pick type cụ thể
 * trước khi quyết định thay đổi bảng giải thưởng.
 *
 * @param pickCount - Số lượng số chọn (1-10)
 * @param prizes - Map matchCount (string) → prize (VND) cho pick này
 * @param unitPrice - Mệnh giá ticket (VND). Keno mặc định 10.000
 */
export function analyzeProfitabilityForPick(
  pickCount: number,
  prizes: Record<string, number>,
  unitPrice: number,
): PickProfitSummary {
  const matchCounts = PICK_MATCH_COUNTS[pickCount] ?? [];
  const odds = getOddsForPick(pickCount, matchCounts);

  const tiers: TierProfitAnalysis[] = odds.map((o) => {
    const currentPrize = prizes[String(o.matchCount)] ?? 0;
    const expectedPayout = o.probability * currentPrize;
    const payoutRatio = unitPrice > 0 ? expectedPayout / unitPrice : 0;
    const breakEvenPrize = o.probability > 0 ? unitPrice / o.probability : Infinity;

    return {
      pickCount: o.pickCount,
      matchCount: o.matchCount,
      probability: o.probability,
      oneInN: o.oneInN,
      currentPrize,
      expectedPayout,
      payoutRatio,
      breakEvenPrize,
    };
  });

  const totalExpectedPayout = tiers.reduce((s, t) => s + t.expectedPayout, 0);
  const totalPayoutRatio = unitPrice > 0 ? totalExpectedPayout / unitPrice : 0;
  const grossMarginPerTicket = unitPrice - totalExpectedPayout;
  const grossMarginPercent = unitPrice > 0 ? (grossMarginPerTicket / unitPrice) * 100 : 0;

  return {
    pickCount,
    unitPrice,
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPerTicket,
    grossMarginPercent,
  };
}

/**
 * Phân tích lợi nhuận cho TẤT CẢ 10 bậc chơi cơ bản.
 *
 * Dùng trên backoffice UI trang "Prize Table" — hiển thị tổng quan RTP
 * toàn bộ game khi staff review hoặc chỉnh sửa bảng giải thưởng.
 *
 * @param basicPrizes - Toàn bộ bảng giải thưởng (từ `GlobalConfigDoc.basicPrizes`)
 * @param unitPrice - Mệnh giá ticket (VND)
 * @returns Mảng 10 phần tử, index 0 = pick1, index 9 = pick10
 */
export function analyzeAllPicksProfitability(
  basicPrizes: Record<string, Record<string, number>>,
  unitPrice: number,
): PickProfitSummary[] {
  const summaries: PickProfitSummary[] = [];
  for (let pick = KENO_PICK_MIN; pick <= KENO_PICK_MAX; pick++) {
    // pick ∈ [KENO_PICK_MIN, KENO_PICK_MAX] → luôn hợp lệ.
    const prizes = basicPrizes[getPlayTypeFromPickCount(pick)] ?? {};
    summaries.push(analyzeProfitabilityForPick(pick, prizes, unitPrice));
  }
  return summaries;
}

/** Phân tích lợi nhuận cho 1 outcome cụ thể của side bet (Lớn/Nhỏ hoặc Chẵn/Lẻ). */
export interface SideBetProfitAnalysis {
  /** Tên hiển thị outcome. */
  label: string;
  /** Xác suất xảy ra [0, 1]. */
  probability: number;
  /** Nghịch đảo xác suất. */
  oneInN: number;
  /** Giá trị giải thưởng hiện tại (VND). */
  currentPrize: number;
  /** Kỳ vọng trả thưởng mỗi ticket = probability × prize (VND). */
  expectedPayout: number;
  /** Tỷ lệ hoàn trả = expectedPayout / unitPrice. */
  payoutRatio: number;
  /** Giải thưởng tối đa để hoà vốn (VND). */
  breakEvenPrize: number;
}

/**
 * Phân tích lợi nhuận cho cược Lớn/Nhỏ.
 *
 * @param prizes - Bảng giải thưởng Lớn/Nhỏ (từ `GlobalConfigDoc.bigSmallPrizes`)
 * @param unitPrice - Mệnh giá ticket (VND)
 */
export function analyzeBigSmallProfitability(
  prizes: {
    big13Plus: number;
    big1112: number;
    draw: number;
    small1112: number;
    small13Plus: number;
  },
  unitPrice: number,
): {
  tiers: SideBetProfitAnalysis[];
  totalExpectedPayout: number;
  totalPayoutRatio: number;
  grossMarginPercent: number;
} {
  const odds = getBigSmallOdds();

  const analyze = (label: string, prob: number, prize: number): SideBetProfitAnalysis => ({
    label,
    probability: prob,
    oneInN: prob > 0 ? 1 / prob : Infinity,
    currentPrize: prize,
    expectedPayout: prob * prize,
    payoutRatio: unitPrice > 0 ? (prob * prize) / unitPrice : 0,
    breakEvenPrize: prob > 0 ? unitPrice / prob : Infinity,
  });

  const tiers = [
    analyze("Lớn (≥13)", odds.big13Plus.probability, prizes.big13Plus),
    analyze("Lớn (11-12)", odds.big1112.probability, prizes.big1112),
    analyze("Hoà LN", odds.draw.probability, prizes.draw),
    analyze("Nhỏ (11-12)", odds.small1112.probability, prizes.small1112),
    analyze("Nhỏ (≥13)", odds.small13Plus.probability, prizes.small13Plus),
  ];

  const totalExpectedPayout = tiers.reduce((s, t) => s + t.expectedPayout, 0);
  const totalPayoutRatio = unitPrice > 0 ? totalExpectedPayout / unitPrice : 0;
  return {
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPercent: (1 - totalPayoutRatio) * 100,
  };
}

/**
 * Phân tích lợi nhuận cho cược Chẵn/Lẻ.
 *
 * @param prizes - Bảng giải thưởng Chẵn/Lẻ (từ `GlobalConfigDoc.evenOddPrizes`)
 * @param unitPrice - Mệnh giá ticket (VND)
 */
export function analyzeEvenOddProfitability(
  prizes: {
    even15Plus: number;
    even1314: number;
    even1112: number;
    draw: number;
    odd1112: number;
    odd1314: number;
    odd15Plus: number;
  },
  unitPrice: number,
): {
  tiers: SideBetProfitAnalysis[];
  totalExpectedPayout: number;
  totalPayoutRatio: number;
  grossMarginPercent: number;
} {
  const odds = getEvenOddOdds();

  const analyze = (label: string, prob: number, prize: number): SideBetProfitAnalysis => ({
    label,
    probability: prob,
    oneInN: prob > 0 ? 1 / prob : Infinity,
    currentPrize: prize,
    expectedPayout: prob * prize,
    payoutRatio: unitPrice > 0 ? (prob * prize) / unitPrice : 0,
    breakEvenPrize: prob > 0 ? unitPrice / prob : Infinity,
  });

  const tiers = [
    analyze("Chẵn (≥15)", odds.even15Plus.probability, prizes.even15Plus),
    analyze("Chẵn (13-14)", odds.even1314.probability, prizes.even1314),
    analyze("Chẵn (11-12)", odds.even1112.probability, prizes.even1112),
    analyze("Hoà CL", odds.draw.probability, prizes.draw),
    analyze("Lẻ (11-12)", odds.odd1112.probability, prizes.odd1112),
    analyze("Lẻ (13-14)", odds.odd1314.probability, prizes.odd1314),
    analyze("Lẻ (≥15)", odds.odd15Plus.probability, prizes.odd15Plus),
  ];

  const totalExpectedPayout = tiers.reduce((s, t) => s + t.expectedPayout, 0);
  const totalPayoutRatio = unitPrice > 0 ? totalExpectedPayout / unitPrice : 0;
  return {
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPercent: (1 - totalPayoutRatio) * 100,
  };
}

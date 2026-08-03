/**
 * Bingo 18 – Exposure (liability CHÍNH XÁC per-outcome)
 *
 * Không gian mẫu Bingo 18 chỉ 6³ = 216 outcome → liability tính ĐÚNG cho từng kết quả
 * có thể xảy ra, KHÔNG cần proxy worst-case như Keno (analysis bingo18-ops §3.4).
 *
 * Nguyên tắc (bài học Keno Risk #4): stats doc lưu bucket RAW tuyến tính; hàm ở đây
 * THUẦN + idempotent, áp ở TẦNG ĐỌC (build snapshot response / eval alert) — gọi lại
 * bao nhiêu lần cũng cho cùng kết quả, không lưu output vào doc.
 *
 * Công thức payout 1 outcome (a,b,c):
 *   payout(a,b,c) = Σ_n singleNum[n].sets   × singleNumPrize(count_n)
 *                 + Σ_n doubleMatch[n].sets × (count_n ≥ 2 ? doubleMatchPrizes.win : 0)
 *                 + Σ_n tripleSpecific[n].sets × (a=b=c=n ? specific : 0)
 *                 +     tripleAny.sets      × (a=b=c ? any : 0)
 *                 +     sumTotal[a+b+c].sets × sumTotalPrize(a+b+c)
 *                 +     bigSmallDraw[dir(a+b+c)].sets × bigSmallPrize(dir)
 *
 * Logic match đối chiếu 1-1 với 5 hàm `helpers/match-result.ts` (settle pipeline) —
 * biên dir() dùng hằng domain BINGO18_SMALL_MAX/BINGO18_BIG_MIN, KHÔNG hardcode.
 */

import {
  BINGO18_DICE_MIN,
  BINGO18_DICE_MAX,
  BINGO18_SMALL_MAX,
  BINGO18_BIG_MIN,
} from "../entities/types";
import { Bingo18BigSmallBet, Bingo18PlayType, Bingo18TripleKind } from "../entities/enums";
import { lookupSingleNumPrize, lookupSumTotalPrize } from "./prize-tables";
import { TOTAL_OUTCOMES } from "./odds";
import type {
  SingleNumPrizes,
  DoubleMatchPrizes,
  TripleMatchPrizes,
  SumTotalPrizes,
  BigSmallDrawPrizes,
} from "../entities/types";
import type { Bingo18ByPlayType, Bingo18BucketStat } from "../entities/betting-stats";
import type { EntryBoardSnapshot } from "../entities/entry";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** Bảng giải gom lại từ GlobalConfig — input cho mọi hàm exposure (KHÔNG hardcode). */
export interface Bingo18PrizeSet {
  singleNum: SingleNumPrizes;
  doubleMatch: DoubleMatchPrizes;
  tripleMatch: TripleMatchPrizes;
  sumTotal: SumTotalPrizes;
  bigSmallDraw: BigSmallDrawPrizes;
}

/** 1 outcome (kết quả 3 xúc xắc) kèm tổng tiền phải trả nếu nó xảy ra. */
export interface Bingo18OutcomePayout {
  /** 3 mặt xúc xắc theo thứ tự sinh (1-6, có thể trùng). */
  numbers: [number, number, number];
  /** Tổng 3 mặt (3-18). */
  sum: number;
  /** Tổng tiền trả cho TOÀN BỘ cược trong kỳ nếu outcome này xảy ra (VND). */
  amount: number;
}

/**
 * Kết quả tính exposure 1 kỳ — CHÍNH XÁC (không proxy).
 *
 * Mọi outcome đồng xác suất 1/216 → `expectedPayout` là kỳ vọng chính xác tuyệt đối.
 */
export interface Bingo18ExposureResult {
  /** Outcome trả NẶNG nhất — "kỳ này tệ nhất mất bao nhiêu, khi quay ra gì". */
  worstCase: Bingo18OutcomePayout;
  /** Outcome trả NHẸ nhất — biên dưới. */
  bestCase: Bingo18OutcomePayout;
  /** Kỳ vọng trả thưởng (VND) = Σ payout(o) / 216 — so revenue ra margin dự kiến. */
  expectedPayout: number;
  /** Top 5 outcome trả nặng nhất, sort desc — staff thấy cụm outcome nguy hiểm. */
  topOutcomes: Bingo18OutcomePayout[];
}

/**
 * Các bucket NHÂN CAO (×120 — prize 1.200.000đ/bộ 10k default): đối tượng của alert
 * `bucket_concentration`. Khai const 1 chỗ để evaluator (p0-04) + UI (p0-05) cùng đọc.
 *
 * Gồm: sumTotal tổng 3 và 18 (1/216 mỗi tổng) + tripleMatch specific 1..6 (1/216 mỗi số).
 * `tripleMatch.any` (×20) và các tổng giữa KHÔNG thuộc nhóm này.
 */
export const BINGO18_HIGH_MULTIPLIER_BUCKETS: ReadonlyArray<{
  playType: typeof Bingo18PlayType.SumTotal | typeof Bingo18PlayType.TripleMatch;
  /** Key bucket trong `Bingo18ByPlayType` ("3"/"18" cho sumTotal, "1".."6" cho specific). */
  key: string;
}> = [
  { playType: Bingo18PlayType.SumTotal, key: "3" },
  { playType: Bingo18PlayType.SumTotal, key: "18" },
  ...Array.from({ length: 6 }, (_, i) => ({
    playType: Bingo18PlayType.TripleMatch,
    key: String(i + 1),
  })),
];

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/** sets của 1 bucket trong Record (bucket chưa có cược → 0). */
function setsOf(rec: Record<string, Bingo18BucketStat>, key: string): number {
  return rec[key]?.sets ?? 0;
}

/** Phân loại tổng → hướng bigSmallDraw (cùng biên với matchBigSmallDraw). */
function dirOfSum(sum: number): Bingo18BigSmallBet {
  if (sum <= BINGO18_SMALL_MAX) return Bingo18BigSmallBet.Small;
  if (sum >= BINGO18_BIG_MIN) return Bingo18BigSmallBet.Big;
  return Bingo18BigSmallBet.Draw;
}

/** Prize bigSmallDraw theo hướng. */
function bigSmallPrize(dir: Bingo18BigSmallBet, prizes: BigSmallDrawPrizes): number {
  switch (dir) {
    case Bingo18BigSmallBet.Big:
      return prizes.big;
    case Bingo18BigSmallBet.Draw:
      return prizes.draw;
    case Bingo18BigSmallBet.Small:
      return prizes.small;
  }
}

/** Đếm số lần n xuất hiện trong (a,b,c) — cùng logic matchSingleNum/matchDoubleMatch. */
function countOf(n: number, a: number, b: number, c: number): number {
  let count = 0;
  if (a === n) count++;
  if (b === n) count++;
  if (c === n) count++;
  return count;
}

/**
 * Duyệt 216 outcome, gọi `visit(a, b, c, sum)` cho từng outcome.
 * Cùng kỹ thuật vòng 6³ với `computeSumWays()` (odds.ts) — chi phí ≈ 0.
 */
function forEachOutcome(visit: (a: number, b: number, c: number, sum: number) => void): void {
  for (let a = BINGO18_DICE_MIN; a <= BINGO18_DICE_MAX; a++) {
    for (let b = BINGO18_DICE_MIN; b <= BINGO18_DICE_MAX; b++) {
      for (let c = BINGO18_DICE_MIN; c <= BINGO18_DICE_MAX; c++) {
        visit(a, b, c, a + b + c);
      }
    }
  }
}

// ─────────────────────────────────────────────
// Exposure toàn kỳ (từ bucket stats)
// ─────────────────────────────────────────────

/**
 * Tính exposure CHÍNH XÁC 1 kỳ từ bucket stats + bảng giải.
 *
 * THUẦN + idempotent — áp ở tầng đọc (snapshot response p0-05, eval alert p0-04),
 * KHÔNG lưu output vào doc. 216 outcome × 38 bucket ≈ vài nghìn phép tính.
 *
 * @param byPlayType - Full-bucket stats từ `Bingo18DrawBettingStatsDoc.byPlayType`.
 * @param prizes - Bảng giải từ GlobalConfig (KHÔNG dùng default hardcode ở call site).
 */
export function computeBingo18Exposure(
  byPlayType: Bingo18ByPlayType,
  prizes: Bingo18PrizeSet,
): Bingo18ExposureResult {
  const outcomes: Bingo18OutcomePayout[] = [];
  let total = 0;

  forEachOutcome((a, b, c, sum) => {
    let amount = 0;

    // ── singleNum + doubleMatch + tripleMatch.specific: theo số lần xuất hiện của n ──
    // singleNum trả theo bậc match1/2/3 (tra bảng); doubleMatch trả khi ≥ 2 lần;
    // specific trả khi cả 3 mặt = n (count = 3).
    for (let n = BINGO18_DICE_MIN; n <= BINGO18_DICE_MAX; n++) {
      const count = countOf(n, a, b, c);
      if (count === 0) continue;
      const key = String(n);
      amount += setsOf(byPlayType.singleNum, key) * lookupSingleNumPrize(count, prizes.singleNum);
      if (count >= 2) {
        amount += setsOf(byPlayType.doubleMatch, key) * prizes.doubleMatch.win;
      }
      if (count === 3) {
        amount += setsOf(byPlayType.tripleMatch.specific, key) * prizes.tripleMatch.specific;
      }
    }

    // ── tripleMatch.any: cả 3 mặt giống nhau, bất kể số nào ──
    if (a === b && b === c) {
      amount += byPlayType.tripleMatch.any.sets * prizes.tripleMatch.any;
    }

    // ── sumTotal: khớp tổng chính xác ──
    amount += setsOf(byPlayType.sumTotal, String(sum)) * lookupSumTotalPrize(sum, prizes.sumTotal);

    // ── bigSmallDraw: theo hướng của tổng ──
    const dir = dirOfSum(sum);
    amount += byPlayType.bigSmallDraw[dir].sets * bigSmallPrize(dir, prizes.bigSmallDraw);

    outcomes.push({ numbers: [a, b, c], sum, amount });
    total += amount;
  });

  // Sort desc theo amount để lấy worst/top; best là phần tử cuối.
  const sorted = outcomes.toSorted((x, y) => y.amount - x.amount);

  return {
    worstCase: sorted[0]!,
    bestCase: sorted[sorted.length - 1]!,
    expectedPayout: total / TOTAL_OUTCOMES,
    topOutcomes: sorted.slice(0, 5),
  };
}

// ─────────────────────────────────────────────
// PotentialWin per-entry (exact)
// ─────────────────────────────────────────────

/**
 * Worst-case 1 entry = `max_{216 outcome} payout(entry, outcome)` — CHÍNH XÁC.
 *
 * KHÔNG dùng Σ max per board như Keno: các board của Bingo 18 có thể LOẠI TRỪ nhau
 * (vd sumTotal 3 và sumTotal 18 không thể cùng trúng 1 kỳ) → Σ max phóng đại worst-case.
 * Chi phí 216 × số board (≤ maxBasicBoardsPerTicket) — chấp nhận được trong worker async.
 *
 * @param boards - `entry.entrySummary.boards` (unified — cả cơ bản và bổ sung).
 * @param prizes - Bảng giải từ GlobalConfig.
 */
export function computeBingo18EntryPotentialWin(
  boards: ReadonlyArray<
    Pick<EntryBoardSnapshot, "playType" | "number" | "tripleKind" | "sum" | "bet" | "betCount">
  >,
  prizes: Bingo18PrizeSet,
): number {
  let max = 0;

  forEachOutcome((a, b, c, sum) => {
    let amount = 0;

    // Phân nhánh playType đúng cách settle-entries.ts (mỗi board → 1 luật match).
    for (const board of boards) {
      switch (board.playType) {
        case Bingo18PlayType.SingleNum: {
          const count = countOf(board.number ?? 0, a, b, c);
          amount += lookupSingleNumPrize(count, prizes.singleNum) * board.betCount;
          break;
        }
        case Bingo18PlayType.DoubleMatch: {
          const count = countOf(board.number ?? 0, a, b, c);
          if (count >= 2) amount += prizes.doubleMatch.win * board.betCount;
          break;
        }
        case Bingo18PlayType.TripleMatch: {
          const allSame = a === b && b === c;
          if (!allSame) break;
          if (board.tripleKind === Bingo18TripleKind.Specific) {
            if (a === board.number) amount += prizes.tripleMatch.specific * board.betCount;
          } else {
            amount += prizes.tripleMatch.any * board.betCount;
          }
          break;
        }
        case Bingo18PlayType.SumTotal: {
          if (sum === board.sum) {
            amount += lookupSumTotalPrize(sum, prizes.sumTotal) * board.betCount;
          }
          break;
        }
        case Bingo18PlayType.BigSmallDraw: {
          if (board.bet === dirOfSum(sum)) {
            amount += bigSmallPrize(board.bet, prizes.bigSmallDraw) * board.betCount;
          }
          break;
        }
      }
    }

    if (amount > max) max = amount;
  });

  return max;
}

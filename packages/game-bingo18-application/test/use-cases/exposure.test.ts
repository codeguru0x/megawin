/**
 * Unit test `computeBingo18Exposure` + `computeBingo18EntryPotentialWin`
 * (packages/game-bingo18/src/rules/exposure.ts) — đối chứng TÍNH TAY theo bảng giải
 * default (plan bingo18-ops p0-02 §2).
 *
 * Fixture nhỏ có chủ đích: mỗi case chỉ vài bucket để kiểm được bằng tay từng outcome.
 */

import { describe, it, expect } from "vitest";
import {
  computeBingo18Exposure,
  computeBingo18EntryPotentialWin,
  DEFAULT_SINGLE_NUM_PRIZES,
  DEFAULT_DOUBLE_MATCH_PRIZES,
  DEFAULT_TRIPLE_MATCH_PRIZES,
  DEFAULT_SUM_TOTAL_PRIZES,
  DEFAULT_BIG_SMALL_DRAW_PRIZES,
  TOTAL_OUTCOMES,
  type Bingo18PrizeSet,
} from "@megawin/game-bingo18/rules";
import {
  Bingo18PlayType,
  Bingo18TripleKind,
  Bingo18BigSmallBet,
} from "@megawin/game-bingo18/entities";
import type { Bingo18ByPlayType, Bingo18BucketStat } from "@megawin/game-bingo18/entities";

const PRIZES: Bingo18PrizeSet = {
  singleNum: DEFAULT_SINGLE_NUM_PRIZES,
  doubleMatch: DEFAULT_DOUBLE_MATCH_PRIZES,
  tripleMatch: DEFAULT_TRIPLE_MATCH_PRIZES,
  sumTotal: DEFAULT_SUM_TOTAL_PRIZES,
  bigSmallDraw: DEFAULT_BIG_SMALL_DRAW_PRIZES,
};

function stat(sets: number): Bingo18BucketStat {
  return { amount: sets * 10_000, sets, entries: 1 };
}

/** byPlayType rỗng — mọi bucket 0 sets. */
function emptyByPlayType(): Bingo18ByPlayType {
  return {
    singleNum: {},
    doubleMatch: {},
    tripleMatch: { specific: {}, any: stat(0) },
    sumTotal: {},
    bigSmallDraw: { big: stat(0), draw: stat(0), small: stat(0) },
  };
}

describe("computeBingo18Exposure", () => {
  it("kỳ không có cược → mọi chỉ số = 0", () => {
    const r = computeBingo18Exposure(emptyByPlayType(), PRIZES);
    expect(r.worstCase.amount).toBe(0);
    expect(r.bestCase.amount).toBe(0);
    expect(r.expectedPayout).toBe(0);
  });

  it("1 bộ sumTotal 18 → worstCase = outcome (6,6,6), expected = 1.200.000/216", () => {
    const by = emptyByPlayType();
    by.sumTotal["18"] = stat(1);

    const r = computeBingo18Exposure(by, PRIZES);

    // Chỉ outcome (6,6,6) có sum=18 → trả 1.200.000; 215 outcome còn lại trả 0.
    expect(r.worstCase.amount).toBe(1_200_000);
    expect(r.worstCase.numbers).toEqual([6, 6, 6]);
    expect(r.worstCase.sum).toBe(18);
    expect(r.bestCase.amount).toBe(0);
    expect(r.expectedPayout).toBeCloseTo(1_200_000 / TOTAL_OUTCOMES, 6);
  });

  it("sumTotal 18 + tripleMatch specific 6 + bigSmallDraw big CỘNG DỒN tại (6,6,6)", () => {
    const by = emptyByPlayType();
    by.sumTotal["18"] = stat(2); //           2 × 1.200.000 = 2.400.000
    by.tripleMatch.specific["6"] = stat(1); // 1 × 1.200.000 = 1.200.000
    by.bigSmallDraw.big = stat(3); //          3 ×    15.000 =    45.000

    const r = computeBingo18Exposure(by, PRIZES);

    // (6,6,6): sum=18 (sumTotal + big) + cả 3 mặt = 6 (specific).
    expect(r.worstCase.numbers).toEqual([6, 6, 6]);
    expect(r.worstCase.amount).toBe(2_400_000 + 1_200_000 + 45_000);
  });

  it("singleNum: trả theo bậc match1/2/3 — outcome (5,5,5) trả match3", () => {
    const by = emptyByPlayType();
    by.singleNum["5"] = stat(2);

    const r = computeBingo18Exposure(by, PRIZES);

    // Worst outcome cho singleNum[5] = 3 lần số 5 → 2 sets × 30.000 = 60.000.
    // (5,5,5) còn cộng gì nữa không? tripleMatch/sumTotal/bigSmall đều 0 sets → không.
    expect(r.worstCase.amount).toBe(2 * 30_000);
    expect(r.worstCase.numbers).toEqual([5, 5, 5]);

    // Expected tính tay theo phân phối Binomial(3, 1/6) (odds.ts §II):
    // P(1 lần)=75/216 ×12k + P(2 lần)=15/216 ×20k + P(3 lần)=1/216 ×30k, nhân 2 sets.
    const expectedPerSet = (75 * 12_000 + 15 * 20_000 + 1 * 30_000) / TOTAL_OUTCOMES;
    expect(r.expectedPayout).toBeCloseTo(2 * expectedPerSet, 6);
  });

  it("doubleMatch: chỉ trả khi số xuất hiện ≥ 2 lần (16/216 outcome)", () => {
    const by = emptyByPlayType();
    by.doubleMatch["3"] = stat(1);

    const r = computeBingo18Exposure(by, PRIZES);

    expect(r.worstCase.amount).toBe(75_000);
    // 16 ways (15 exact-2 + 1 exact-3) — odds.ts §III.
    expect(r.expectedPayout).toBeCloseTo((16 * 75_000) / TOTAL_OUTCOMES, 6);
  });

  it("bigSmallDraw: small trả trên 106 outcome, draw 54, big 56 (odds.ts §V)", () => {
    const by = emptyByPlayType();
    by.bigSmallDraw.small = stat(1);
    by.bigSmallDraw.draw = stat(1);
    by.bigSmallDraw.big = stat(1);

    const r = computeBingo18Exposure(by, PRIZES);

    // Mỗi outcome trả đúng 1 hướng → expected = (106×15k + 54×20k + 56×15k)/216.
    const expected = (106 * 15_000 + 54 * 20_000 + 56 * 15_000) / TOTAL_OUTCOMES;
    expect(r.expectedPayout).toBeCloseTo(expected, 6);
    // Worst = outcome hoà (20k > 15k).
    expect(r.worstCase.amount).toBe(20_000);
  });

  it("topOutcomes trả 5 outcome nặng nhất sort desc", () => {
    const by = emptyByPlayType();
    by.sumTotal["3"] = stat(1); // chỉ (1,1,1)
    by.sumTotal["4"] = stat(1); // 3 outcome (1,1,2)…

    const r = computeBingo18Exposure(by, PRIZES);

    expect(r.topOutcomes).toHaveLength(5);
    expect(r.topOutcomes[0]!.amount).toBe(1_200_000); // sum 3
    expect(r.topOutcomes[1]!.amount).toBe(400_000); // sum 4 (3 outcome cùng mức)
    expect(r.topOutcomes[0]!.amount).toBeGreaterThanOrEqual(r.topOutcomes[4]!.amount);
  });
});

describe("computeBingo18EntryPotentialWin", () => {
  it("board loại trừ nhau (sumTotal 3 + sumTotal 18) → max = 1 giải, KHÔNG phải tổng", () => {
    // Σ max per board (kiểu Keno proxy) sẽ ra 2.400.000 — SAI với Bingo 18.
    // Exact: không outcome nào có sum vừa 3 vừa 18 → max = 1.200.000.
    const win = computeBingo18EntryPotentialWin(
      [
        { playType: Bingo18PlayType.SumTotal, sum: 3, betCount: 1 },
        { playType: Bingo18PlayType.SumTotal, sum: 18, betCount: 1 },
      ],
      PRIZES,
    );
    expect(win).toBe(1_200_000);
  });

  it("board cộng hưởng (sumTotal 18 + triple specific 6 + big) → max = tổng tại (6,6,6)", () => {
    const win = computeBingo18EntryPotentialWin(
      [
        { playType: Bingo18PlayType.SumTotal, sum: 18, betCount: 1 },
        {
          playType: Bingo18PlayType.TripleMatch,
          tripleKind: Bingo18TripleKind.Specific,
          number: 6,
          betCount: 2,
        },
        { playType: Bingo18PlayType.BigSmallDraw, bet: Bingo18BigSmallBet.Big, betCount: 1 },
      ],
      PRIZES,
    );
    // (6,6,6): 1.200.000 + 2×1.200.000 + 15.000.
    expect(win).toBe(1_200_000 + 2_400_000 + 15_000);
  });

  it("betCount nhân đúng vào từng board (singleNum match3)", () => {
    const win = computeBingo18EntryPotentialWin(
      [{ playType: Bingo18PlayType.SingleNum, number: 2, betCount: 10 }],
      PRIZES,
    );
    // Worst outcome (2,2,2): match3 = 30.000 × 10.
    expect(win).toBe(300_000);
  });
});

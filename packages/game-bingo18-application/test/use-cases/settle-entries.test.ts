import { Bingo18BigSmallBet, Bingo18TripleKind } from "@megawin/game-bingo18/entities/enums";
import {
  computeDrawStats,
  matchBigSmallDraw,
  matchDoubleMatch,
  matchSingleNum,
  matchSumTotal,
  matchTripleMatch,
} from "@megawin/game-bingo18/helpers/match-result";
import { describe, expect, it } from "vitest";

// ─── Helpers ────────────────────────────────────────

function drawResult(numbers: number[]) {
  return { numbers, sum: numbers.reduce((a, b) => a + b, 0) };
}

// ─── 1. matchSingleNum ─────────────────────────────

describe("matchSingleNum – Đối soát cách chơi Một số", () => {
  it("số không xuất hiện → matchCount=0, winAmount=0", () => {
    const r = matchSingleNum(1, drawResult([2, 3, 4]));
    expect(r.matchCount).toBe(0);
    expect(r.winAmount).toBe(0);
  });

  it("số xuất hiện 1 lần → 12,000 VND", () => {
    const r = matchSingleNum(3, drawResult([1, 3, 5]));
    expect(r.matchCount).toBe(1);
    expect(r.winAmount).toBe(12_000);
  });

  it("số xuất hiện 2 lần → 20,000 VND", () => {
    const r = matchSingleNum(4, drawResult([4, 4, 2]));
    expect(r.matchCount).toBe(2);
    expect(r.winAmount).toBe(20_000);
  });

  it("số xuất hiện 3 lần → 30,000 VND", () => {
    const r = matchSingleNum(6, drawResult([6, 6, 6]));
    expect(r.matchCount).toBe(3);
    expect(r.winAmount).toBe(30_000);
  });
});

// ─── 2. matchDoubleMatch ────────────────────────────

describe("matchDoubleMatch – Đối soát cách chơi Hai số trùng", () => {
  it("matchCount=0 → thua", () => {
    const r = matchDoubleMatch(1, drawResult([2, 3, 4]));
    expect(r.matchCount).toBe(0);
    expect(r.isWin).toBe(false);
    expect(r.winAmount).toBe(0);
  });

  it("matchCount=1 → thua", () => {
    const r = matchDoubleMatch(3, drawResult([3, 4, 5]));
    expect(r.matchCount).toBe(1);
    expect(r.isWin).toBe(false);
    expect(r.winAmount).toBe(0);
  });

  it("matchCount=2 → thắng 75,000 VND", () => {
    const r = matchDoubleMatch(5, drawResult([5, 5, 2]));
    expect(r.matchCount).toBe(2);
    expect(r.isWin).toBe(true);
    expect(r.winAmount).toBe(75_000);
  });

  it("matchCount=3 → thắng 75,000 VND", () => {
    const r = matchDoubleMatch(2, drawResult([2, 2, 2]));
    expect(r.matchCount).toBe(3);
    expect(r.isWin).toBe(true);
    expect(r.winAmount).toBe(75_000);
  });
});

// ─── 3. matchTripleMatch (specific) ─────────────────

describe("matchTripleMatch specific – Đối soát Ba số trùng cụ thể", () => {
  it("đúng bộ ba → thắng 1,200,000 VND", () => {
    const r = matchTripleMatch(Bingo18TripleKind.Specific, 4, drawResult([4, 4, 4]));
    expect(r.isWin).toBe(true);
    expect(r.winAmount).toBe(1_200_000);
  });

  it("bộ ba khác số đã chọn → thua", () => {
    const r = matchTripleMatch(Bingo18TripleKind.Specific, 4, drawResult([5, 5, 5]));
    expect(r.isWin).toBe(false);
    expect(r.winAmount).toBe(0);
  });

  it("không phải bộ ba → thua", () => {
    const r = matchTripleMatch(Bingo18TripleKind.Specific, 3, drawResult([3, 3, 1]));
    expect(r.isWin).toBe(false);
    expect(r.winAmount).toBe(0);
  });
});

// ─── 4. matchTripleMatch (any) ──────────────────────

describe("matchTripleMatch any – Đối soát Ba số trùng bất kỳ", () => {
  it("3 số giống nhau bất kỳ → thắng 200,000 VND", () => {
    const r = matchTripleMatch(Bingo18TripleKind.Any, undefined, drawResult([2, 2, 2]));
    expect(r.isWin).toBe(true);
    expect(r.winAmount).toBe(200_000);
  });

  it("không phải bộ ba → thua", () => {
    const r = matchTripleMatch(Bingo18TripleKind.Any, undefined, drawResult([1, 1, 2]));
    expect(r.isWin).toBe(false);
    expect(r.winAmount).toBe(0);
  });

  it("3 số khác nhau → thua", () => {
    const r = matchTripleMatch(Bingo18TripleKind.Any, undefined, drawResult([1, 2, 3]));
    expect(r.isWin).toBe(false);
    expect(r.winAmount).toBe(0);
  });
});

// ─── 5. matchSumTotal ───────────────────────────────

describe("matchSumTotal – Đối soát cách chơi Cộng tổng", () => {
  const EXPECTED_PRIZES: Record<number, number> = {
    3: 1_200_000,
    4: 400_000,
    5: 200_000,
    6: 120_000,
    7: 80_000,
    8: 55_000,
    9: 47_000,
    10: 44_000,
    11: 44_000,
    12: 47_000,
    13: 55_000,
    14: 80_000,
    15: 120_000,
    16: 200_000,
    17: 400_000,
    18: 1_200_000,
  };

  const SUM_EXAMPLES: Record<number, number[]> = {
    3: [1, 1, 1],
    4: [1, 1, 2],
    5: [1, 2, 2],
    6: [2, 2, 2],
    7: [1, 3, 3],
    8: [2, 3, 3],
    9: [3, 3, 3],
    10: [3, 3, 4],
    11: [3, 4, 4],
    12: [4, 4, 4],
    13: [3, 4, 6],
    14: [4, 4, 6],
    15: [5, 5, 5],
    16: [4, 6, 6],
    17: [5, 6, 6],
    18: [6, 6, 6],
  };

  it.each(
    Object.entries(EXPECTED_PRIZES).map(([sum, prize]) => ({
      sum: Number(sum),
      prize,
      numbers: SUM_EXAMPLES[Number(sum)]!,
    })),
  )("tổng $sum → thắng $prize VND", ({ sum, prize, numbers }) => {
    const r = matchSumTotal(sum, drawResult(numbers));
    expect(r.isWin).toBe(true);
    expect(r.winAmount).toBe(prize);
    expect(r.outcome).toBe(`sum${sum}`);
  });

  it("tổng không khớp → thua", () => {
    const r = matchSumTotal(10, drawResult([1, 2, 3]));
    expect(r.isWin).toBe(false);
    expect(r.winAmount).toBe(0);
    expect(r.outcome).toBe("sum6");
  });
});

// ─── 6. matchBigSmallDraw ───────────────────────────

describe("matchBigSmallDraw – Đối soát cược Lớn/Hòa/Nhỏ", () => {
  describe("cược Nhỏ (Small)", () => {
    it("sum=5 → thắng 15,000", () => {
      const r = matchBigSmallDraw(Bingo18BigSmallBet.Small, drawResult([1, 2, 2]));
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(15_000);
    });

    it("sum=3 (min) → thắng 15,000", () => {
      const r = matchBigSmallDraw(Bingo18BigSmallBet.Small, drawResult([1, 1, 1]));
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(15_000);
    });

    it("sum=9 (boundary) → thắng 15,000", () => {
      const r = matchBigSmallDraw(Bingo18BigSmallBet.Small, drawResult([3, 3, 3]));
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(15_000);
    });

    it("sum=10 → thua", () => {
      const r = matchBigSmallDraw(Bingo18BigSmallBet.Small, drawResult([3, 3, 4]));
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });
  });

  describe("cược Hòa (Draw)", () => {
    it("sum=10 → thắng 20,000", () => {
      const r = matchBigSmallDraw(Bingo18BigSmallBet.Draw, drawResult([3, 3, 4]));
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(20_000);
    });

    it("sum=11 → thắng 20,000", () => {
      const r = matchBigSmallDraw(Bingo18BigSmallBet.Draw, drawResult([3, 4, 4]));
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(20_000);
    });

    it("sum=9 → thua", () => {
      const r = matchBigSmallDraw(Bingo18BigSmallBet.Draw, drawResult([3, 3, 3]));
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });

    it("sum=12 → thua", () => {
      const r = matchBigSmallDraw(Bingo18BigSmallBet.Draw, drawResult([4, 4, 4]));
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });
  });

  describe("cược Lớn (Big)", () => {
    it("sum=15 → thắng 15,000", () => {
      const r = matchBigSmallDraw(Bingo18BigSmallBet.Big, drawResult([5, 5, 5]));
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(15_000);
    });

    it("sum=12 (boundary) → thắng 15,000", () => {
      const r = matchBigSmallDraw(Bingo18BigSmallBet.Big, drawResult([4, 4, 4]));
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(15_000);
    });

    it("sum=18 (max) → thắng 15,000", () => {
      const r = matchBigSmallDraw(Bingo18BigSmallBet.Big, drawResult([6, 6, 6]));
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(15_000);
    });

    it("sum=11 → thua", () => {
      const r = matchBigSmallDraw(Bingo18BigSmallBet.Big, drawResult([3, 4, 4]));
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });
  });
});

// ─── 7. computeDrawStats ────────────────────────────

describe("computeDrawStats – Thống kê kết quả quay Bingo18", () => {
  it("tính tổng đúng cho [1,1,1]", () => {
    expect(computeDrawStats([1, 1, 1]).sum).toBe(3);
  });

  it("tính tổng đúng cho [6,6,6]", () => {
    expect(computeDrawStats([6, 6, 6]).sum).toBe(18);
  });

  it("tính tổng đúng cho [2,4,5]", () => {
    expect(computeDrawStats([2, 4, 5]).sum).toBe(11);
  });

  it("tính tổng đúng cho [3,3,3]", () => {
    expect(computeDrawStats([3, 3, 3]).sum).toBe(9);
  });
});

// ─── 8. Tích hợp: kết quả [3,3,3] ─────────────────

describe("Tích hợp – Kết quả quay [3,3,3]", () => {
  const result = drawResult([3, 3, 3]);

  it("singleNum(3) → matchCount=3, winAmount=30,000", () => {
    const r = matchSingleNum(3, result);
    expect(r.matchCount).toBe(3);
    expect(r.winAmount).toBe(30_000);
  });

  it("doubleMatch(3) → thắng 75,000", () => {
    const r = matchDoubleMatch(3, result);
    expect(r.isWin).toBe(true);
    expect(r.winAmount).toBe(75_000);
  });

  it("tripleMatch specific(3) → thắng 1,200,000", () => {
    const r = matchTripleMatch(Bingo18TripleKind.Specific, 3, result);
    expect(r.isWin).toBe(true);
    expect(r.winAmount).toBe(1_200_000);
  });

  it("tripleMatch any → thắng 200,000", () => {
    const r = matchTripleMatch(Bingo18TripleKind.Any, undefined, result);
    expect(r.isWin).toBe(true);
    expect(r.winAmount).toBe(200_000);
  });

  it("sumTotal(9) → thắng 47,000", () => {
    const r = matchSumTotal(9, result);
    expect(r.isWin).toBe(true);
    expect(r.winAmount).toBe(47_000);
  });

  it("bigSmallDraw(small) → thắng 15,000 (sum=9 ≤ 9)", () => {
    const r = matchBigSmallDraw(Bingo18BigSmallBet.Small, result);
    expect(r.isWin).toBe(true);
    expect(r.winAmount).toBe(15_000);
  });

  it("singleNum(1) → không trùng, winAmount=0", () => {
    const r = matchSingleNum(1, result);
    expect(r.matchCount).toBe(0);
    expect(r.winAmount).toBe(0);
  });

  it("tripleMatch specific(5) → thua", () => {
    const r = matchTripleMatch(Bingo18TripleKind.Specific, 5, result);
    expect(r.isWin).toBe(false);
    expect(r.winAmount).toBe(0);
  });

  it("bigSmallDraw(big) → thua (sum=9 < 12)", () => {
    const r = matchBigSmallDraw(Bingo18BigSmallBet.Big, result);
    expect(r.isWin).toBe(false);
    expect(r.winAmount).toBe(0);
  });
});

// ─── 9. betCount multiplier logic ──────────────────
// Matching functions trả per-unit winAmount.
// Settle nhân winAmount × betCount tại payout.

describe("betCount multiplier – winAmount nhân theo số lần cược", () => {
  it("singleNum match 1 lần, betCount=3 → winAmount = 12,000 × 3 = 36,000", () => {
    const r = matchSingleNum(3, drawResult([1, 3, 5]));
    // per-unit winAmount từ matching function
    expect(r.winAmount).toBe(12_000);
    // settle nhân betCount
    const betCount = 3;
    expect(r.winAmount * betCount).toBe(36_000);
  });

  it("doubleMatch thắng, betCount=5 → winAmount = 75,000 × 5 = 375,000", () => {
    const r = matchDoubleMatch(5, drawResult([5, 5, 2]));
    expect(r.winAmount).toBe(75_000);
    const betCount = 5;
    expect(r.winAmount * betCount).toBe(375_000);
  });

  it("tripleMatch specific thắng, betCount=2 → winAmount = 1,200,000 × 2 = 2,400,000", () => {
    const r = matchTripleMatch(Bingo18TripleKind.Specific, 4, drawResult([4, 4, 4]));
    expect(r.winAmount).toBe(1_200_000);
    const betCount = 2;
    expect(r.winAmount * betCount).toBe(2_400_000);
  });

  it("sumTotal tổng 9, betCount=10 → winAmount = 47,000 × 10 = 470,000", () => {
    const r = matchSumTotal(9, drawResult([3, 3, 3]));
    expect(r.winAmount).toBe(47_000);
    const betCount = 10;
    expect(r.winAmount * betCount).toBe(470_000);
  });

  it("bigSmallDraw small thắng, betCount=4 → winAmount = 15,000 × 4 = 60,000", () => {
    const r = matchBigSmallDraw(Bingo18BigSmallBet.Small, drawResult([1, 2, 2]));
    expect(r.winAmount).toBe(15_000);
    const betCount = 4;
    expect(r.winAmount * betCount).toBe(60_000);
  });

  it("thua mọi loại, betCount bất kỳ → winAmount vẫn = 0", () => {
    const betCount = 10;
    expect(matchSingleNum(6, drawResult([1, 2, 3])).winAmount * betCount).toBe(0);
    expect(matchDoubleMatch(1, drawResult([2, 3, 4])).winAmount * betCount).toBe(0);
    expect(matchTripleMatch(Bingo18TripleKind.Specific, 1, drawResult([2, 2, 2])).winAmount * betCount).toBe(0);
    expect(matchSumTotal(5, drawResult([3, 3, 3])).winAmount * betCount).toBe(0);
    expect(matchBigSmallDraw(Bingo18BigSmallBet.Big, drawResult([1, 1, 1])).winAmount * betCount).toBe(0);
  });
});

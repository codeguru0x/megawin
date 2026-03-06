import { describe, it, expect } from "vitest";
import {
  lookupBasicPrize,
  DEFAULT_BASIC_PRIZE_TABLE,
} from "@megawin/game-keno/rules/prize-tables";
import {
  matchBasicBoard,
  matchBigSmallBet,
  matchEvenOddBet,
  computeDrawStats,
} from "@megawin/game-keno/helpers/match-result";
import {
  KenoBigSmallBet,
  KenoEvenOddBet,
} from "@megawin/game-keno/entities/enums";

// ─── Helpers ────────────────────────────────────────

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function makeDrawResult(winningNumbers: string[]) {
  const stats = computeDrawStats(winningNumbers);
  return { winningNumbers, ...stats };
}

/**
 * Tạo 20 số quay với số chẵn/lẻ/lớn/nhỏ tuỳ ý.
 * Dùng cho test side-bet mà không cần random.
 */
function numbersWithCounts(opts: {
  bigCount: number;
  evenCount: number;
}): string[] {
  const { bigCount, evenCount } = opts;
  const smallCount = 20 - bigCount;

  // big-even: 42,44,46,48,50,52,54,56,58,60,...
  // big-odd:  41,43,45,47,49,51,53,55,57,59,...
  // small-even: 2,4,6,8,10,12,14,16,18,20,...
  // small-odd:  1,3,5,7,9,11,13,15,17,19,...
  const bigEvenPool = Array.from({ length: 20 }, (_, i) => 42 + i * 2);
  const bigOddPool = Array.from({ length: 20 }, (_, i) => 41 + i * 2);
  const smallEvenPool = Array.from({ length: 20 }, (_, i) => 2 + i * 2);
  const smallOddPool = Array.from({ length: 20 }, (_, i) => 1 + i * 2);

  const result: number[] = [];

  const bigEven = Math.min(evenCount, bigCount);
  const bigOdd = bigCount - bigEven;
  const smallEven = evenCount - bigEven;
  const smallOdd = smallCount - smallEven;

  result.push(...bigEvenPool.slice(0, bigEven));
  result.push(...bigOddPool.slice(0, bigOdd));
  result.push(...smallEvenPool.slice(0, smallEven));
  result.push(...smallOddPool.slice(0, smallOdd));

  return result.map(pad);
}

// ─── 1. lookupBasicPrize ────────────────────────────

describe("lookupBasicPrize – Tra cứu giải thưởng cơ bản", () => {
  it.each(
    Object.entries(DEFAULT_BASIC_PRIZE_TABLE).flatMap(([pick, matches]) =>
      Object.entries(matches).map(([match, prize]) => ({
        pickCount: Number(pick),
        matchCount: Number(match),
        expected: prize,
      })),
    ),
  )(
    "pick$pickCount / match$matchCount → $expected VND",
    ({ pickCount, matchCount, expected }) => {
      expect(lookupBasicPrize(pickCount, matchCount)).toBe(expected);
    },
  );

  it("trả 0 khi matchCount không có giải", () => {
    expect(lookupBasicPrize(1, 0)).toBe(0);
    expect(lookupBasicPrize(5, 1)).toBe(0);
    expect(lookupBasicPrize(6, 2)).toBe(0);
    expect(lookupBasicPrize(10, 4)).toBe(0);
  });

  it("trả 0 khi pickCount không hợp lệ", () => {
    expect(lookupBasicPrize(0, 0)).toBe(0);
    expect(lookupBasicPrize(11, 5)).toBe(0);
  });
});

// ─── 2. matchBasicBoard ─────────────────────────────

describe("matchBasicBoard – Đối soát cách chơi cơ bản", () => {
  const baseWinning = ["01", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55", "60", "65", "70", "75", "80", "03", "07", "12"];

  it("pick1 trúng 1 số → 20,000 VND", () => {
    const result = makeDrawResult(baseWinning);
    const r = matchBasicBoard(["05"], result);
    expect(r.pickCount).toBe(1);
    expect(r.matchCount).toBe(1);
    expect(r.matchedNumbers).toEqual(["05"]);
    expect(r.winAmount).toBe(20_000);
  });

  it("pick1 trượt → 0 VND", () => {
    const result = makeDrawResult(baseWinning);
    const r = matchBasicBoard(["02"], result);
    expect(r.matchCount).toBe(0);
    expect(r.winAmount).toBe(0);
  });

  describe("pick5 – các mức trùng", () => {
    it("match5 → 4,400,000 VND", () => {
      const result = makeDrawResult(baseWinning);
      const r = matchBasicBoard(["01", "05", "10", "15", "20"], result);
      expect(r.matchCount).toBe(5);
      expect(r.winAmount).toBe(4_400_000);
    });

    it("match4 → 150,000 VND", () => {
      const result = makeDrawResult(baseWinning);
      const r = matchBasicBoard(["01", "05", "10", "15", "02"], result);
      expect(r.matchCount).toBe(4);
      expect(r.winAmount).toBe(150_000);
    });

    it("match3 → 10,000 VND", () => {
      const result = makeDrawResult(baseWinning);
      const r = matchBasicBoard(["01", "05", "10", "02", "04"], result);
      expect(r.matchCount).toBe(3);
      expect(r.winAmount).toBe(10_000);
    });

    it("match2 → 10,000 VND", () => {
      const result = makeDrawResult(baseWinning);
      const r = matchBasicBoard(["01", "05", "02", "04", "06"], result);
      expect(r.matchCount).toBe(2);
      expect(r.winAmount).toBe(10_000);
    });

    it("match1 → 0 VND (không có giải)", () => {
      const result = makeDrawResult(baseWinning);
      const r = matchBasicBoard(["01", "02", "04", "06", "08"], result);
      expect(r.matchCount).toBe(1);
      expect(r.winAmount).toBe(0);
    });

    it("match0 → 0 VND", () => {
      const result = makeDrawResult(baseWinning);
      const r = matchBasicBoard(["02", "04", "06", "08", "09"], result);
      expect(r.matchCount).toBe(0);
      expect(r.winAmount).toBe(0);
    });
  });

  describe("pick8/pick9/pick10 – giải an ủi match0", () => {
    it("pick8 match0 → 10,000 VND", () => {
      const result = makeDrawResult(baseWinning);
      const r = matchBasicBoard(
        ["02", "04", "06", "08", "09", "11", "13", "14"],
        result,
      );
      expect(r.matchCount).toBe(0);
      expect(r.winAmount).toBe(10_000);
    });

    it("pick9 match0 → 10,000 VND", () => {
      const result = makeDrawResult(baseWinning);
      const r = matchBasicBoard(
        ["02", "04", "06", "08", "09", "11", "13", "14", "16"],
        result,
      );
      expect(r.matchCount).toBe(0);
      expect(r.winAmount).toBe(10_000);
    });

    it("pick10 match0 → 10,000 VND", () => {
      const result = makeDrawResult(baseWinning);
      const r = matchBasicBoard(
        ["02", "04", "06", "08", "09", "11", "13", "14", "16", "17"],
        result,
      );
      expect(r.matchCount).toBe(0);
      expect(r.winAmount).toBe(10_000);
    });
  });

  it("pick10 match10 → 2,000,000,000 VND", () => {
    const winning = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59"];
    const result = makeDrawResult(winning);
    const r = matchBasicBoard(
      ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"],
      result,
    );
    expect(r.matchCount).toBe(10);
    expect(r.winAmount).toBe(2_000_000_000);
  });
});

// ─── 3. matchBigSmallBet ────────────────────────────

describe("matchBigSmallBet – Đối soát cược Lớn/Nhỏ", () => {
  describe("cược Lớn (Big)", () => {
    it("bigCount >= 13 → thắng 26,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 14, evenCount: 10 }));
      const r = matchBigSmallBet(KenoBigSmallBet.Big, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("big13Plus");
      expect(r.winAmount).toBe(26_000);
    });

    it("bigCount = 13 → thắng 26,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 13, evenCount: 10 }));
      const r = matchBigSmallBet(KenoBigSmallBet.Big, result);
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(26_000);
    });

    it("bigCount = 12 → thắng 10,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 12, evenCount: 10 }));
      const r = matchBigSmallBet(KenoBigSmallBet.Big, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("big1112");
      expect(r.winAmount).toBe(10_000);
    });

    it("bigCount = 11 → thắng 10,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 11, evenCount: 10 }));
      const r = matchBigSmallBet(KenoBigSmallBet.Big, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("big1112");
      expect(r.winAmount).toBe(10_000);
    });

    it("bigCount = 10 → thua", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 10 }));
      const r = matchBigSmallBet(KenoBigSmallBet.Big, result);
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });

    it("bigCount = 5 → thua", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 5, evenCount: 10 }));
      const r = matchBigSmallBet(KenoBigSmallBet.Big, result);
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });
  });

  describe("cược Hoà Lớn Nhỏ (BigSmallDraw)", () => {
    it("bigCount=10 && smallCount=10 → thắng 26,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 10 }));
      const r = matchBigSmallBet(KenoBigSmallBet.BigSmallDraw, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("draw");
      expect(r.winAmount).toBe(26_000);
    });

    it("bigCount=12 → thua", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 12, evenCount: 10 }));
      const r = matchBigSmallBet(KenoBigSmallBet.BigSmallDraw, result);
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });
  });

  describe("cược Nhỏ (Small)", () => {
    it("smallCount >= 13 → thắng 26,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 6, evenCount: 10 }));
      const r = matchBigSmallBet(KenoBigSmallBet.Small, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("small13Plus");
      expect(r.winAmount).toBe(26_000);
    });

    it("smallCount = 12 → thắng 10,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 8, evenCount: 10 }));
      const r = matchBigSmallBet(KenoBigSmallBet.Small, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("small1112");
      expect(r.winAmount).toBe(10_000);
    });

    it("smallCount = 11 → thắng 10,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 9, evenCount: 10 }));
      const r = matchBigSmallBet(KenoBigSmallBet.Small, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("small1112");
      expect(r.winAmount).toBe(10_000);
    });

    it("smallCount = 10 → thua", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 10 }));
      const r = matchBigSmallBet(KenoBigSmallBet.Small, result);
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });
  });
});

// ─── 4. matchEvenOddBet ─────────────────────────────

describe("matchEvenOddBet – Đối soát cược Chẵn/Lẻ", () => {
  describe("cược Chẵn (Even)", () => {
    it("evenCount >= 15 → thắng 200,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 16 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Even, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("even15Plus");
      expect(r.winAmount).toBe(200_000);
    });

    it("evenCount = 15 → thắng 200,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 15 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Even, result);
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(200_000);
    });

    it("evenCount = 14 → thắng 40,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 14 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Even, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("even1314");
      expect(r.winAmount).toBe(40_000);
    });

    it("evenCount = 13 → thắng 40,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 13 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Even, result);
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(40_000);
    });

    it("evenCount = 12 → thua", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 12 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Even, result);
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });
  });

  describe("cược Chẵn 11-12 (Even1112)", () => {
    it("evenCount = 11 → thắng 20,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 11 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Even1112, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("even1112");
      expect(r.winAmount).toBe(20_000);
    });

    it("evenCount = 12 → thắng 20,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 12 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Even1112, result);
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(20_000);
    });

    it("evenCount = 10 → thua", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 10 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Even1112, result);
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });

    it("evenCount = 13 → thua", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 13 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Even1112, result);
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });
  });

  describe("cược Hoà Chẵn Lẻ (EvenOddDraw)", () => {
    it("evenCount=10 && oddCount=10 → thắng 20,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 10 }));
      const r = matchEvenOddBet(KenoEvenOddBet.EvenOddDraw, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("draw");
      expect(r.winAmount).toBe(20_000);
    });

    it("evenCount=12 → thua", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 12 }));
      const r = matchEvenOddBet(KenoEvenOddBet.EvenOddDraw, result);
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });
  });

  describe("cược Lẻ 11-12 (Odd1112)", () => {
    it("oddCount = 11 → thắng 20,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 9 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Odd1112, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("odd1112");
      expect(r.winAmount).toBe(20_000);
    });

    it("oddCount = 12 → thắng 20,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 8 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Odd1112, result);
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(20_000);
    });

    it("oddCount = 10 → thua", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 10 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Odd1112, result);
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });
  });

  describe("cược Lẻ (Odd)", () => {
    it("oddCount >= 15 → thắng 200,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 4 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Odd, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("odd15Plus");
      expect(r.winAmount).toBe(200_000);
    });

    it("oddCount = 15 → thắng 200,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 5 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Odd, result);
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(200_000);
    });

    it("oddCount = 14 → thắng 40,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 6 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Odd, result);
      expect(r.isWin).toBe(true);
      expect(r.outcome).toBe("odd1314");
      expect(r.winAmount).toBe(40_000);
    });

    it("oddCount = 13 → thắng 40,000", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 7 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Odd, result);
      expect(r.isWin).toBe(true);
      expect(r.winAmount).toBe(40_000);
    });

    it("oddCount = 12 → thua", () => {
      const result = makeDrawResult(numbersWithCounts({ bigCount: 10, evenCount: 8 }));
      const r = matchEvenOddBet(KenoEvenOddBet.Odd, result);
      expect(r.isWin).toBe(false);
      expect(r.winAmount).toBe(0);
    });
  });
});

// ─── 5. computeDrawStats ────────────────────────────

describe("computeDrawStats – Thống kê kết quả quay Keno", () => {
  it("20 số đều ≤ 40 → bigCount=0, smallCount=20", () => {
    const nums = Array.from({ length: 20 }, (_, i) => pad(i + 1));
    const stats = computeDrawStats(nums);
    expect(stats.bigCount).toBe(0);
    expect(stats.smallCount).toBe(20);
  });

  it("20 số đều > 40 → bigCount=20, smallCount=0", () => {
    const nums = Array.from({ length: 20 }, (_, i) => pad(41 + i));
    const stats = computeDrawStats(nums);
    expect(stats.bigCount).toBe(20);
    expect(stats.smallCount).toBe(0);
  });

  it("10 lớn, 10 nhỏ → bigCount=10, smallCount=10", () => {
    const small = Array.from({ length: 10 }, (_, i) => pad(i + 1));
    const big = Array.from({ length: 10 }, (_, i) => pad(41 + i));
    const stats = computeDrawStats([...small, ...big]);
    expect(stats.bigCount).toBe(10);
    expect(stats.smallCount).toBe(10);
  });

  it("boundary: 40 is small, 41 is big", () => {
    const stats = computeDrawStats(["40", "41"]);
    expect(stats.smallCount).toBe(1);
    expect(stats.bigCount).toBe(1);
  });

  it("tất cả chẵn → evenCount=20, oddCount=0", () => {
    const nums = Array.from({ length: 20 }, (_, i) => pad((i + 1) * 2));
    const stats = computeDrawStats(nums);
    expect(stats.evenCount).toBe(20);
    expect(stats.oddCount).toBe(0);
  });

  it("tất cả lẻ → evenCount=0, oddCount=20", () => {
    const nums = Array.from({ length: 20 }, (_, i) => pad(i * 2 + 1));
    const stats = computeDrawStats(nums);
    expect(stats.evenCount).toBe(0);
    expect(stats.oddCount).toBe(20);
  });

  it("hỗn hợp: 15 chẵn, 5 lẻ", () => {
    const even = Array.from({ length: 15 }, (_, i) => pad((i + 1) * 2));
    const odd = Array.from({ length: 5 }, (_, i) => pad(i * 2 + 1));
    const stats = computeDrawStats([...even, ...odd]);
    expect(stats.evenCount).toBe(15);
    expect(stats.oddCount).toBe(5);
  });

  it("xác minh đồng thời big/small và even/odd", () => {
    const bigEven = ["42", "44", "46", "48", "50", "52", "54", "56", "58", "60", "62", "64"];
    const bigOdd = ["41", "43", "45"];
    const smallEven = ["02", "04"];
    const smallOdd = ["01", "03", "05"];
    const nums = [...bigEven, ...bigOdd, ...smallEven, ...smallOdd];
    const stats = computeDrawStats(nums);
    expect(stats.bigCount).toBe(15);
    expect(stats.smallCount).toBe(5);
    expect(stats.evenCount).toBe(14);
    expect(stats.oddCount).toBe(6);
  });
});

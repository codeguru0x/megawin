import { describe, it, expect } from "vitest";
import { determineTier, buildPrizeAmountMap } from "@megawin/game-lotto535/rules/prize-tiers";
import {
  calculateDrawFinancials,
  isSplitCycleDraw,
  calculateSplitDistribution,
  DEFAULT_LOTTO535_CONFIG,
} from "@megawin/game-lotto535/rules/jackpot";
import { matchLine, matchLines } from "@megawin/game-lotto535/helpers/match-result";
import { expandBoardToLines } from "@megawin/game-lotto535/helpers/expand-lines";
import { calculateLineCount, combination } from "@megawin/game-lotto535/rules/play-types";
import { PrizeTier, PlayType } from "@megawin/game-lotto535/entities/enums";
import type { LineValue, MainTuple } from "@megawin/game-lotto535/entities/types";

// ─────────────────────────────────────────────
// determineTier
// ─────────────────────────────────────────────

describe("Lotto 5/35 – determineTier", () => {
  it.each([
    [5, true, PrizeTier.Jackpot],
    [5, false, PrizeTier.Tier1],
    [4, true, PrizeTier.Tier2],
    [4, false, PrizeTier.Tier3],
    [3, true, PrizeTier.Tier4],
    [3, false, PrizeTier.Tier5],
    [2, true, PrizeTier.Consolation],
    [1, true, PrizeTier.Consolation],
    [0, true, PrizeTier.Consolation],
  ])("mainMatch=%i, special=%s → %s", (mainMatchCount, specialMatched, expected) => {
    expect(determineTier(mainMatchCount, specialMatched)).toBe(expected);
  });

  it.each([
    [2, false],
    [1, false],
    [0, false],
  ])("mainMatch=%i, special=%s → null (không trúng)", (main, special) => {
    expect(determineTier(main, special)).toBeNull();
  });
});

// ─────────────────────────────────────────────
// buildPrizeAmountMap
// ─────────────────────────────────────────────

describe("Lotto 5/35 – buildPrizeAmountMap", () => {
  it("trả về map đầy đủ 7 tier với giá trị mặc định", () => {
    const map = buildPrizeAmountMap(DEFAULT_LOTTO535_CONFIG.defaultPrizes);
    expect(map.get(PrizeTier.Jackpot)).toBe(0);
    expect(map.get(PrizeTier.Tier1)).toBe(10_000_000);
    expect(map.get(PrizeTier.Tier2)).toBe(5_000_000);
    expect(map.get(PrizeTier.Tier3)).toBe(500_000);
    expect(map.get(PrizeTier.Tier4)).toBe(100_000);
    expect(map.get(PrizeTier.Tier5)).toBe(30_000);
    expect(map.get(PrizeTier.Consolation)).toBe(10_000);
  });

  it("override giá trị giải thưởng", () => {
    const map = buildPrizeAmountMap({
      ...DEFAULT_LOTTO535_CONFIG.defaultPrizes,
      tier1: 20_000_000,
    });
    expect(map.get(PrizeTier.Tier1)).toBe(20_000_000);
    expect(map.get(PrizeTier.Tier2)).toBe(5_000_000);
  });
});

// ─────────────────────────────────────────────
// matchLine
// ─────────────────────────────────────────────

describe("Lotto 5/35 – matchLine", () => {
  const drawResult = {
    winningMain: ["01", "05", "10", "20", "30"] as MainTuple,
    winningSpecial: "07",
  };

  it("5 chính + đặc biệt → Jackpot", () => {
    const line: LineValue = {
      main: ["01", "05", "10", "20", "30"] as MainTuple,
      special: "07",
    };
    const r = matchLine(line, drawResult);
    expect(r.tier).toBe(PrizeTier.Jackpot);
    expect(r.mainMatchCount).toBe(5);
    expect(r.specialMatched).toBe(true);
  });

  it("5 chính, không đặc biệt → Tier1", () => {
    const line: LineValue = {
      main: ["01", "05", "10", "20", "30"] as MainTuple,
      special: "03",
    };
    const r = matchLine(line, drawResult);
    expect(r.tier).toBe(PrizeTier.Tier1);
    expect(r.mainMatchCount).toBe(5);
    expect(r.specialMatched).toBe(false);
  });

  it("4 chính + đặc biệt → Tier2", () => {
    const line: LineValue = {
      main: ["01", "05", "10", "20", "35"] as MainTuple,
      special: "07",
    };
    const r = matchLine(line, drawResult);
    expect(r.tier).toBe(PrizeTier.Tier2);
    expect(r.mainMatchCount).toBe(4);
  });

  it("4 chính → Tier3", () => {
    const line: LineValue = {
      main: ["01", "05", "10", "20", "35"] as MainTuple,
      special: "03",
    };
    expect(matchLine(line, drawResult).tier).toBe(PrizeTier.Tier3);
  });

  it("3 chính + đặc biệt → Tier4", () => {
    const line: LineValue = {
      main: ["01", "05", "10", "33", "35"] as MainTuple,
      special: "07",
    };
    expect(matchLine(line, drawResult).tier).toBe(PrizeTier.Tier4);
  });

  it("3 chính → Tier5", () => {
    const line: LineValue = {
      main: ["01", "05", "10", "33", "35"] as MainTuple,
      special: "03",
    };
    expect(matchLine(line, drawResult).tier).toBe(PrizeTier.Tier5);
  });

  it("2 chính + đặc biệt → Consolation", () => {
    const line: LineValue = {
      main: ["01", "05", "33", "34", "35"] as MainTuple,
      special: "07",
    };
    expect(matchLine(line, drawResult).tier).toBe(PrizeTier.Consolation);
  });

  it("0 chính + đặc biệt → Consolation", () => {
    const line: LineValue = { main: ["02", "03", "04", "06", "08"] as MainTuple, special: "07" };
    expect(matchLine(line, drawResult).tier).toBe(PrizeTier.Consolation);
  });

  it("2 chính, không đặc biệt → null", () => {
    const line: LineValue = {
      main: ["01", "05", "33", "34", "35"] as MainTuple,
      special: "03",
    };
    expect(matchLine(line, drawResult).tier).toBeNull();
  });

  it("0 chính, 0 đặc biệt → null", () => {
    const line: LineValue = { main: ["02", "03", "04", "06", "08"] as MainTuple, special: "03" };
    expect(matchLine(line, drawResult).tier).toBeNull();
  });
});

// ─────────────────────────────────────────────
// matchLines (batch)
// ─────────────────────────────────────────────

describe("Lotto 5/35 – matchLines (batch)", () => {
  const drawResult = {
    winningMain: ["01", "05", "10", "20", "30"] as MainTuple,
    winningSpecial: "07",
  };

  it("nhiều lines cho kết quả aggregate đúng", () => {
    const lines: LineValue[] = [
      { main: ["01", "05", "10", "20", "30"] as MainTuple, special: "07" },
      { main: ["01", "05", "10", "20", "30"] as MainTuple, special: "03" },
      { main: ["01", "05", "10", "20", "35"] as MainTuple, special: "07" },
      { main: ["02", "03", "04", "06", "08"] as MainTuple, special: "03" },
    ];
    const r = matchLines(lines, drawResult);
    expect(r.totalLines).toBe(4);
    expect(r.winningLines).toBe(3);
    expect(r.tierCounts.get(PrizeTier.Jackpot)).toBe(1);
    expect(r.tierCounts.get(PrizeTier.Tier1)).toBe(1);
    expect(r.tierCounts.get(PrizeTier.Tier2)).toBe(1);
    expect(r.perLineResults).toHaveLength(4);
  });

  it("tất cả lines không trúng → winningLines = 0", () => {
    const lines: LineValue[] = [
      { main: ["02", "03", "04", "06", "08"] as MainTuple, special: "03" },
      { main: ["02", "03", "04", "06", "09"] as MainTuple, special: "03" },
    ];
    const r = matchLines(lines, drawResult);
    expect(r.winningLines).toBe(0);
    expect(r.tierCounts.size).toBe(0);
  });
});

// ─────────────────────────────────────────────
// expandBoardToLines & calculateLineCount
// ─────────────────────────────────────────────

describe("Lotto 5/35 – expandBoardToLines", () => {
  it("Standard → 1 line", () => {
    const lines = expandBoardToLines(PlayType.Standard, {
      mainNumbers: ["01", "02", "03", "04", "05"],
      specialNumbers: ["07"],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.main).toEqual(["01", "02", "03", "04", "05"]);
    expect(lines[0]!.special).toBe("07");
  });

  it("QuickPick → 1 line", () => {
    const lines = expandBoardToLines(PlayType.QuickPick, {
      mainNumbers: ["10", "20", "30", "01", "05"],
      specialNumbers: ["03"],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.main).toEqual(["01", "05", "10", "20", "30"]);
  });

  it("MainCover4 → 31 lines", () => {
    const lines = expandBoardToLines(PlayType.MainCover4, {
      mainNumbers: ["01", "02", "03", "04"],
      specialNumbers: ["07"],
    });
    expect(lines).toHaveLength(31);
    for (const line of lines) {
      expect(line.main).toHaveLength(5);
      expect(line.special).toBe("07");
      expect(
        line.main
          .slice(0, -1)
          .every((n: string) => ["01", "02", "03", "04"].some((m) => line.main.includes(m))),
      ).toBe(true);
    }
  });

  it("MainCover 6 → C(6,5)=6 lines", () => {
    const lines = expandBoardToLines(PlayType.MainCover, {
      mainNumbers: ["01", "02", "03", "04", "05", "06"],
      specialNumbers: ["07"],
    });
    expect(lines).toHaveLength(6);
  });

  it("MainCover 7 → C(7,5)=21 lines", () => {
    const lines = expandBoardToLines(PlayType.MainCover, {
      mainNumbers: ["01", "02", "03", "04", "05", "06", "07"],
      specialNumbers: ["01"],
    });
    expect(lines).toHaveLength(21);
  });

  it("SpecialCover → K lines", () => {
    const lines = expandBoardToLines(PlayType.SpecialCover, {
      mainNumbers: ["01", "02", "03", "04", "05"],
      specialNumbers: ["01", "02", "03"],
    });
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.special)).toEqual(["01", "02", "03"]);
    for (const line of lines) {
      expect(line.main).toEqual(["01", "02", "03", "04", "05"]);
    }
  });
});

describe("Lotto 5/35 – calculateLineCount", () => {
  it("Standard → 1", () => {
    expect(
      calculateLineCount(PlayType.Standard, {
        mainNumbers: ["01", "02", "03", "04", "05"],
        specialNumbers: ["01"],
      }),
    ).toBe(1);
  });

  it("MainCover4 → 31", () => {
    expect(
      calculateLineCount(PlayType.MainCover4, {
        mainNumbers: ["01", "02", "03", "04"],
        specialNumbers: ["01"],
      }),
    ).toBe(31);
  });

  it("MainCover 6 → 6", () => {
    expect(
      calculateLineCount(PlayType.MainCover, {
        mainNumbers: ["01", "02", "03", "04", "05", "06"],
        specialNumbers: ["01"],
      }),
    ).toBe(6);
  });

  it("MainCover 15 → 3003", () => {
    const mainNumbers = Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, "0"));
    expect(
      calculateLineCount(PlayType.MainCover, {
        mainNumbers,
        specialNumbers: ["01"],
      }),
    ).toBe(3003);
  });

  it("SpecialCover 5 → 5", () => {
    expect(
      calculateLineCount(PlayType.SpecialCover, {
        mainNumbers: ["01", "02", "03", "04", "05"],
        specialNumbers: ["01", "02", "03", "04", "05"],
      }),
    ).toBe(5);
  });

  it("combination(n,k) đúng", () => {
    expect(combination(6, 5)).toBe(6);
    expect(combination(7, 5)).toBe(21);
    expect(combination(8, 5)).toBe(56);
    expect(combination(10, 5)).toBe(252);
    expect(combination(15, 5)).toBe(3003);
  });
});

// ─────────────────────────────────────────────
// Tích hợp: Bao 6 (MainCover 6) – 5+ĐB → Jackpot + 5×Tier2
// ─────────────────────────────────────────────

describe("Lotto 5/35 – Tích hợp Bao 6", () => {
  it("Bao 6: 5 số winning + 1 dư, trúng ĐB → 1 Jackpot + 5 Tier2", () => {
    const drawResult = {
      winningMain: ["01", "02", "03", "04", "05"] as MainTuple,
      winningSpecial: "07",
    };
    const lines = expandBoardToLines(PlayType.MainCover, {
      mainNumbers: ["01", "02", "03", "04", "05", "06"],
      specialNumbers: ["07"],
    });
    expect(lines).toHaveLength(6);

    const result = matchLines(lines, drawResult);
    expect(result.tierCounts.get(PrizeTier.Jackpot)).toBe(1);
    expect(result.tierCounts.get(PrizeTier.Tier2)).toBe(5);
    expect(result.winningLines).toBe(6);
  });

  it("Bao 6: 5 số winning + 1 dư, không trúng ĐB → 1 Tier1 + 5 Tier3", () => {
    const drawResult = {
      winningMain: ["01", "02", "03", "04", "05"] as MainTuple,
      winningSpecial: "07",
    };
    const lines = expandBoardToLines(PlayType.MainCover, {
      mainNumbers: ["01", "02", "03", "04", "05", "06"],
      specialNumbers: ["08"],
    });
    const result = matchLines(lines, drawResult);
    expect(result.tierCounts.get(PrizeTier.Tier1)).toBe(1);
    expect(result.tierCounts.get(PrizeTier.Tier3)).toBe(5);
  });
});

// ─────────────────────────────────────────────
// calculateDrawFinancials
// ─────────────────────────────────────────────

describe("Lotto 5/35 – calculateDrawFinancials", () => {
  it("doanh thu bình thường → tính đúng contribution", () => {
    const result = calculateDrawFinancials({
      totalRevenue: 100_000_000,
      totalFixedPrizes: 5_000_000,
      tenantRevenues: [
        {
          tenantId: "t1",
          revenue: 60_000_000,
          commission: 12_000_000,
        },
        {
          tenantId: "t2",
          revenue: 40_000_000,
          commission: 8_000_000,
        },
      ],
      companyRate: 0.15,
    });

    expect(result.totalRevenue).toBe(100_000_000);
    expect(result.totalFixedPrizes).toBe(5_000_000);
    expect(result.totalAgentCommission).toBe(20_000_000);
    expect(result.companyTake).toBe(15_000_000);
    expect(result.actualCompanyTake).toBe(15_000_000);
    expect(result.jackpotContribution).toBe(60_000_000);
  });

  it("doanh thu thấp → actualCompanyTake bị giảm", () => {
    const result = calculateDrawFinancials({
      totalRevenue: 10_000_000,
      totalFixedPrizes: 8_000_000,
      tenantRevenues: [
        {
          tenantId: "t1",
          revenue: 10_000_000,
          commission: 2_000_000,
        },
      ],
      companyRate: 0.15,
    });

    const remain = 10_000_000 - 8_000_000 - 2_000_000;
    expect(result.actualCompanyTake).toBe(Math.min(1_500_000, Math.max(remain, 0)));
    expect(result.jackpotContribution).toBe(0);
  });

  it("doanh thu = 0 → tất cả = 0", () => {
    const result = calculateDrawFinancials({
      totalRevenue: 0,
      totalFixedPrizes: 0,
      tenantRevenues: [],
      companyRate: 0.15,
    });
    expect(result.jackpotContribution).toBe(0);
    expect(result.actualCompanyTake).toBe(0);
  });
});

// ─────────────────────────────────────────────
// isSplitCycleDraw
// ─────────────────────────────────────────────

describe("Lotto 5/35 – isSplitCycleDraw", () => {
  it("đủ điều kiện: JP >= threshold + no winner + drawNo=2", () => {
    expect(isSplitCycleDraw(12_000_000_000, 12_000_000_000, false, 2)).toBe(true);
  });

  it("JP < threshold → false", () => {
    expect(isSplitCycleDraw(11_000_000_000, 12_000_000_000, false, 2)).toBe(false);
  });

  it("có winner → false", () => {
    expect(isSplitCycleDraw(15_000_000_000, 12_000_000_000, true, 2)).toBe(false);
  });

  it("drawNo=1 (buổi sáng) → false", () => {
    expect(isSplitCycleDraw(15_000_000_000, 12_000_000_000, false, 1)).toBe(false);
  });
});

// ─────────────────────────────────────────────
// calculateSplitDistribution
// ─────────────────────────────────────────────

describe("Lotto 5/35 – calculateSplitDistribution", () => {
  const splitRatios = { tier1: 2, tier2: 1, tier3: 1, tier4: 1, tier5: 1 };

  it("tất cả tier có winner → chia đúng tỷ lệ", () => {
    const winnerCountPerTier = new Map<string, number>([
      [PrizeTier.Tier1, 1],
      [PrizeTier.Tier2, 2],
      [PrizeTier.Tier3, 3],
      [PrizeTier.Tier4, 5],
      [PrizeTier.Tier5, 10],
    ]);

    const result = calculateSplitDistribution({
      jackpotAmount: 12_000_000_000,
      splitRatios,
      winnerCountPerTier: winnerCountPerTier as any,
    });

    expect(result.details.size).toBe(5);
    const tier1Detail = result.details.get(PrizeTier.Tier1 as any)!;
    expect(tier1Detail.initialAmount).toBe(4_000_000_000);
    expect(tier1Detail.winnerCount).toBe(1);
  });

  it("một số tier không có winner → redistribute", () => {
    const winnerCountPerTier = new Map<string, number>([
      [PrizeTier.Tier1, 1],
      [PrizeTier.Tier3, 2],
    ]);

    const result = calculateSplitDistribution({
      jackpotAmount: 12_000_000_000,
      splitRatios,
      winnerCountPerTier: winnerCountPerTier as any,
    });

    expect(result.details.size).toBe(2);
    expect(result.details.has(PrizeTier.Tier2 as any)).toBe(false);
    const tier1Detail = result.details.get(PrizeTier.Tier1 as any)!;
    expect(tier1Detail.redistributedAmount).toBeGreaterThan(0);
  });

  it("không ai trúng → trả về rỗng", () => {
    const result = calculateSplitDistribution({
      jackpotAmount: 12_000_000_000,
      splitRatios,
      winnerCountPerTier: new Map() as any,
    });

    expect(result.details.size).toBe(0);
    expect(result.roundingRemainder).toBe(0);
  });

  it("chỉ 1 tier có winner → nhận toàn bộ jackpot", () => {
    const winnerCountPerTier = new Map<string, number>([[PrizeTier.Tier5, 5]]);

    const result = calculateSplitDistribution({
      jackpotAmount: 12_000_000_000,
      splitRatios,
      winnerCountPerTier: winnerCountPerTier as any,
    });

    expect(result.details.size).toBe(1);
    const detail = result.details.get(PrizeTier.Tier5 as any)!;
    const totalAllocated = detail.bonusPerWinner * detail.winnerCount;
    expect(totalAllocated).toBeLessThanOrEqual(12_000_000_000);
    expect(totalAllocated).toBeGreaterThan(12_000_000_000 - 5);
  });

  it("làm tròn xuống 5.000 cho tier không phải cao nhất", () => {
    const winnerCountPerTier = new Map<string, number>([
      [PrizeTier.Tier1, 1],
      [PrizeTier.Tier5, 3],
    ]);

    const result = calculateSplitDistribution({
      jackpotAmount: 12_000_000_000,
      splitRatios,
      winnerCountPerTier: winnerCountPerTier as any,
    });

    const tier5Bonus = result.bonusPerWinner.get(PrizeTier.Tier5 as any)!;
    expect(tier5Bonus % 5_000).toBe(0);
  });
});

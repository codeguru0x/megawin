/**
 * Power 6/55 – Unit Tests: Prize Tiers & Match Result
 *
 * Pure domain logic tests – NO database, NO external dependencies.
 *
 * Game rules:
 * - Chọn 6 số chính từ 1-55, bonus number quay từ 49 số còn lại.
 * - Jackpot1: 6/6 (tích luỹ, min 30 tỷ)
 * - Jackpot2: 5/6 + bonus (tích luỹ, min 3 tỷ)
 * - Tier1: 5/6 no bonus (40 triệu)
 * - Tier2: 4/6 (500.000)
 * - Tier3: 3/6 (50.000)
 *
 * Bonus number ∉ winning 6 → trùng 6/6 thì bonus KHÔNG THỂ match.
 */

import { PlayType, PrizeTier } from "@megawin/game-power655/entities/enums";
import type { LineValue } from "@megawin/game-power655/entities/types";
import { expandBoardToLines } from "@megawin/game-power655/helpers/expand-lines";
import type { DrawResultForMatch } from "@megawin/game-power655/helpers/match-result";
import { matchLine, matchLines } from "@megawin/game-power655/helpers/match-result";
import { determineTier, determineTiers, highestTier } from "@megawin/game-power655/rules/prize-tiers";
import { describe, expect, it } from "vitest";

// ─── Helpers ─────────────────────────────────────────────

function line(nums: string[]): LineValue {
  return { main: nums };
}

function drawResult(winning: string[], bonus: string): DrawResultForMatch {
  return { winningMain: winning, bonusNumber: bonus };
}

// ─── determineTier ───────────────────────────────────────

describe("Power 6/55 – determineTier: xác định hạng giải", () => {
  it("6/6 → jackpot1 (bất kể bonusMatched)", () => {
    expect(determineTier(6, false)).toBe(PrizeTier.Jackpot1);
    expect(determineTier(6, true)).toBe(PrizeTier.Jackpot1);
  });

  it("5/6 + bonus → jackpot2", () => {
    expect(determineTier(5, true)).toBe(PrizeTier.Jackpot2);
  });

  it("5/6 no bonus → tier1 (Giải Nhất)", () => {
    expect(determineTier(5, false)).toBe(PrizeTier.Tier1);
  });

  it("4/6 → tier2 (bất kể bonusMatched)", () => {
    expect(determineTier(4, false)).toBe(PrizeTier.Tier2);
    expect(determineTier(4, true)).toBe(PrizeTier.Tier2);
  });

  it("3/6 → tier3 (bất kể bonusMatched)", () => {
    expect(determineTier(3, false)).toBe(PrizeTier.Tier3);
    expect(determineTier(3, true)).toBe(PrizeTier.Tier3);
  });

  it("2/6 → null (không trúng)", () => {
    expect(determineTier(2, false)).toBeNull();
    expect(determineTier(2, true)).toBeNull();
  });

  it("1/6 → null", () => {
    expect(determineTier(1, false)).toBeNull();
    expect(determineTier(1, true)).toBeNull();
  });

  it("0/6 → null", () => {
    expect(determineTier(0, false)).toBeNull();
  });
});

// ─── determineTiers ──────────────────────────────────────

describe("Power 6/55 – determineTiers: trả về mảng hạng giải", () => {
  it("trúng giải → mảng 1 phần tử", () => {
    expect(determineTiers(6, false)).toEqual([PrizeTier.Jackpot1]);
    expect(determineTiers(5, true)).toEqual([PrizeTier.Jackpot2]);
    expect(determineTiers(5, false)).toEqual([PrizeTier.Tier1]);
    expect(determineTiers(4, false)).toEqual([PrizeTier.Tier2]);
    expect(determineTiers(3, false)).toEqual([PrizeTier.Tier3]);
  });

  it("không trúng → mảng rỗng", () => {
    expect(determineTiers(2, false)).toEqual([]);
    expect(determineTiers(1, true)).toEqual([]);
    expect(determineTiers(0, false)).toEqual([]);
  });
});

// ─── highestTier ─────────────────────────────────────────

describe("Power 6/55 – highestTier: chọn hạng cao nhất", () => {
  it("jackpot1 luôn ưu tiên cao nhất", () => {
    expect(highestTier([PrizeTier.Tier3, PrizeTier.Jackpot1, PrizeTier.Tier1])).toBe(PrizeTier.Jackpot1);
  });

  it("jackpot2 ưu tiên trên tier1", () => {
    expect(highestTier([PrizeTier.Tier2, PrizeTier.Jackpot2])).toBe(PrizeTier.Jackpot2);
  });

  it("tier1 > tier2 > tier3", () => {
    expect(highestTier([PrizeTier.Tier3, PrizeTier.Tier1])).toBe(PrizeTier.Tier1);
    expect(highestTier([PrizeTier.Tier3, PrizeTier.Tier2])).toBe(PrizeTier.Tier2);
  });

  it("mảng 1 phần tử → trả về chính nó", () => {
    expect(highestTier([PrizeTier.Tier3])).toBe(PrizeTier.Tier3);
  });

  it("mảng rỗng → null", () => {
    expect(highestTier([])).toBeNull();
  });
});

// ─── matchLine ───────────────────────────────────────────

describe("Power 6/55 – matchLine: so khớp 1 line với kết quả quay", () => {
  const winning: string[] = ["01", "02", "03", "04", "05", "06"];
  const bonus = "10";
  const result = drawResult(winning, bonus);

  it("6/6 → jackpot1", () => {
    const r = matchLine(line(["01", "02", "03", "04", "05", "06"]), result);
    expect(r.mainMatchCount).toBe(6);
    expect(r.tiers).toEqual([PrizeTier.Jackpot1]);
  });

  it("5/6 + bonus → jackpot2", () => {
    // Player chọn [01,02,03,04,05,10] – trùng 5 (01-05), miss 06, có bonus 10
    const r = matchLine(line(["01", "02", "03", "04", "05", "10"]), result);
    expect(r.mainMatchCount).toBe(5);
    expect(r.bonusMatched).toBe(true);
    expect(r.tiers).toEqual([PrizeTier.Jackpot2]);
  });

  it("5/6 no bonus → tier1 (Giải Nhất)", () => {
    // Player chọn [01,02,03,04,05,20] – trùng 5, miss 06, không có bonus 10
    const r = matchLine(line(["01", "02", "03", "04", "05", "20"]), result);
    expect(r.mainMatchCount).toBe(5);
    expect(r.bonusMatched).toBe(false);
    expect(r.tiers).toEqual([PrizeTier.Tier1]);
  });

  it("4/6 → tier2 (Giải Nhì)", () => {
    const r = matchLine(line(["01", "02", "03", "04", "20", "30"]), result);
    expect(r.mainMatchCount).toBe(4);
    expect(r.tiers).toEqual([PrizeTier.Tier2]);
  });

  it("3/6 → tier3 (Giải Ba)", () => {
    const r = matchLine(line(["01", "02", "03", "40", "41", "42"]), result);
    expect(r.mainMatchCount).toBe(3);
    expect(r.tiers).toEqual([PrizeTier.Tier3]);
  });

  it("2/6 → không trúng", () => {
    const r = matchLine(line(["01", "02", "40", "41", "42", "43"]), result);
    expect(r.mainMatchCount).toBe(2);
    expect(r.tiers).toEqual([]);
  });

  it("0/6 → không trúng", () => {
    const r = matchLine(line(["10", "20", "30", "40", "41", "42"]), result);
    expect(r.mainMatchCount).toBe(0);
    expect(r.tiers).toEqual([]);
  });
});

// ─── matchLine: bonus logic khi 6/6 ─────────────────────

describe("Power 6/55 – matchLine: bonus KHÔNG THỂ match khi 6/6", () => {
  it("6/6 match → bonusMatched luôn false (bonus ∉ winning 6)", () => {
    // Winning = [01,02,03,04,05,06], bonus = 10 (∉ winning)
    // Player chọn đúng 6/6 = [01,02,03,04,05,06] → không chứa 10
    const result = drawResult(["01", "02", "03", "04", "05", "06"], "10");
    const r = matchLine(line(["01", "02", "03", "04", "05", "06"]), result);

    expect(r.mainMatchCount).toBe(6);
    expect(r.bonusMatched).toBe(false);
    expect(r.tiers).toEqual([PrizeTier.Jackpot1]);
  });

  it("bonus number KHÔNG BAO GIỜ trùng winning 6 (invariant)", () => {
    // Nếu winning = [10,20,30,40,50,55] thì bonus phải ∈ {07..55} \ winning
    // Khi player match 6/6, cả 6 số của họ đều là winning → bonus nằm ngoài
    const winning: string[] = ["10", "20", "30", "40", "50", "55"];
    const bonus = "07"; // ∉ winning set

    const r = matchLine(line(["10", "20", "30", "40", "50", "55"]), drawResult(winning, bonus));
    expect(r.mainMatchCount).toBe(6);
    expect(r.bonusMatched).toBe(false);
  });

  it("5/6 thì bonus CÓ THỂ match (1 số sai có thể = bonus)", () => {
    // Player chọn [01,02,03,04,05,10] → trùng 5 (01-05), miss 06, bonus=10 ∈ selection
    const result = drawResult(["01", "02", "03", "04", "05", "06"], "10");
    const r = matchLine(line(["01", "02", "03", "04", "05", "10"]), result);

    expect(r.mainMatchCount).toBe(5);
    expect(r.bonusMatched).toBe(true);
    expect(r.tiers).toEqual([PrizeTier.Jackpot2]);
  });
});

// ─── matchLines (batch) ──────────────────────────────────

describe("Power 6/55 – matchLines: batch match nhiều lines", () => {
  const result = drawResult(["01", "02", "03", "04", "05", "06"], "10");

  it("batch mixed results: tổng hợp đúng tier counts", () => {
    const lines: LineValue[] = [
      line(["01", "02", "03", "04", "05", "06"]), // JP1
      line(["01", "02", "03", "04", "05", "10"]), // JP2 (bonus match)
      line(["01", "02", "03", "04", "05", "20"]), // Tier1
      line(["01", "02", "03", "04", "30", "40"]), // Tier2
      line(["01", "02", "03", "40", "41", "42"]), // Tier3
      line(["01", "02", "40", "41", "42", "43"]), // no win
    ];

    const batch = matchLines(lines, result);

    expect(batch.totalLines).toBe(6);
    expect(batch.winningLines).toBe(5);
    expect(batch.tierCounts.get(PrizeTier.Jackpot1)).toBe(1);
    expect(batch.tierCounts.get(PrizeTier.Jackpot2)).toBe(1);
    expect(batch.tierCounts.get(PrizeTier.Tier1)).toBe(1);
    expect(batch.tierCounts.get(PrizeTier.Tier2)).toBe(1);
    expect(batch.tierCounts.get(PrizeTier.Tier3)).toBe(1);
  });

  it("all losing → winningLines = 0, tierCounts empty", () => {
    const lines: LineValue[] = [line(["10", "20", "30", "40", "41", "42"]), line(["11", "21", "31", "41", "42", "43"])];

    const batch = matchLines(lines, result);
    expect(batch.totalLines).toBe(2);
    expect(batch.winningLines).toBe(0);
    expect(batch.tierCounts.size).toBe(0);
  });

  it("perLineResults giữ đúng thứ tự", () => {
    const lines: LineValue[] = [
      line(["01", "02", "03", "04", "05", "06"]), // JP1
      line(["01", "02", "40", "41", "42", "43"]), // no win
    ];

    const batch = matchLines(lines, result);
    expect(batch.perLineResults).toHaveLength(2);
    expect(batch.perLineResults[0]!.tiers).toEqual([PrizeTier.Jackpot1]);
    expect(batch.perLineResults[1]!.tiers).toEqual([]);
  });
});

// ─── Integration: Bao 7 scenario ────────────────────────

describe("Power 6/55 – Integration: Bao 7 (C(7,6) = 7 lines)", () => {
  it("7 số chứa cả 6 winning → 1 JP1 + 6 Tier1 (hoặc JP2)", () => {
    // Winning: [01,02,03,04,05,06], bonus = 10
    // Player chọn 7 số: [01,02,03,04,05,06,10] (chứa cả 6 winning + bonus)
    const winning: string[] = ["01", "02", "03", "04", "05", "06"];
    const bonus = "10";
    const result = drawResult(winning, bonus);

    const lines = expandBoardToLines(PlayType.Bao7, {
      mainNumbers: ["01", "02", "03", "04", "05", "06", "10"],
    });

    expect(lines).toHaveLength(7);

    const batch = matchLines(lines, result);
    expect(batch.totalLines).toBe(7);
    expect(batch.winningLines).toBe(7);

    // Exactly 1 line matches 6/6: [01,02,03,04,05,06] → JP1
    expect(batch.tierCounts.get(PrizeTier.Jackpot1)).toBe(1);

    // 6 lines match 5/6: each omits one of {01,02,03,04,05,06} and includes 10
    // Since 10 = bonus → all 6 are JP2
    expect(batch.tierCounts.get(PrizeTier.Jackpot2)).toBe(6);

    // No Tier1 because all 5/6 lines contain bonus number 10
    expect(batch.tierCounts.get(PrizeTier.Tier1)).toBeUndefined();
  });

  it("7 số chứa 6 winning + non-bonus → 1 JP1 + 6 Tier1", () => {
    // Winning: [01,02,03,04,05,06], bonus = 10
    // Player chọn: [01,02,03,04,05,06,20] – 20 ≠ bonus
    const winning: string[] = ["01", "02", "03", "04", "05", "06"];
    const bonus = "10";
    const result = drawResult(winning, bonus);

    const lines = expandBoardToLines(PlayType.Bao7, {
      mainNumbers: ["01", "02", "03", "04", "05", "06", "20"],
    });

    expect(lines).toHaveLength(7);

    const batch = matchLines(lines, result);
    expect(batch.totalLines).toBe(7);
    expect(batch.winningLines).toBe(7);

    expect(batch.tierCounts.get(PrizeTier.Jackpot1)).toBe(1);

    // 6 lines match 5/6 without bonus → Tier1
    expect(batch.tierCounts.get(PrizeTier.Tier1)).toBe(6);

    expect(batch.tierCounts.get(PrizeTier.Jackpot2)).toBeUndefined();
  });

  it("7 số chứa chỉ 5 winning → 0 JP, nhiều Tier1/Tier2", () => {
    // Winning: [01,02,03,04,05,06], bonus = 10
    // Player chọn: [01,02,03,04,05,20,30] – chỉ 5 winning, no bonus
    const result = drawResult(["01", "02", "03", "04", "05", "06"], "10");

    const lines = expandBoardToLines(PlayType.Bao7, {
      mainNumbers: ["01", "02", "03", "04", "05", "20", "30"],
    });

    expect(lines).toHaveLength(7);

    const batch = matchLines(lines, result);

    // No 6/6 match possible (missing 06)
    expect(batch.tierCounts.get(PrizeTier.Jackpot1)).toBeUndefined();

    // Lines with 5 of {01,02,03,04,05}: line that drops one of 01-05 and has both 20,30
    // → impossible, each line picks 6 from 7. Line picks that include all 5 winning:
    // [01,02,03,04,05,20] and [01,02,03,04,05,30] → 5/6 match each → Tier1
    // Lines that drop one of {01,02,03,04,05} and include both 20,30: C(5,4)=5 lines → 4/6
    expect(batch.tierCounts.get(PrizeTier.Tier1)).toBe(2);
    expect(batch.tierCounts.get(PrizeTier.Tier2)).toBe(5);
  });
});

/**
 * Mega 6/45 – Unit Tests: Prize Tiers & Match Result
 *
 * Pure domain logic tests – NO database, NO external dependencies.
 *
 * Game rules:
 * - Chọn 6 số chính từ 1-45, KHÔNG có số đặc biệt/bonus.
 * - Jackpot: 6/6 (tích luỹ, min 12 tỷ)
 * - Tier1: 5/6 (10 triệu)
 * - Tier2: 4/6 (300.000)
 * - Tier3: 3/6 (30.000)
 */

import { describe, it, expect } from "vitest";
import {
  determineTier,
  buildPrizeAmountMap,
  DEFAULT_PRIZE_TIER_RULES,
} from "@megawin/game-mega645/rules/prize-tiers";
import {
  matchLine,
  matchLines,
} from "@megawin/game-mega645/helpers/match-result";
import type { DrawResultForMatch } from "@megawin/game-mega645/helpers/match-result";
import { PrizeTier } from "@megawin/game-mega645/entities/enums";
import type { LineValue, MainTuple } from "@megawin/game-mega645/entities/types";
import { expandBoardToLines } from "@megawin/game-mega645/helpers/expand-lines";
import { PlayType } from "@megawin/game-mega645/entities/enums";

// ─── Helpers ─────────────────────────────────────────────

function line(nums: readonly [number, number, number, number, number, number]): LineValue {
  return { main: nums };
}

function drawResult(
  winning: readonly [number, number, number, number, number, number],
): DrawResultForMatch {
  return { winningMain: winning };
}

// ─── determineTier ───────────────────────────────────────

describe("Mega 6/45 – determineTier: xác định hạng giải", () => {
  it("6/6 → jackpot", () => {
    expect(determineTier(6)).toBe(PrizeTier.Jackpot);
  });

  it("5/6 → tier1 (Giải Nhất)", () => {
    expect(determineTier(5)).toBe(PrizeTier.Tier1);
  });

  it("4/6 → tier2 (Giải Nhì)", () => {
    expect(determineTier(4)).toBe(PrizeTier.Tier2);
  });

  it("3/6 → tier3 (Giải Ba)", () => {
    expect(determineTier(3)).toBe(PrizeTier.Tier3);
  });

  it("2/6 → null (không trúng)", () => {
    expect(determineTier(2)).toBeNull();
  });

  it("1/6 → null", () => {
    expect(determineTier(1)).toBeNull();
  });

  it("0/6 → null", () => {
    expect(determineTier(0)).toBeNull();
  });
});

// ─── buildPrizeAmountMap ─────────────────────────────────

describe("Mega 6/45 – buildPrizeAmountMap: bản đồ giải thưởng", () => {
  it("mặc định: jackpot=0, tier1=10M, tier2=300K, tier3=30K", () => {
    const map = buildPrizeAmountMap({
      tier1: 10_000_000,
      tier2: 300_000,
      tier3: 30_000,
    });

    expect(map.get(PrizeTier.Jackpot)).toBe(0);
    expect(map.get(PrizeTier.Tier1)).toBe(10_000_000);
    expect(map.get(PrizeTier.Tier2)).toBe(300_000);
    expect(map.get(PrizeTier.Tier3)).toBe(30_000);
  });

  it("custom amounts override defaults", () => {
    const map = buildPrizeAmountMap({
      tier1: 20_000_000,
      tier2: 500_000,
      tier3: 50_000,
    });

    expect(map.get(PrizeTier.Tier1)).toBe(20_000_000);
    expect(map.get(PrizeTier.Tier2)).toBe(500_000);
    expect(map.get(PrizeTier.Tier3)).toBe(50_000);
    expect(map.get(PrizeTier.Jackpot)).toBe(0);
  });

  it("map chứa đủ 4 tiers", () => {
    const map = buildPrizeAmountMap({
      tier1: 10_000_000,
      tier2: 300_000,
      tier3: 30_000,
    });

    expect(map.size).toBe(4);
    for (const rule of DEFAULT_PRIZE_TIER_RULES) {
      expect(map.has(rule.tier)).toBe(true);
    }
  });
});

// ─── matchLine ───────────────────────────────────────────

describe("Mega 6/45 – matchLine: so khớp 1 line với kết quả quay", () => {
  const winning: MainTuple = [1, 2, 3, 4, 5, 6];
  const result = drawResult(winning);

  it("6/6 → jackpot", () => {
    const r = matchLine(line([1, 2, 3, 4, 5, 6]), result);
    expect(r.mainMatchCount).toBe(6);
    expect(r.tier).toBe(PrizeTier.Jackpot);
  });

  it("5/6 → tier1 (Giải Nhất)", () => {
    const r = matchLine(line([1, 2, 3, 4, 5, 20]), result);
    expect(r.mainMatchCount).toBe(5);
    expect(r.tier).toBe(PrizeTier.Tier1);
  });

  it("4/6 → tier2 (Giải Nhì)", () => {
    const r = matchLine(line([1, 2, 3, 4, 30, 40]), result);
    expect(r.mainMatchCount).toBe(4);
    expect(r.tier).toBe(PrizeTier.Tier2);
  });

  it("3/6 → tier3 (Giải Ba)", () => {
    const r = matchLine(line([1, 2, 3, 40, 41, 42]), result);
    expect(r.mainMatchCount).toBe(3);
    expect(r.tier).toBe(PrizeTier.Tier3);
  });

  it("2/6 → null (không trúng)", () => {
    const r = matchLine(line([1, 2, 40, 41, 42, 43]), result);
    expect(r.mainMatchCount).toBe(2);
    expect(r.tier).toBeNull();
  });

  it("0/6 → null", () => {
    const r = matchLine(line([10, 20, 30, 40, 41, 42]), result);
    expect(r.mainMatchCount).toBe(0);
    expect(r.tier).toBeNull();
  });

  it("thứ tự số không ảnh hưởng kết quả", () => {
    const r = matchLine(line([6, 5, 4, 3, 2, 1]), result);
    expect(r.mainMatchCount).toBe(6);
    expect(r.tier).toBe(PrizeTier.Jackpot);
  });
});

// ─── matchLines (batch) ──────────────────────────────────

describe("Mega 6/45 – matchLines: batch match nhiều lines", () => {
  const result = drawResult([1, 2, 3, 4, 5, 6]);

  it("batch mixed results: tổng hợp đúng tier counts", () => {
    const lines: LineValue[] = [
      line([1, 2, 3, 4, 5, 6]),    // Jackpot
      line([1, 2, 3, 4, 5, 20]),   // Tier1
      line([1, 2, 3, 4, 30, 40]),  // Tier2
      line([1, 2, 3, 40, 41, 42]), // Tier3
      line([1, 2, 40, 41, 42, 43]),// no win
    ];

    const batch = matchLines(lines, result);

    expect(batch.totalLines).toBe(5);
    expect(batch.winningLines).toBe(4);
    expect(batch.tierCounts.get(PrizeTier.Jackpot)).toBe(1);
    expect(batch.tierCounts.get(PrizeTier.Tier1)).toBe(1);
    expect(batch.tierCounts.get(PrizeTier.Tier2)).toBe(1);
    expect(batch.tierCounts.get(PrizeTier.Tier3)).toBe(1);
  });

  it("all losing → winningLines = 0, tierCounts empty", () => {
    const lines: LineValue[] = [
      line([10, 20, 30, 40, 41, 42]),
      line([11, 21, 31, 41, 42, 43]),
    ];

    const batch = matchLines(lines, result);
    expect(batch.totalLines).toBe(2);
    expect(batch.winningLines).toBe(0);
    expect(batch.tierCounts.size).toBe(0);
  });

  it("perLineResults giữ đúng thứ tự", () => {
    const lines: LineValue[] = [
      line([1, 2, 3, 4, 5, 6]),     // Jackpot
      line([10, 20, 30, 40, 41, 42]),// no win
    ];

    const batch = matchLines(lines, result);
    expect(batch.perLineResults).toHaveLength(2);
    expect(batch.perLineResults[0]!.tier).toBe(PrizeTier.Jackpot);
    expect(batch.perLineResults[1]!.tier).toBeNull();
  });

  it("nhiều lines cùng tier → đếm đúng", () => {
    const lines: LineValue[] = [
      line([1, 2, 3, 40, 41, 42]), // Tier3
      line([1, 2, 3, 43, 44, 45]), // Tier3
      line([1, 2, 3, 7, 8, 9]),    // Tier3
    ];

    const batch = matchLines(lines, result);
    expect(batch.winningLines).toBe(3);
    expect(batch.tierCounts.get(PrizeTier.Tier3)).toBe(3);
  });
});

// ─── Integration: Bao 7 scenario ────────────────────────

describe("Mega 6/45 – Integration: Bao 7 (C(7,6) = 7 lines)", () => {
  it("7 số chứa cả 6 winning → 1 Jackpot + 6 Tier1", () => {
    // Winning: [1,2,3,4,5,6]
    // Player chọn 7 số: [1,2,3,4,5,6,10]
    const result = drawResult([1, 2, 3, 4, 5, 6]);

    const lines = expandBoardToLines(PlayType.Bao7, {
      mainNumbers: [1, 2, 3, 4, 5, 6, 10],
    });

    expect(lines).toHaveLength(7);

    const batch = matchLines(lines, result);
    expect(batch.totalLines).toBe(7);
    expect(batch.winningLines).toBe(7);

    // 1 line = [1,2,3,4,5,6] → 6/6 = Jackpot
    expect(batch.tierCounts.get(PrizeTier.Jackpot)).toBe(1);

    // 6 lines each omit one of {1..6} and include 10 → 5/6 = Tier1
    expect(batch.tierCounts.get(PrizeTier.Tier1)).toBe(6);
  });

  it("7 số chứa chỉ 5 winning → 0 Jackpot, 2 Tier1, 5 Tier2", () => {
    // Winning: [1,2,3,4,5,6]
    // Player chọn: [1,2,3,4,5,20,30] – chỉ 5 winning
    const result = drawResult([1, 2, 3, 4, 5, 6]);

    const lines = expandBoardToLines(PlayType.Bao7, {
      mainNumbers: [1, 2, 3, 4, 5, 20, 30],
    });

    expect(lines).toHaveLength(7);

    const batch = matchLines(lines, result);

    expect(batch.tierCounts.get(PrizeTier.Jackpot)).toBeUndefined();

    // Lines containing all 5 winning + one of {20,30}: 2 lines → 5/6 = Tier1
    expect(batch.tierCounts.get(PrizeTier.Tier1)).toBe(2);

    // Lines dropping 1 winning and having both 20,30: C(5,4)=5 → 4/6 = Tier2
    expect(batch.tierCounts.get(PrizeTier.Tier2)).toBe(5);
  });
});

// ─── Integration: Bao 5 scenario ────────────────────────

describe("Mega 6/45 – Integration: Bao 5 (40 lines)", () => {
  it("bao5 expand ra 40 lines (5 số chọn + 40 số bổ sung)", () => {
    const lines = expandBoardToLines(PlayType.Bao5, {
      mainNumbers: [1, 2, 3, 4, 5],
    });

    expect(lines).toHaveLength(40);

    // Mỗi line chứa 5 số gốc + 1 số bổ sung từ {6..45}
    for (const l of lines) {
      expect(l.main).toHaveLength(6);
      const nums = [...l.main];
      // Phải chứa cả 5 số gốc
      expect(nums).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
    }
  });

  it("bao5 chọn 5 trong 6 winning → 1 Jackpot + 39 Tier1", () => {
    // Winning: [1,2,3,4,5,6]
    // Player chọn bao5: [1,2,3,4,5] → expand 40 lines
    // Line [1,2,3,4,5,6] → 6/6 = Jackpot (khi bổ sung đúng số 6)
    // Remaining 39 lines: [1,2,3,4,5,x] x∈{7..45} → 5/6 = Tier1
    const result = drawResult([1, 2, 3, 4, 5, 6]);

    const lines = expandBoardToLines(PlayType.Bao5, {
      mainNumbers: [1, 2, 3, 4, 5],
    });

    const batch = matchLines(lines, result);

    expect(batch.totalLines).toBe(40);
    expect(batch.winningLines).toBe(40);

    expect(batch.tierCounts.get(PrizeTier.Jackpot)).toBe(1);
    expect(batch.tierCounts.get(PrizeTier.Tier1)).toBe(39);
  });

  it("bao5 chọn 4 trong 6 winning → 0 Jackpot, 1 Tier1, 39 Tier2", () => {
    // Winning: [1,2,3,4,5,6]
    // Player chọn bao5: [1,2,3,4,10] → expand 40 lines
    // Each line = [1,2,3,4,10,x]
    // Line [1,2,3,4,10,5] → 5/6 (miss 6) = Tier1 (when x=5)
    // Line [1,2,3,4,10,6] → 5/6 (miss 5) = Tier1 (when x=6)
    // Wait: 4 winning in chosen (1,2,3,4), x adds one more
    // If x=5 → match 5/6 = Tier1
    // If x=6 → match 5/6 = Tier1
    // If x∈{7..45}\{10} → match 4/6 = Tier2 (38 lines)
    const result = drawResult([1, 2, 3, 4, 5, 6]);

    const lines = expandBoardToLines(PlayType.Bao5, {
      mainNumbers: [1, 2, 3, 4, 10],
    });

    const batch = matchLines(lines, result);
    expect(batch.totalLines).toBe(40);

    expect(batch.tierCounts.get(PrizeTier.Jackpot)).toBeUndefined();
    expect(batch.tierCounts.get(PrizeTier.Tier1)).toBe(2);
    expect(batch.tierCounts.get(PrizeTier.Tier2)).toBe(38);
  });
});

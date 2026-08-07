/**
 * Max 3D Pro – Unit test: `matchPair`
 *
 * PURE — không DB, không cần quy tắc test staging chung.
 *
 * Trọng tâm: ordered pair (Giải ĐB đúng thứ tự vs Giải phụ ĐB ngược thứ tự) —
 * điểm chỉ có ở Max 3D Pro, và quy tắc duplicate đặc biệt (special + specialSub, KHÔNG × 2).
 */

import { describe, it, expect } from "vitest";
import { flattenDrawResult, matchPair } from "../../src/rules/prize-tiers";
import { PrizeTier } from "../../src/entities/enums";
import type { Max3dproDrawResult } from "../../src/entities/draw-result";
import type { PrizeAmounts } from "../../src/entities/types";

const drawResult: Max3dproDrawResult = {
  special: ["096", "389"],
  first: ["683", "525", "569", "598"],
  second: ["111", "222", "333", "444", "555", "666"],
  third: ["001", "002", "003", "004", "005", "006", "007", "008"],
};

const prizes: PrizeAmounts = {
  special: 2_000_000_000,
  specialSub: 400_000_000,
  first: 30_000_000,
  second: 10_000_000,
  third: 4_000_000,
  fourth: 1_000_000,
  fifth: 100_000,
  sixth: 40_000,
};

describe("matchPair", () => {
  const flat = flattenDrawResult(drawResult);

  it("Đúng logic — ĐÚNG thứ tự quay (096,389) → Giải ĐB (2 tỷ)", () => {
    const result = matchPair("096", "389", drawResult, prizes, flat);
    const tiers = result.wonTiers.map((t) => t.tier);
    expect(tiers).toContain(PrizeTier.Special);
    expect(result.wonTiers.find((t) => t.tier === PrizeTier.Special)?.winAmount).toBe(
      prizes.special,
    );
  });

  it("Đúng logic — NGƯỢC thứ tự quay (389,096) → Giải phụ ĐB (400 triệu), KHÔNG phải Giải ĐB", () => {
    const result = matchPair("389", "096", drawResult, prizes, flat);
    const tiers = result.wonTiers.map((t) => t.tier);
    expect(tiers).toContain(PrizeTier.SpecialSub);
    expect(tiers).not.toContain(PrizeTier.Special);
    expect(result.wonTiers.find((t) => t.tier === PrizeTier.SpecialSub)?.winAmount).toBe(
      prizes.specialSub,
    );
  });

  it("Đúng logic — duplicate trúng ĐB (096,096) với Special=[096,096] → winAmount = special + specialSub, KHÔNG phải special×2", () => {
    const dupResult: Max3dproDrawResult = { ...drawResult, special: ["096", "096"] };
    const dupFlat = flattenDrawResult(dupResult);
    const result = matchPair("096", "096", dupResult, prizes, dupFlat);

    const specialTier = result.wonTiers.find((t) => t.tier === PrizeTier.Special);
    expect(specialTier?.winAmount).toBe(prizes.special + prizes.specialSub);
    expect(specialTier?.winAmount).not.toBe(prizes.special * 2);
  });

  it("Đúng logic — duplicate trúng Giải Sáu (683,683) → winAmount = sixth × 2 (nhân đôi, không phải special+specialSub)", () => {
    const result = matchPair("683", "683", drawResult, prizes, flat);
    const sixthTier = result.wonTiers.find((t) => t.tier === PrizeTier.Sixth);
    expect(sixthTier?.winAmount).toBe(prizes.sixth * 2);
  });

  it("Logic ngược — không khớp Special theo cả 2 chiều (096,096) với Special=[096,389] → không trúng ĐB lẫn phụ ĐB", () => {
    const result = matchPair("096", "096", drawResult, prizes, flat);
    const tiers = result.wonTiers.map((t) => t.tier);
    expect(tiers).not.toContain(PrizeTier.Special);
    expect(tiers).not.toContain(PrizeTier.SpecialSub);
  });

  it("Logic ngược — 2 triplet hoàn toàn không khớp bất kỳ pool nào → wonTiers rỗng, winAmount = 0", () => {
    const result = matchPair("777", "888", drawResult, prizes, flat);
    expect(result.wonTiers).toEqual([]);
    expect(result.winAmount).toBe(0);
  });

  it("Đúng logic — GỘP GIẢI: 1 cặp trúng nhiều hạng đồng thời → winAmount = tổng tất cả wonTiers", () => {
    const result = matchPair("096", "683", drawResult, prizes, flat);
    const expectedSum = result.wonTiers.reduce((sum, t) => sum + t.winAmount, 0);
    expect(result.winAmount).toBe(expectedSum);
    expect(result.wonTiers.length).toBeGreaterThan(1);
  });
});

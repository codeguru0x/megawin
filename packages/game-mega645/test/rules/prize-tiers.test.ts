/**
 * Mega 6/45 – Unit test: `determineTier`
 *
 * PURE — không DB, không cần quy tắc test staging chung.
 *
 * Trọng tâm: mỗi line trúng hạng CAO NHẤT theo matchCount, đúng biên (boundary).
 */

import { describe, expect, it } from "vitest";

import { PrizeTier } from "../../src/entities/enums";
import { DEFAULT_PRIZE_TIER_RULES, determineTier, getPrizeTierRule } from "../../src/rules/prize-tiers";

describe("determineTier", () => {
  it("Đúng logic — trùng 6/6 số → Jackpot", () => {
    expect(determineTier(6)).toBe(PrizeTier.Jackpot);
  });

  it("Đúng logic — trùng 5/6 số → Giải Nhất", () => {
    expect(determineTier(5)).toBe(PrizeTier.Tier1);
  });

  it("Đúng logic — trùng 4/6 số → Giải Nhì", () => {
    expect(determineTier(4)).toBe(PrizeTier.Tier2);
  });

  it("Đúng logic — trùng 3/6 số → Giải Ba", () => {
    expect(determineTier(3)).toBe(PrizeTier.Tier3);
  });

  it("Logic ngược — trùng 2/6 số (dưới ngưỡng thấp nhất) → không trúng giải (null)", () => {
    expect(determineTier(2)).toBeNull();
  });

  it("Logic ngược — trùng 0 số → không trúng giải (null)", () => {
    expect(determineTier(0)).toBeNull();
  });

  it("Logic ngược — matchCount vượt 6 (dữ liệu bất thường) vẫn trả Jackpot, không throw", () => {
    expect(determineTier(7)).toBe(PrizeTier.Jackpot);
  });
});

describe("getPrizeTierRule", () => {
  it("Đúng logic — trả đúng rule ứng với từng tier", () => {
    for (const rule of DEFAULT_PRIZE_TIER_RULES) {
      expect(getPrizeTierRule(rule.tier)).toEqual(rule);
    }
  });

  it("Logic ngược — tier không tồn tại → undefined", () => {
    expect(getPrizeTierRule("khong-ton-tai" as PrizeTier)).toBeUndefined();
  });
});

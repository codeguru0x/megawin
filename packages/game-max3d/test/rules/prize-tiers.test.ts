/**
 * Max 3D – Unit test: `findAllTiersInResult` + `matchBasicStraight`
 *
 * PURE — không DB, không cần quy tắc test staging chung.
 *
 * Trọng tâm: gộp giải khi 1 triplet trùng NHIỀU hạng đồng thời (điểm đặc thù
 * Max 3D — khác các game khác chỉ lấy hạng cao nhất).
 */

import { describe, expect, it } from "vitest";

import type { Max3dDrawResult } from "../../src/entities/draw-result";
import { BasicPrizeTier } from "../../src/entities/enums";
import type { BasicPrizeAmounts } from "../../src/entities/types";
import { findAllTiersInResult, flattenDrawResult, matchBasicStraight } from "../../src/rules/prize-tiers";

const drawResult: Max3dDrawResult = {
  special: ["096", "389"],
  first: ["096", "683", "525", "569"],
  second: ["111", "222", "333", "444", "555", "666"],
  third: ["001", "002", "003", "004", "005", "006", "007", "008"],
};

const prizes: BasicPrizeAmounts = {
  special: 1_000_000,
  first: 350_000,
  second: 210_000,
  third: 100_000,
};

describe("findAllTiersInResult", () => {
  const { byTier } = flattenDrawResult(drawResult);

  it("Đúng logic — triplet chỉ khớp 1 hạng → trả đúng 1 tier", () => {
    expect(findAllTiersInResult("683", byTier)).toEqual([BasicPrizeTier.First]);
  });

  it("Đúng logic — triplet xuất hiện ở NHIỀU hạng (096: cả ĐB và Nhất) → trả TẤT CẢ tier khớp", () => {
    expect(findAllTiersInResult("096", byTier)).toEqual([BasicPrizeTier.Special, BasicPrizeTier.First]);
  });

  it("Logic ngược — triplet không khớp bất kỳ hạng nào → mảng rỗng", () => {
    expect(findAllTiersInResult("999", byTier)).toEqual([]);
  });
});

describe("matchBasicStraight", () => {
  const { byTier } = flattenDrawResult(drawResult);

  it("Đúng logic — triplet trùng nhiều hạng (096) → winAmount = tổng special + first", () => {
    const result = matchBasicStraight("096", byTier, prizes);
    expect(result.tiers).toEqual([BasicPrizeTier.Special, BasicPrizeTier.First]);
    expect(result.winAmount).toBe(prizes.special + prizes.first);
  });

  it("Đúng logic — triplet chỉ trùng 1 hạng (683) → winAmount = đúng giá trị hạng đó", () => {
    const result = matchBasicStraight("683", byTier, prizes);
    expect(result.tiers).toEqual([BasicPrizeTier.First]);
    expect(result.winAmount).toBe(prizes.first);
  });

  it("Logic ngược — triplet không trúng giải → winAmount = 0, tiers rỗng", () => {
    const result = matchBasicStraight("999", byTier, prizes);
    expect(result.tiers).toEqual([]);
    expect(result.winAmount).toBe(0);
  });
});

/**
 * Bingo 18 – Unit test: `lookupSingleNumPrize` + `lookupSumTotalPrize`
 *
 * PURE — không DB, không cần quy tắc test staging chung.
 */

import { describe, it, expect } from "vitest";
import {
  lookupSingleNumPrize,
  lookupSumTotalPrize,
  DEFAULT_SINGLE_NUM_PRIZES,
  DEFAULT_SUM_TOTAL_PRIZES,
} from "../../src/rules/prize-tables";

describe("lookupSingleNumPrize", () => {
  it("Đúng logic — quay có 1 số N → match1 (12.000)", () => {
    expect(lookupSingleNumPrize(1)).toBe(DEFAULT_SINGLE_NUM_PRIZES.match1);
  });

  it("Đúng logic — quay có 2 số N → match2 (20.000)", () => {
    expect(lookupSingleNumPrize(2)).toBe(DEFAULT_SINGLE_NUM_PRIZES.match2);
  });

  it("Đúng logic — quay có 3 số N → match3 (30.000)", () => {
    expect(lookupSingleNumPrize(3)).toBe(DEFAULT_SINGLE_NUM_PRIZES.match3);
  });

  it("Logic ngược — matchCount = 0 (không trúng) → 0", () => {
    expect(lookupSingleNumPrize(0)).toBe(0);
  });

  it("Logic ngược — dùng bảng prize custom (override default) → trả đúng giá trị custom", () => {
    const customPrizes = { match1: 1, match2: 2, match3: 3 };
    expect(lookupSingleNumPrize(2, customPrizes)).toBe(2);
  });
});

describe("lookupSumTotalPrize", () => {
  it("Đúng logic — tổng = 3 (biên dưới) → giải cao nhất 1.200.000", () => {
    expect(lookupSumTotalPrize(3)).toBe(1_200_000);
  });

  it("Đúng logic — tổng = 18 (biên trên) → giải cao nhất 1.200.000 (đối xứng với tổng=3)", () => {
    expect(lookupSumTotalPrize(18)).toBe(1_200_000);
  });

  it("Đúng logic — tổng = 10 và tổng = 11 (giữa bảng) → cùng giá trị 44.000", () => {
    expect(lookupSumTotalPrize(10)).toBe(44_000);
    expect(lookupSumTotalPrize(11)).toBe(44_000);
  });

  it("Đúng logic — bảng đối xứng quanh 10/11 (VD sum=7 và sum=14 cùng giá trị)", () => {
    expect(lookupSumTotalPrize(7)).toBe(lookupSumTotalPrize(14));
  });

  it("Logic ngược — tổng ngoài phạm vi hợp lệ (VD 2 hoặc 19) → 0, không throw", () => {
    expect(lookupSumTotalPrize(2)).toBe(0);
    expect(lookupSumTotalPrize(19)).toBe(0);
  });

  it("Logic ngược — dùng bảng prize custom → trả đúng giá trị custom, không fallback default", () => {
    const customPrizes = { ...DEFAULT_SUM_TOTAL_PRIZES, "3": 999 };
    expect(lookupSumTotalPrize(3, customPrizes)).toBe(999);
  });
});

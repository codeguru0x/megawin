/**
 * Keno – Unit test: `lookupBasicPrize`
 *
 * PURE — không DB, không cần quy tắc test staging chung.
 *
 * Pure function tra bảng — test tự build fixture nhỏ, KHÔNG dùng bảng thật
 * từ `DEFAULT_KENO_CONFIG` (đã có coverage riêng ở game-keno-application).
 */

import { describe, it, expect } from "vitest";
import { lookupBasicPrize } from "../../src/rules/prize-tables";

const fixturePrizeTable: Record<string, Record<string, number>> = {
  "10": { "10": 2_000_000_000, "9": 150_000, "0": 10_000 },
  "1": { "1": 20_000 },
};

describe("lookupBasicPrize", () => {
  it("Đúng logic — pickCount=10, matchCount=10 → 2 tỷ (giải cao nhất)", () => {
    expect(lookupBasicPrize(10, 10, fixturePrizeTable)).toBe(2_000_000_000);
  });

  it("Đúng logic — pickCount=1, matchCount=1 → 20.000", () => {
    expect(lookupBasicPrize(1, 1, fixturePrizeTable)).toBe(20_000);
  });

  it("Đúng logic — pickCount=10, matchCount=0 (trúng 0 số vẫn có giải hoàn tiền) → 10.000", () => {
    expect(lookupBasicPrize(10, 0, fixturePrizeTable)).toBe(10_000);
  });

  it("Logic ngược — matchCount không có trong bảng (VD 5) → 0", () => {
    expect(lookupBasicPrize(10, 5, fixturePrizeTable)).toBe(0);
  });

  it("Logic ngược — pickCount không tồn tại trong bảng → 0, không throw", () => {
    expect(lookupBasicPrize(7, 7, fixturePrizeTable)).toBe(0);
  });

  it("Logic ngược — prizeTable rỗng → luôn trả 0", () => {
    expect(lookupBasicPrize(10, 10, {})).toBe(0);
  });
});

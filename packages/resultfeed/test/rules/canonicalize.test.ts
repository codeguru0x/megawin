/**
 * ResultFeed – Unit test: canonicalize & hash
 *
 * PURE — không DB. Đây là phần DỄ SAI NHẤT của cả sản phẩm (01-data-model.plan.md §3) ⇒
 * test đủ 4 bất biến đã cam kết trong plan:
 * 1. `payoutHash` của cùng một tập số bất kể thứ tự phải bằng nhau.
 * 2. `displayHash` của `5,2,5` và `2,5,5` phải khác nhau.
 * 3. Cả hai hash đều gồm `gameKey` + `drawPeriod` ⇒ không thể so chéo game/chéo kỳ do tai nạn.
 * 4. Bingo18: `canonicalizeNumbers` trả đúng 3 phần tử (không dedupe).
 */

import { describe, expect, it } from "vitest";

import { ResultFeedGameKey } from "../../src/entities/enums";
import { canonicalizeNumbers, computeDisplayHash, computePayoutHash } from "../../src/rules/canonicalize";

describe("canonicalizeNumbers", () => {
  it("Đúng logic — Keno: sort tăng dần theo string zero-padded", () => {
    expect(canonicalizeNumbers(ResultFeedGameKey.Keno, ["78", "07", "14", "09"])).toEqual(["07", "09", "14", "78"]);
  });

  it("Đúng logic — Bingo18: sort như MULTISET, KHÔNG dedupe số trùng nhau (bất biến #4)", () => {
    const result = canonicalizeNumbers(ResultFeedGameKey.Bingo18, ["5", "2", "5"]);
    expect(result).toHaveLength(3);
    expect(result).toEqual(["2", "5", "5"]);
  });

  it("Logic ngược — mảng rỗng → trả mảng rỗng, không throw", () => {
    expect(canonicalizeNumbers(ResultFeedGameKey.Keno, [])).toEqual([]);
  });

  it("Logic ngược — KHÔNG mutate mảng input gốc", () => {
    const input = ["09", "07", "14"];
    canonicalizeNumbers(ResultFeedGameKey.Keno, input);
    expect(input).toEqual(["09", "07", "14"]);
  });

  it("Logic ngược — số chưa zero-pad sort SAI theo string (cảnh báo trong JSDoc, không phải bug của hàm)", () => {
    // "10" < "9" theo string compare — đây là lý do caller PHẢI normalize/zero-pad trước.
    expect(canonicalizeNumbers(ResultFeedGameKey.Keno, ["10", "9"])).toEqual(["10", "9"]);
  });
});

describe("computePayoutHash — bất biến #1: bất kể thứ tự, cùng tập số → cùng hash", () => {
  it("Đúng logic — Keno: đổi thứ tự numbersDisplay không đổi payoutHash", () => {
    const a = computePayoutHash(ResultFeedGameKey.Keno, "0293945", ["07", "78", "09", "14"]);
    const b = computePayoutHash(ResultFeedGameKey.Keno, "0293945", ["78", "14", "07", "09"]);
    expect(a).toBe(b);
  });

  it("Đúng logic — Bingo18: 5,2,5 và 2,5,5 (đã canonical) → payoutHash giống nhau", () => {
    const displayOrder = computePayoutHash(ResultFeedGameKey.Bingo18, "b-001", ["5", "2", "5"]);
    const alreadySorted = computePayoutHash(ResultFeedGameKey.Bingo18, "b-001", ["2", "5", "5"]);
    expect(displayOrder).toBe(alreadySorted);
  });

  it("Logic ngược — số khác nhau → payoutHash khác nhau", () => {
    const a = computePayoutHash(ResultFeedGameKey.Keno, "0293945", ["07", "09"]);
    const b = computePayoutHash(ResultFeedGameKey.Keno, "0293945", ["07", "10"]);
    expect(a).not.toBe(b);
  });

  it("Đúng logic — deterministic: gọi lại nhiều lần cùng input → cùng output", () => {
    const a = computePayoutHash(ResultFeedGameKey.Keno, "0293945", ["07", "09"]);
    const b = computePayoutHash(ResultFeedGameKey.Keno, "0293945", ["07", "09"]);
    expect(a).toBe(b);
  });
});

describe("computeDisplayHash — bất biến #2: thứ tự khác nhau → hash khác nhau", () => {
  it("Đúng logic — Bingo18: 5,2,5 và 2,5,5 phải KHÁC nhau (thứ tự quay có ý nghĩa)", () => {
    const displayOrder = computeDisplayHash(ResultFeedGameKey.Bingo18, "b-001", ["5", "2", "5"]);
    const sortedOrder = computeDisplayHash(ResultFeedGameKey.Bingo18, "b-001", ["2", "5", "5"]);
    expect(displayOrder).not.toBe(sortedOrder);
  });

  it("Đúng logic — cùng thứ tự, cùng số → cùng hash", () => {
    const a = computeDisplayHash(ResultFeedGameKey.Keno, "0293945", ["07", "09", "14"]);
    const b = computeDisplayHash(ResultFeedGameKey.Keno, "0293945", ["07", "09", "14"]);
    expect(a).toBe(b);
  });
});

describe("payoutHash & displayHash — bất biến #3: gồm gameKey + drawPeriod", () => {
  it("Đúng logic — cùng số, khác drawPeriod → payoutHash khác nhau", () => {
    const a = computePayoutHash(ResultFeedGameKey.Keno, "0293945", ["07", "09"]);
    const b = computePayoutHash(ResultFeedGameKey.Keno, "0293946", ["07", "09"]);
    expect(a).not.toBe(b);
  });

  it("Đúng logic — cùng số, cùng drawPeriod, khác gameKey → payoutHash khác nhau (chống so chéo game)", () => {
    const a = computePayoutHash(ResultFeedGameKey.Keno, "001", ["07", "09"]);
    const b = computePayoutHash(ResultFeedGameKey.Bingo18, "001", ["07", "09"]);
    expect(a).not.toBe(b);
  });

  it("Đúng logic — tương tự cho displayHash: khác drawPeriod → hash khác nhau", () => {
    const a = computeDisplayHash(ResultFeedGameKey.Keno, "0293945", ["07", "09"]);
    const b = computeDisplayHash(ResultFeedGameKey.Keno, "0293946", ["07", "09"]);
    expect(a).not.toBe(b);
  });

  it("Đúng logic — payoutHash và displayHash của cùng input là 2 giá trị KHÁC nhau (thuật toán khác nhau)", () => {
    const payout = computePayoutHash(ResultFeedGameKey.Bingo18, "b-001", ["5", "2", "5"]);
    const display = computeDisplayHash(ResultFeedGameKey.Bingo18, "b-001", ["5", "2", "5"]);
    expect(payout).not.toBe(display);
  });
});

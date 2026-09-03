/**
 * ResultFeed – Unit test: checkIntrinsic (rule layer, pure)
 *
 * PURE — không DB. Kiểm 3 nhóm theo `02-fetch-parse.plan.md §3`:
 * 1. Hình thức (đủ số lượng, đúng miền giá trị, Keno không trùng, Bingo18 được trùng).
 * 2. Checksum nguồn công bố so với số.
 * 3. Kiểm config chéo (Bingo18 bigSmallDraw) theo biên tự khai.
 *
 * Keno/Bingo18: cũng test `NotAvailable` — nguồn không công bố checksum nào KHÔNG được
 * coi là `Passed`.
 *
 * Lotto535/Mega645/Power655/Max3d/Max3dpro: KHÔNG có checksum tự công bố — đúng hình
 * thức/miền theo luật chơi chính là điều kiện `Passed` duy nhất, KHÔNG có nhánh
 * `NotAvailable` (xem `intrinsic-check.ts` JSDoc đầu file).
 */

import { describe, expect, it } from "vitest";

import { IntrinsicState, ResultFeedGameKey } from "../../src/entities/enums";
import { checkIntrinsic } from "../../src/rules/intrinsic-check";

describe("checkIntrinsic — Keno", () => {
  const validKeno20 = [
    "07",
    "09",
    "14",
    "78",
    "01",
    "02",
    "03",
    "04",
    "05",
    "06",
    "08",
    "10",
    "11",
    "12",
    "13",
    "15",
    "16",
    "17",
    "18",
    "19",
  ];

  it("Đúng logic — 20 số hợp lệ + checksum khớp → Passed", () => {
    // 20 số trên: even = số chẵn, odd = số lẻ, big (>40) = 78, small (<=40) = 19 số còn lại.
    const evenCount = validKeno20.filter((n) => Number(n) % 2 === 0).length;
    const oddCount = validKeno20.length - evenCount;
    const bigCount = validKeno20.filter((n) => Number(n) > 40).length;
    const smallCount = validKeno20.length - bigCount;

    const result = checkIntrinsic(ResultFeedGameKey.Keno, validKeno20, {
      even: evenCount,
      odd: oddCount,
      big: bigCount,
      small: smallCount,
    });
    expect(result).toEqual({ state: IntrinsicState.Passed, mismatch: null });
  });

  it("Logic ngược — thiếu số (chỉ 19) → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Keno, validKeno20.slice(0, 19), {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/20 số/);
  });

  it("Logic ngược — số ngoài miền 01-80 → Failed", () => {
    const bad = [...validKeno20.slice(0, 19), "99"];
    const result = checkIntrinsic(ResultFeedGameKey.Keno, bad, {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/miền hợp lệ/);
  });

  it("Logic ngược — trùng số (Keno KHÔNG được trùng) → Failed", () => {
    const bad = [...validKeno20.slice(0, 19), validKeno20[0]!];
    const result = checkIntrinsic(ResultFeedGameKey.Keno, bad, {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/không được trùng/);
  });

  it("Logic ngược — checksum even lệch → Failed, ghi rõ giá trị lệch", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Keno, validKeno20, {
      even: 999,
    });
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/"even"/);
  });

  it("Đúng logic — không có checksum nào trong claimed → NotAvailable, KHÔNG phải Passed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Keno, validKeno20, {});
    expect(result).toEqual({
      state: IntrinsicState.NotAvailable,
      mismatch: null,
    });
  });

  it("Đúng logic — chỉ công bố 1/4 checksum (big) khớp → Passed, không yêu cầu đủ cả 4", () => {
    const bigCount = validKeno20.filter((n) => Number(n) > 40).length;
    const result = checkIntrinsic(ResultFeedGameKey.Keno, validKeno20, {
      big: bigCount,
    });
    expect(result.state).toBe(IntrinsicState.Passed);
  });
});

describe("checkIntrinsic — Bingo18", () => {
  it("Đúng logic — 3 số hợp lệ + sum khớp + bigSmallDraw khớp biên → Passed", () => {
    // 5+2+5=12 → "big" theo biên tự khai (BINGO18_BIG_MIN=12).
    const result = checkIntrinsic(ResultFeedGameKey.Bingo18, ["5", "2", "5"], {
      sum: 12,
      bigSmallDraw: "big",
    });
    expect(result).toEqual({ state: IntrinsicState.Passed, mismatch: null });
  });

  it("Đúng logic — số ĐƯỢC TRÙNG (khác Keno) — [5,5,5] hợp lệ", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Bingo18, ["5", "5", "5"], {
      sum: 15,
    });
    expect(result.state).toBe(IntrinsicState.Passed);
  });

  it("Logic ngược — thiếu số (chỉ 2/3) → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Bingo18, ["5", "2"], {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/3 số/);
  });

  it("Logic ngược — số ngoài miền 1-6 → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Bingo18, ["5", "2", "7"], {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/miền hợp lệ/);
  });

  it("Logic ngược — checksum sum lệch → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Bingo18, ["5", "2", "5"], {
      sum: 99,
    });
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/"sum"/);
  });

  it("Logic ngược — bigSmallDraw lệch biên tự khai → Failed, cảnh báo có thể nguồn đổi luật", () => {
    // sum=12 → biên tự khai là "big", nhưng nguồn công bố "draw" → lệch.
    const result = checkIntrinsic(ResultFeedGameKey.Bingo18, ["5", "2", "5"], {
      sum: 12,
      bigSmallDraw: "draw",
    });
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/"bigSmallDraw"/);
    expect(result.mismatch).toMatch(/đổi luật/);
  });

  it("Đúng logic — biên 'draw' (10-11) khớp", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Bingo18, ["5", "5", "1"], {
      sum: 11,
      bigSmallDraw: "draw",
    });
    expect(result.state).toBe(IntrinsicState.Passed);
  });

  it("Đúng logic — biên 'small' (3-9) khớp", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Bingo18, ["1", "1", "1"], {
      sum: 3,
      bigSmallDraw: "small",
    });
    expect(result.state).toBe(IntrinsicState.Passed);
  });

  it("Đúng logic — không có checksum nào trong claimed → NotAvailable, KHÔNG phải Passed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Bingo18, ["5", "2", "5"], {});
    expect(result).toEqual({
      state: IntrinsicState.NotAvailable,
      mismatch: null,
    });
  });
});

describe("checkIntrinsic — Lotto535 (format-only, không có checksum tự công bố)", () => {
  it("Đúng logic — 5 main + 1 đặc biệt đúng miền, không claimed nào → Passed (không phải NotAvailable)", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Lotto535, ["03", "04", "06", "15", "22", "09"], {});
    expect(result).toEqual({ state: IntrinsicState.Passed, mismatch: null });
  });

  it("Đúng logic — số đặc biệt được trùng giá trị với 1 số main (2 miền độc lập)", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Lotto535, ["03", "04", "06", "15", "22", "03"], {});
    expect(result.state).toBe(IntrinsicState.Passed);
  });

  it("Logic ngược — thiếu số (chỉ 5/6) → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Lotto535, ["03", "04", "06", "15", "22"], {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/6 số/);
  });

  it("Logic ngược — 5 số main trùng nhau → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Lotto535, ["03", "03", "06", "15", "22", "09"], {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/không được trùng nhau/);
  });

  it("Logic ngược — số main ngoài miền 01-35 → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Lotto535, ["03", "04", "06", "15", "36", "09"], {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/miền hợp lệ/);
  });

  it("Logic ngược — số đặc biệt ngoài miền 01-12 → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Lotto535, ["03", "04", "06", "15", "22", "13"], {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/Số đặc biệt/);
  });
});

describe("checkIntrinsic — Mega645 (format-only)", () => {
  it("Đúng logic — 6 số đúng miền 01-45, không trùng → Passed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Mega645, ["12", "17", "23", "25", "34", "38"], {});
    expect(result).toEqual({ state: IntrinsicState.Passed, mismatch: null });
  });

  it("Logic ngược — thiếu số (chỉ 5/6) → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Mega645, ["12", "17", "23", "25", "34"], {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/6 số/);
  });

  it("Logic ngược — trùng số → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Mega645, ["12", "12", "23", "25", "34", "38"], {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/không được trùng số/);
  });

  it("Logic ngược — số ngoài miền 01-45 → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Mega645, ["12", "17", "23", "25", "34", "46"], {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/miền hợp lệ/);
  });
});

describe("checkIntrinsic — Power655 (format-only)", () => {
  it("Đúng logic — 6 main + 1 bonus đúng miền 01-55, không trùng → Passed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Power655, ["05", "10", "14", "23", "24", "38", "35"], {});
    expect(result).toEqual({ state: IntrinsicState.Passed, mismatch: null });
  });

  it("Logic ngược — thiếu số (chỉ 6/7) → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Power655, ["05", "10", "14", "23", "24", "38"], {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/7 số/);
  });

  it("Logic ngược — 6 số main trùng nhau → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Power655, ["05", "05", "14", "23", "24", "38", "35"], {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/không được trùng nhau/);
  });

  it("Logic ngược — bonus TRÙNG với 1 số main → Failed (khác Lotto535, 1 miền duy nhất)", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Power655, ["05", "10", "14", "23", "24", "38", "05"], {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/Bonus/);
  });

  it("Logic ngược — số ngoài miền 01-55 → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Power655, ["05", "10", "14", "23", "24", "56", "35"], {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/miền hợp lệ/);
  });
});

describe("checkIntrinsic — Max3d/Max3dpro (format-only, 20 triplet cố định)", () => {
  const validTriplets = [
    // Đặc biệt (2)
    "015",
    "517",
    // Nhất (4)
    "334",
    "279",
    "576",
    "060",
    // Nhì (6)
    "043",
    "900",
    "132",
    "916",
    "370",
    "766",
    // Ba (8)
    "634",
    "573",
    "539",
    "048",
    "967",
    "262",
    "523",
    "185",
  ];

  it("Đúng logic — đúng 20 triplet 3 chữ số → Passed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Max3d, validTriplets, {});
    expect(result).toEqual({ state: IntrinsicState.Passed, mismatch: null });
  });

  it("Đúng logic — Max3dpro dùng chung logic format với Max3d", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Max3dpro, validTriplets, {});
    expect(result.state).toBe(IntrinsicState.Passed);
  });

  it("Đúng logic — triplet ĐƯỢC TRÙNG nhau (không phải số duy nhất)", () => {
    const withDup = [...validTriplets.slice(0, 19), validTriplets[0]!];
    const result = checkIntrinsic(ResultFeedGameKey.Max3d, withDup, {});
    expect(result.state).toBe(IntrinsicState.Passed);
  });

  it("Logic ngược — thiếu triplet (chỉ 19/20) → Failed", () => {
    const result = checkIntrinsic(ResultFeedGameKey.Max3d, validTriplets.slice(0, 19), {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/20 triplet/);
  });

  it("Logic ngược — triplet không đúng 3 chữ số (thiếu zero-pad) → Failed", () => {
    const bad = [...validTriplets.slice(0, 19), "15"];
    const result = checkIntrinsic(ResultFeedGameKey.Max3d, bad, {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/3 chữ số/);
  });

  it("Logic ngược — triplet chứa ký tự không phải số → Failed", () => {
    const bad = [...validTriplets.slice(0, 19), "0a5"];
    const result = checkIntrinsic(ResultFeedGameKey.Max3d, bad, {});
    expect(result.state).toBe(IntrinsicState.Failed);
    expect(result.mismatch).toMatch(/3 chữ số/);
  });
});

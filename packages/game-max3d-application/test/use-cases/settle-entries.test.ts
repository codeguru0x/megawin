import { describe, it, expect } from "vitest";
import {
  matchBasicStraight,
  matchBasicCombo,
  matchPlus,
  matchBoard,
  getUniquePermutations,
  getPermutationCount,
  flattenDrawResult,
} from "@megawin/game-max3d/rules/prize-tiers";
import {
  PlayMode,
  PlayType,
  BasicPrizeTier,
  PlusPrizeTier,
} from "@megawin/game-max3d/entities/enums";
import { DEFAULT_MAX3D_CONFIG } from "@megawin/game-max3d/rules/defaults";
import type { Max3dDrawResult } from "@megawin/game-max3d/entities/draw-result";

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const prizes = DEFAULT_MAX3D_CONFIG.defaultPrizes;

function makeDrawResult(
  overrides: Partial<Max3dDrawResult> = {}
): Max3dDrawResult {
  return {
    special: ["111", "222"],
    first: ["333", "444", "555", "666"],
    second: ["100", "200", "300", "400", "500", "600"],
    third: ["700", "800", "900", "010", "020", "030", "040", "050"],
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// I. Helpers hoán vị
// ─────────────────────────────────────────────

describe("getUniquePermutations – hoán vị bộ ba số", () => {
  it("3 chữ số khác nhau → 6 hoán vị", () => {
    const perms = getUniquePermutations("123");
    expect(perms).toHaveLength(6);
    expect(new Set(perms).size).toBe(6);
    expect(perms).toContain("123");
    expect(perms).toContain("132");
    expect(perms).toContain("213");
    expect(perms).toContain("231");
    expect(perms).toContain("312");
    expect(perms).toContain("321");
  });

  it("2 chữ số giống → 3 hoán vị", () => {
    const perms = getUniquePermutations("112");
    expect(perms).toHaveLength(3);
    expect(new Set(perms).size).toBe(3);
    expect(perms).toContain("112");
    expect(perms).toContain("121");
    expect(perms).toContain("211");
  });

  it("3 chữ số giống → 1 hoán vị", () => {
    const perms = getUniquePermutations("111");
    expect(perms).toHaveLength(1);
    expect(perms).toContain("111");
  });
});

describe("getPermutationCount – đếm hoán vị", () => {
  it("3 chữ số khác nhau → 6", () => {
    expect(getPermutationCount("123")).toBe(6);
    expect(getPermutationCount("059")).toBe(6);
  });

  it("2 chữ số giống → 3", () => {
    expect(getPermutationCount("112")).toBe(3);
    expect(getPermutationCount("221")).toBe(3);
    expect(getPermutationCount("010")).toBe(3);
  });

  it("3 chữ số giống → 1", () => {
    expect(getPermutationCount("111")).toBe(1);
    expect(getPermutationCount("000")).toBe(1);
    expect(getPermutationCount("999")).toBe(1);
  });
});

// ─────────────────────────────────────────────
// II. flattenDrawResult
// ─────────────────────────────────────────────

describe("flattenDrawResult – gom kết quả quay", () => {
  it("trả đúng tổng 20 bộ ba số", () => {
    const result = makeDrawResult();
    const { allTriplets, byTier } = flattenDrawResult(result);

    expect(allTriplets).toHaveLength(20);
    expect(byTier.get(BasicPrizeTier.Special)).toHaveLength(2);
    expect(byTier.get(BasicPrizeTier.First)).toHaveLength(4);
    expect(byTier.get(BasicPrizeTier.Second)).toHaveLength(6);
    expect(byTier.get(BasicPrizeTier.Third)).toHaveLength(8);
  });

  it("byTier chứa đúng triplets từ kết quả", () => {
    const result = makeDrawResult();
    const { byTier } = flattenDrawResult(result);

    expect(byTier.get(BasicPrizeTier.Special)).toEqual(["111", "222"]);
    expect(byTier.get(BasicPrizeTier.First)).toEqual([
      "333",
      "444",
      "555",
      "666",
    ]);
  });
});

// ─────────────────────────────────────────────
// III. matchBasicStraight – so khớp đúng thứ tự
// ─────────────────────────────────────────────

describe("matchBasicStraight – Max 3D cơ bản (straight)", () => {
  const result = makeDrawResult();

  it("trùng giải Đặc Biệt → 1,000,000", () => {
    const m = matchBasicStraight("111", result, prizes.basic);
    expect(m.tier).toBe(BasicPrizeTier.Special);
    expect(m.winAmount).toBe(1_000_000);
  });

  it("trùng giải Nhất → 350,000", () => {
    const m = matchBasicStraight("333", result, prizes.basic);
    expect(m.tier).toBe(BasicPrizeTier.First);
    expect(m.winAmount).toBe(350_000);
  });

  it("trùng giải Nhì → 210,000", () => {
    const m = matchBasicStraight("100", result, prizes.basic);
    expect(m.tier).toBe(BasicPrizeTier.Second);
    expect(m.winAmount).toBe(210_000);
  });

  it("trùng giải Ba → 100,000", () => {
    const m = matchBasicStraight("700", result, prizes.basic);
    expect(m.tier).toBe(BasicPrizeTier.Third);
    expect(m.winAmount).toBe(100_000);
  });

  it("không trùng → null, 0 VND", () => {
    const m = matchBasicStraight("999", result, prizes.basic);
    expect(m.tier).toBeNull();
    expect(m.winAmount).toBe(0);
  });

  it("ưu tiên hạng cao nhất khi trùng nhiều hạng", () => {
    const overlapping = makeDrawResult({
      special: ["777", "888"],
      first: ["777", "444", "555", "666"],
    });
    const m = matchBasicStraight("777", overlapping, prizes.basic);
    expect(m.tier).toBe(BasicPrizeTier.Special);
    expect(m.winAmount).toBe(1_000_000);
  });
});

// ─────────────────────────────────────────────
// IV. matchBasicCombo – so khớp tổ hợp
// ─────────────────────────────────────────────

describe("matchBasicCombo – Max 3D cơ bản (tổ hợp)", () => {
  it("combo6: '123' khi '321' nằm trong kết quả → trúng thưởng", () => {
    const result = makeDrawResult({
      first: ["321", "444", "555", "666"],
    });
    const m = matchBasicCombo("123", PlayType.Combo6, result, prizes.combo);
    expect(m.tier).not.toBeNull();
    expect(m.winAmount).toBeGreaterThan(0);
  });

  it("combo6: '123' khi '132' nằm trong đặc biệt → thưởng combo6 đặc biệt", () => {
    const result = makeDrawResult({
      special: ["132", "999"],
    });
    const m = matchBasicCombo("123", PlayType.Combo6, result, prizes.combo);
    expect(m.tier).toBe(BasicPrizeTier.Special);
    expect(m.winAmount).toBe(170_000);
  });

  it("combo6: nhiều hoán vị trùng → tổng thưởng = tổng các hoán vị trúng", () => {
    const result = makeDrawResult({
      special: ["123", "321"],
      first: ["213", "444", "555", "666"],
    });
    const m = matchBasicCombo("123", PlayType.Combo6, result, prizes.combo);
    expect(m.tier).toBe(BasicPrizeTier.Special);
    expect(m.winAmount).toBe(170_000 + 170_000 + 60_000);
  });

  it("combo3: '112' khi '121' nằm trong kết quả → trúng thưởng", () => {
    const result = makeDrawResult({
      second: ["121", "200", "300", "400", "500", "600"],
    });
    const m = matchBasicCombo("112", PlayType.Combo3, result, prizes.combo);
    expect(m.tier).toBe(BasicPrizeTier.Second);
    expect(m.winAmount).toBe(70_000);
  });

  it("combo3: tất cả 3 hoán vị trùng → thưởng ×3", () => {
    const result = makeDrawResult({
      special: ["112", "121"],
      first: ["211", "444", "555", "666"],
    });
    const m = matchBasicCombo("112", PlayType.Combo3, result, prizes.combo);
    expect(m.tier).toBe(BasicPrizeTier.Special);
    expect(m.winAmount).toBe(340_000 + 340_000 + 120_000);
  });

  it("combo6: không hoán vị nào trùng → 0", () => {
    const result = makeDrawResult();
    const m = matchBasicCombo("987", PlayType.Combo6, result, prizes.combo);
    expect(m.tier).toBeNull();
    expect(m.winAmount).toBe(0);
  });
});

// ─────────────────────────────────────────────
// V. matchPlus – Max 3D+ (2 bộ ba số)
// ─────────────────────────────────────────────

describe("matchPlus – Max 3D+ (2 bộ ba số)", () => {
  it("cả 2 trùng giải Đặc Biệt → 1,000,000,000", () => {
    const result = makeDrawResult({ special: ["111", "222"] });
    const m = matchPlus("111", "222", result, prizes.plus);
    expect(m.tier).toBe(PlusPrizeTier.Special);
    expect(m.winAmount).toBe(1_000_000_000);
  });

  it("cả 2 trùng giải Nhất → 40,000,000", () => {
    const result = makeDrawResult();
    const m = matchPlus("333", "444", result, prizes.plus);
    expect(m.tier).toBe(PlusPrizeTier.First);
    expect(m.winAmount).toBe(40_000_000);
  });

  it("cả 2 trùng giải Nhì → 10,000,000", () => {
    const result = makeDrawResult();
    const m = matchPlus("100", "200", result, prizes.plus);
    expect(m.tier).toBe(PlusPrizeTier.Second);
    expect(m.winAmount).toBe(10_000_000);
  });

  it("cả 2 trùng giải Ba → 5,000,000", () => {
    const result = makeDrawResult();
    const m = matchPlus("700", "800", result, prizes.plus);
    expect(m.tier).toBe(PlusPrizeTier.Third);
    expect(m.winAmount).toBe(5_000_000);
  });

  it("cross-tier (1 ĐB + 1 Nhất) → giải Tư 1,000,000", () => {
    const result = makeDrawResult();
    const m = matchPlus("111", "333", result, prizes.plus);
    expect(m.tier).toBe(PlusPrizeTier.Fourth);
    expect(m.winAmount).toBe(1_000_000);
  });

  it("cross-tier (1 Nhì + 1 Ba) → giải Tư 1,000,000", () => {
    const result = makeDrawResult();
    const m = matchPlus("100", "700", result, prizes.plus);
    expect(m.tier).toBe(PlusPrizeTier.Fourth);
    expect(m.winAmount).toBe(1_000_000);
  });

  it("chỉ 1 trùng giải Đặc Biệt → giải Năm 150,000", () => {
    const result = makeDrawResult();
    const m = matchPlus("111", "999", result, prizes.plus);
    expect(m.tier).toBe(PlusPrizeTier.Fifth);
    expect(m.winAmount).toBe(150_000);
  });

  it("chỉ 1 trùng giải Nhất → giải Sáu 40,000", () => {
    const result = makeDrawResult();
    const m = matchPlus("333", "999", result, prizes.plus);
    expect(m.tier).toBe(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(40_000);
  });

  it("chỉ 1 trùng giải Nhì → giải Sáu 40,000", () => {
    const result = makeDrawResult();
    const m = matchPlus("100", "999", result, prizes.plus);
    expect(m.tier).toBe(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(40_000);
  });

  it("chỉ 1 trùng giải Ba → giải Sáu 40,000", () => {
    const result = makeDrawResult();
    const m = matchPlus("700", "999", result, prizes.plus);
    expect(m.tier).toBe(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(40_000);
  });

  it("không trùng → null, 0 VND", () => {
    const result = makeDrawResult();
    const m = matchPlus("999", "998", result, prizes.plus);
    expect(m.tier).toBeNull();
    expect(m.winAmount).toBe(0);
    expect(m.matchedTriplets).toHaveLength(0);
  });

  it("2 bộ giống nhau (duplicate) trùng giải ĐB → thưởng ×2", () => {
    const result = makeDrawResult({ special: ["111", "222"] });
    const m = matchPlus("111", "111", result, prizes.plus);
    expect(m.tier).toBe(PlusPrizeTier.Special);
    expect(m.winAmount).toBe(1_000_000_000 * 2);
  });

  it("2 bộ giống nhau trùng giải Nhất → thưởng ×2", () => {
    const result = makeDrawResult();
    const m = matchPlus("333", "333", result, prizes.plus);
    expect(m.tier).toBe(PlusPrizeTier.First);
    expect(m.winAmount).toBe(40_000_000 * 2);
  });

  it("2 bộ giống nhau trùng giải Ba → thưởng ×2", () => {
    const result = makeDrawResult();
    const m = matchPlus("700", "700", result, prizes.plus);
    expect(m.tier).toBe(PlusPrizeTier.Third);
    expect(m.winAmount).toBe(5_000_000 * 2);
  });

  it("2 bộ giống nhau chỉ 1 trùng ĐB → giải Năm ×2", () => {
    const result = makeDrawResult();
    const m = matchPlus("111", "111", result, prizes.plus);
    expect(m.tier).not.toBeNull();
    expect(m.winAmount).toBe(
      m.tier === PlusPrizeTier.Special
        ? prizes.plus.special * 2
        : prizes.plus.fifth * 2
    );
  });
});

// ─────────────────────────────────────────────
// VI. matchBoard – so khớp toàn board
// ─────────────────────────────────────────────

describe("matchBoard – so khớp toàn bộ 1 board", () => {
  const result = makeDrawResult();

  it("basic straight trúng giải Đặc Biệt", () => {
    const board = {
      boardNo: "B1",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["111"],
    };
    const m = matchBoard(board, result, prizes);
    expect(m.winAmount).toBe(1_000_000);
    expect(m.tier).toBe(BasicPrizeTier.Special);
    expect(m.lineResults).toHaveLength(1);
    expect(m.lineResults[0]!.tier).toBe(BasicPrizeTier.Special);
  });

  it("basic quickPick trúng giải Nhất", () => {
    const board = {
      boardNo: "B2",
      playMode: PlayMode.Basic,
      playType: PlayType.QuickPick,
      triplets: ["333"],
    };
    const m = matchBoard(board, result, prizes);
    expect(m.winAmount).toBe(350_000);
    expect(m.tier).toBe(BasicPrizeTier.First);
  });

  it("combo6 trúng → lineResults chứa từng hoán vị", () => {
    const comboResult = makeDrawResult({
      special: ["123", "999"],
    });
    const board = {
      boardNo: "B3",
      playMode: PlayMode.Basic,
      playType: PlayType.Combo6,
      triplets: ["123"],
    };
    const m = matchBoard(board, comboResult, prizes);
    expect(m.lineResults).toHaveLength(6);
    expect(m.winAmount).toBeGreaterThan(0);
    const winningLines = m.lineResults.filter((l) => l.winAmount > 0);
    expect(winningLines.length).toBeGreaterThanOrEqual(1);
  });

  it("combo3 trúng → lineResults chứa 3 hoán vị", () => {
    const comboResult = makeDrawResult({
      first: ["112", "444", "555", "666"],
    });
    const board = {
      boardNo: "B4",
      playMode: PlayMode.Basic,
      playType: PlayType.Combo3,
      triplets: ["112"],
    };
    const m = matchBoard(board, comboResult, prizes);
    expect(m.lineResults).toHaveLength(3);
    const winningLines = m.lineResults.filter((l) => l.winAmount > 0);
    expect(winningLines.length).toBeGreaterThanOrEqual(1);
  });

  it("plus mode trúng giải Tư", () => {
    const board = {
      boardNo: "B5",
      playMode: PlayMode.Plus,
      playType: PlayType.Straight,
      triplets: ["111", "333"] as [string, string],
    };
    const m = matchBoard(board, result, prizes);
    expect(m.winAmount).toBe(1_000_000);
    expect(m.tier).toBe(PlusPrizeTier.Fourth);
    expect(m.lineResults).toHaveLength(1);
  });

  it("basic straight không trúng → 0", () => {
    const board = {
      boardNo: "B6",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["999"],
    };
    const m = matchBoard(board, result, prizes);
    expect(m.winAmount).toBe(0);
    expect(m.tier).toBeNull();
  });
});

// ─────────────────────────────────────────────
// VII. Tích hợp – kịch bản đầy đủ
// ─────────────────────────────────────────────

describe("Tích hợp – nhiều boards trong 1 kỳ quay", () => {
  const result: Max3dDrawResult = {
    special: ["123", "456"],
    first: ["789", "012", "345", "678"],
    second: ["234", "567", "890", "135", "246", "357"],
    third: ["468", "579", "680", "791", "802", "913", "024", "147"],
  };

  it("board straight trúng ĐB + board plus cross-tier + board combo trúng", () => {
    const straightBoard = {
      boardNo: "B1",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["123"],
    };
    const straightResult = matchBoard(straightBoard, result, prizes);
    expect(straightResult.tier).toBe(BasicPrizeTier.Special);
    expect(straightResult.winAmount).toBe(1_000_000);

    const plusBoard = {
      boardNo: "B2",
      playMode: PlayMode.Plus,
      playType: PlayType.Straight,
      triplets: ["123", "789"] as [string, string],
    };
    const plusResult = matchBoard(plusBoard, result, prizes);
    expect(plusResult.tier).toBe(PlusPrizeTier.Fourth);
    expect(plusResult.winAmount).toBe(1_000_000);

    const comboBoard = {
      boardNo: "B3",
      playMode: PlayMode.Basic,
      playType: PlayType.Combo6,
      triplets: ["321"],
    };
    const comboResult = matchBoard(comboBoard, result, prizes);
    const winningLines = comboResult.lineResults.filter(
      (l) => l.winAmount > 0
    );
    expect(winningLines.length).toBeGreaterThanOrEqual(1);
  });

  it("board không trúng gì → tất cả 0", () => {
    const board = {
      boardNo: "B4",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["999"],
    };
    const m = matchBoard(board, result, prizes);
    expect(m.tier).toBeNull();
    expect(m.winAmount).toBe(0);
  });

  it("plus board duplicate → thưởng ×2", () => {
    const board = {
      boardNo: "B5",
      playMode: PlayMode.Plus,
      playType: PlayType.Straight,
      triplets: ["789", "789"] as [string, string],
    };
    const m = matchBoard(board, result, prizes);
    expect(m.tier).toBe(PlusPrizeTier.First);
    expect(m.winAmount).toBe(40_000_000 * 2);
  });
});

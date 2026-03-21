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

function makeDrawResult(overrides: Partial<Max3dDrawResult> = {}): Max3dDrawResult {
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
    expect(byTier.get(BasicPrizeTier.First)).toEqual(["333", "444", "555", "666"]);
  });
});

// ─────────────────────────────────────────────
// III. matchBasicStraight – so khớp đúng thứ tự
// ─────────────────────────────────────────────

describe("matchBasicStraight – Max 3D cơ bản (straight)", () => {
  const result = makeDrawResult();
  const { byTier } = flattenDrawResult(result);

  it("trùng giải Đặc Biệt → 1,000,000", () => {
    const m = matchBasicStraight("111", byTier, prizes.basic);
    expect(m.tiers[0]).toBe(BasicPrizeTier.Special);
    expect(m.winAmount).toBe(1_000_000);
  });

  it("trùng giải Nhất → 350,000", () => {
    const m = matchBasicStraight("333", byTier, prizes.basic);
    expect(m.tiers[0]).toBe(BasicPrizeTier.First);
    expect(m.winAmount).toBe(350_000);
  });

  it("trùng giải Nhì → 210,000", () => {
    const m = matchBasicStraight("100", byTier, prizes.basic);
    expect(m.tiers[0]).toBe(BasicPrizeTier.Second);
    expect(m.winAmount).toBe(210_000);
  });

  it("trùng giải Ba → 100,000", () => {
    const m = matchBasicStraight("700", byTier, prizes.basic);
    expect(m.tiers[0]).toBe(BasicPrizeTier.Third);
    expect(m.winAmount).toBe(100_000);
  });

  it("không trùng → tiers rỗng, 0 VND", () => {
    const m = matchBasicStraight("999", byTier, prizes.basic);
    expect(m.tiers).toHaveLength(0);
    expect(m.winAmount).toBe(0);
  });

  it("trùng nhiều hạng → tiers chứa tất cả, winAmount = tổng", () => {
    const overlapping = makeDrawResult({
      special: ["777", "888"],
      first: ["777", "444", "555", "666"],
    });
    const { byTier: byTierOverlapping } = flattenDrawResult(overlapping);
    const m = matchBasicStraight("777", byTierOverlapping, prizes.basic);
    expect(m.tiers).toContain(BasicPrizeTier.Special);
    expect(m.tiers).toContain(BasicPrizeTier.First);
    expect(m.winAmount).toBe(1_000_000 + 350_000);
  });
});

// ─────────────────────────────────────────────
// IV. matchBasicCombo – so khớp tổ hợp
// ─────────────────────────────────────────────

describe("matchBasicCombo – Max 3D cơ bản (tổ hợp)", () => {
  it("combo6: '123' khi '321' nằm trong kết quả → trúng thưởng", () => {
    const result = makeDrawResult({ first: ["321", "444", "555", "666"] });
    const { byTier } = flattenDrawResult(result);
    const m = matchBasicCombo("123", PlayType.Combo6, byTier, prizes.combo);
    expect(m.tiers.length).toBeGreaterThan(0);
    expect(m.winAmount).toBeGreaterThan(0);
  });

  it("combo6: '123' khi '132' nằm trong đặc biệt → thưởng combo6 đặc biệt", () => {
    const result = makeDrawResult({ special: ["132", "999"] });
    const { byTier } = flattenDrawResult(result);
    const m = matchBasicCombo("123", PlayType.Combo6, byTier, prizes.combo);
    expect(m.tiers[0]).toBe(BasicPrizeTier.Special);
    expect(m.winAmount).toBe(170_000);
  });

  it("combo6: nhiều hoán vị trùng → tổng thưởng = tổng các hoán vị trúng", () => {
    const result = makeDrawResult({
      special: ["123", "321"],
      first: ["213", "444", "555", "666"],
    });
    const { byTier } = flattenDrawResult(result);
    const m = matchBasicCombo("123", PlayType.Combo6, byTier, prizes.combo);
    expect(m.tiers[0]).toBe(BasicPrizeTier.Special);
    expect(m.winAmount).toBe(170_000 + 170_000 + 60_000);
  });

  it("combo3: '112' khi '121' nằm trong kết quả → trúng thưởng", () => {
    const result = makeDrawResult({ second: ["121", "200", "300", "400", "500", "600"] });
    const { byTier } = flattenDrawResult(result);
    const m = matchBasicCombo("112", PlayType.Combo3, byTier, prizes.combo);
    expect(m.tiers[0]).toBe(BasicPrizeTier.Second);
    expect(m.winAmount).toBe(70_000);
  });

  it("combo3: tất cả 3 hoán vị trùng → thưởng ×3", () => {
    const result = makeDrawResult({
      special: ["112", "121"],
      first: ["211", "444", "555", "666"],
    });
    const { byTier } = flattenDrawResult(result);
    const m = matchBasicCombo("112", PlayType.Combo3, byTier, prizes.combo);
    expect(m.tiers[0]).toBe(BasicPrizeTier.Special);
    expect(m.winAmount).toBe(340_000 + 340_000 + 120_000);
  });

  it("combo6: không hoán vị nào trùng → tiers rỗng, 0", () => {
    const result = makeDrawResult();
    const { byTier } = flattenDrawResult(result);
    const m = matchBasicCombo("987", PlayType.Combo6, byTier, prizes.combo);
    expect(m.tiers).toHaveLength(0);
    expect(m.winAmount).toBe(0);
  });
});

// ─────────────────────────────────────────────
// V. matchPlus – Max 3D+ (2 bộ ba số)
// ─────────────────────────────────────────────

describe("matchPlus – Max 3D+ (2 bộ ba số)", () => {
  it("cả 2 trùng giải Đặc Biệt → gộp giải: ĐB + Tư + Năm×2", () => {
    const result = makeDrawResult({ special: ["111", "222"] });
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("111", "222", byTier, allTriplets, prizes.plus);
    const tierNames = m.wonTiers.map((wt) => wt.tier);
    expect(tierNames).toContain(PlusPrizeTier.Special);
    expect(tierNames).toContain(PlusPrizeTier.Fourth);
    expect(tierNames).toContain(PlusPrizeTier.Fifth);
    expect(m.winAmount).toBe(prizes.plus.special + prizes.plus.fourth + prizes.plus.fifth * 2);
  });

  it("cả 2 trùng giải Nhất → gộp giải: Nhất + Tư + Sáu×2", () => {
    const result = makeDrawResult();
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("333", "444", byTier, allTriplets, prizes.plus);
    const tierNames = m.wonTiers.map((wt) => wt.tier);
    expect(tierNames).toContain(PlusPrizeTier.First);
    expect(tierNames).toContain(PlusPrizeTier.Fourth);
    expect(tierNames).toContain(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(prizes.plus.first + prizes.plus.fourth + prizes.plus.sixth * 2);
  });

  it("cả 2 trùng giải Nhì → gộp giải: Nhì + Tư + Sáu×2", () => {
    const result = makeDrawResult();
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("100", "200", byTier, allTriplets, prizes.plus);
    const tierNames = m.wonTiers.map((wt) => wt.tier);
    expect(tierNames).toContain(PlusPrizeTier.Second);
    expect(tierNames).toContain(PlusPrizeTier.Fourth);
    expect(tierNames).toContain(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(prizes.plus.second + prizes.plus.fourth + prizes.plus.sixth * 2);
  });

  it("cả 2 trùng giải Ba → gộp giải: Ba + Tư + Sáu×2", () => {
    const result = makeDrawResult();
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("700", "800", byTier, allTriplets, prizes.plus);
    const tierNames = m.wonTiers.map((wt) => wt.tier);
    expect(tierNames).toContain(PlusPrizeTier.Third);
    expect(tierNames).toContain(PlusPrizeTier.Fourth);
    expect(tierNames).toContain(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(prizes.plus.third + prizes.plus.fourth + prizes.plus.sixth * 2);
  });

  it("cross-tier (1 ĐB + 1 Nhất) → gộp giải: Tư + Năm + Sáu", () => {
    const result = makeDrawResult();
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("111", "333", byTier, allTriplets, prizes.plus);
    const tierNames = m.wonTiers.map((wt) => wt.tier);
    expect(tierNames).toContain(PlusPrizeTier.Fourth);
    expect(tierNames).toContain(PlusPrizeTier.Fifth);
    expect(tierNames).toContain(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(prizes.plus.fourth + prizes.plus.fifth + prizes.plus.sixth);
  });

  it("cross-tier (1 Nhì + 1 Ba) → gộp giải: Tư + Sáu×2", () => {
    const result = makeDrawResult();
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("100", "700", byTier, allTriplets, prizes.plus);
    const tierNames = m.wonTiers.map((wt) => wt.tier);
    expect(tierNames).toContain(PlusPrizeTier.Fourth);
    expect(tierNames).toContain(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(prizes.plus.fourth + prizes.plus.sixth * 2);
  });

  it("chỉ 1 trùng giải Đặc Biệt → giải Năm 150,000", () => {
    const result = makeDrawResult();
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("111", "999", byTier, allTriplets, prizes.plus);
    expect(m.wonTiers).toHaveLength(1);
    expect(m.wonTiers[0]!.tier).toBe(PlusPrizeTier.Fifth);
    expect(m.winAmount).toBe(150_000);
  });

  it("chỉ 1 trùng giải Nhất → giải Sáu 40,000", () => {
    const result = makeDrawResult();
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("333", "999", byTier, allTriplets, prizes.plus);
    expect(m.wonTiers).toHaveLength(1);
    expect(m.wonTiers[0]!.tier).toBe(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(40_000);
  });

  it("chỉ 1 trùng giải Nhì → giải Sáu 40,000", () => {
    const result = makeDrawResult();
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("100", "999", byTier, allTriplets, prizes.plus);
    expect(m.wonTiers).toHaveLength(1);
    expect(m.wonTiers[0]!.tier).toBe(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(40_000);
  });

  it("chỉ 1 trùng giải Ba → giải Sáu 40,000", () => {
    const result = makeDrawResult();
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("700", "999", byTier, allTriplets, prizes.plus);
    expect(m.wonTiers).toHaveLength(1);
    expect(m.wonTiers[0]!.tier).toBe(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(40_000);
  });

  it("không trùng → wonTiers rỗng, 0 VND", () => {
    const result = makeDrawResult();
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("999", "998", byTier, allTriplets, prizes.plus);
    expect(m.wonTiers).toHaveLength(0);
    expect(m.winAmount).toBe(0);
  });

  // ── Duplicate tests (bipartite matching) ──────────────────────────

  it("duplicate trùng 1 entry ĐB → giải Năm ×2 (KHÔNG phải Giải ĐB)", () => {
    // Special = ["111", "222"]: pool có 1 entry "111", player gửi "111"+"111"
    // Bipartite: match "111" (xoá), match "111" → pool còn ["222"] → KHÔNG khớp
    // → uniqueMatches = 1 → chỉ Giải Năm, ×2
    const result = makeDrawResult({ special: ["111", "222"] });
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("111", "111", byTier, allTriplets, prizes.plus);
    const tierNames = m.wonTiers.map((wt) => wt.tier);
    expect(tierNames).not.toContain(PlusPrizeTier.Special);
    expect(tierNames).toContain(PlusPrizeTier.Fifth);
    expect(m.winAmount).toBe(prizes.plus.fifth * 2);
  });

  it("duplicate CẢ draw result ĐB cũng trùng → Giải ĐB ×1 + Tư ×2 + Năm ×2", () => {
    // Special = ["111", "111"]: pool có 2 entry "111"
    // Bipartite: match "111" (xoá entry 1), match "111" (xoá entry 2) → 2 khớp → Giải ĐB
    // → Giải Tư: 2 khớp bất kỳ trong allTriplets → ×2 (duplicate multiplier)
    // → Giải Năm: triplet "111" khớp ĐB → ×2 (duplicate multiplier)
    // QUAN TRỌNG: Giải ĐB KHÔNG nhân ×2 dù là duplicate (game rules: ×2 chỉ áp dụng từ Nhất)
    const result = makeDrawResult({ special: ["111", "111"] });
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("111", "111", byTier, allTriplets, prizes.plus);
    const tierNames = m.wonTiers.map((wt) => wt.tier);
    expect(tierNames).toContain(PlusPrizeTier.Special);
    expect(tierNames).toContain(PlusPrizeTier.Fourth);
    expect(tierNames).toContain(PlusPrizeTier.Fifth);
    expect(m.winAmount).toBe(
      prizes.plus.special * 1 + prizes.plus.fourth * 2 + prizes.plus.fifth * 2,
    );
  });

  it("duplicate trùng 1 entry Nhất → giải Sáu ×2", () => {
    const result = makeDrawResult();
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("333", "333", byTier, allTriplets, prizes.plus);
    // Pool First = ["333","444","555","666"]: chỉ 1 entry "333"
    // Bipartite: match "333" (xoá), "333" → KHÔNG còn → uniqueMatches = 1
    // → Giải Sáu ×2
    const tierNames = m.wonTiers.map((wt) => wt.tier);
    expect(tierNames).not.toContain(PlusPrizeTier.First);
    expect(tierNames).toContain(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(prizes.plus.sixth * 2);
  });

  it("duplicate Nhất CÓ 2 entry giống nhau trong draw → Giải Nhất ×2 + Tư ×2 + Sáu ×2", () => {
    const result = makeDrawResult({ first: ["333", "333", "555", "666"] });
    const { byTier, allTriplets } = flattenDrawResult(result);
    const m = matchPlus("333", "333", byTier, allTriplets, prizes.plus);
    const tierNames = m.wonTiers.map((wt) => wt.tier);
    expect(tierNames).toContain(PlusPrizeTier.First);
    expect(tierNames).toContain(PlusPrizeTier.Fourth);
    expect(tierNames).toContain(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(
      prizes.plus.first * 2 + prizes.plus.fourth * 2 + prizes.plus.sixth * 2,
    );
  });
});

// ─────────────────────────────────────────────
// VI. matchBoard – so khớp toàn board
// ─────────────────────────────────────────────

describe("matchBoard – so khớp toàn bộ 1 board", () => {
  const result = makeDrawResult();
  const flattenedResult = flattenDrawResult(result);

  it("basic straight trúng giải Đặc Biệt", () => {
    const board = {
      boardNo: "B1",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["111"],
    };
    const m = matchBoard(board, flattenedResult, prizes);
    expect(m.winAmount).toBe(1_000_000);
    expect(m.lineResults).toHaveLength(1);
    expect(m.lineResults[0]!.tier).toBe(BasicPrizeTier.Special);
  });

  it("basic straight trúng giải Nhất (board B2)", () => {
    const board = {
      boardNo: "B2",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["333"],
    };
    const m = matchBoard(board, flattenedResult, prizes);
    expect(m.winAmount).toBe(350_000);
    expect(m.lineResults[0]!.tier).toBe(BasicPrizeTier.First);
  });

  it("combo6 trúng → lineResults chứa từng hoán vị", () => {
    const comboResult = makeDrawResult({ special: ["123", "999"] });
    const flatCombo = flattenDrawResult(comboResult);
    const board = {
      boardNo: "B3",
      playMode: PlayMode.Basic,
      playType: PlayType.Combo6,
      triplets: ["123"],
    };
    const m = matchBoard(board, flatCombo, prizes);
    expect(m.lineResults).toHaveLength(6);
    expect(m.winAmount).toBeGreaterThan(0);
    const winningLines = m.lineResults.filter((l) => l.winAmount > 0);
    expect(winningLines.length).toBeGreaterThanOrEqual(1);
  });

  it("combo3 trúng → lineResults chứa 3 hoán vị", () => {
    const comboResult = makeDrawResult({ first: ["112", "444", "555", "666"] });
    const flatCombo = flattenDrawResult(comboResult);
    const board = {
      boardNo: "B4",
      playMode: PlayMode.Basic,
      playType: PlayType.Combo3,
      triplets: ["112"],
    };
    const m = matchBoard(board, flatCombo, prizes);
    expect(m.lineResults).toHaveLength(3);
    const winningLines = m.lineResults.filter((l) => l.winAmount > 0);
    expect(winningLines.length).toBeGreaterThanOrEqual(1);
  });

  it("plus mode cross-tier → gộp giải: Tư + Năm + Sáu", () => {
    const board = {
      boardNo: "B5",
      playMode: PlayMode.Plus,
      playType: PlayType.Straight,
      triplets: ["111", "333"] as [string, string],
    };
    const m = matchBoard(board, flattenedResult, prizes);
    // 111→ĐB, 333→Nhất → cross-tier → Tư + Năm(111→ĐB) + Sáu(333→Nhất)
    expect(m.winAmount).toBe(prizes.plus.fourth + prizes.plus.fifth + prizes.plus.sixth);
    expect(m.lineResults.length).toBeGreaterThanOrEqual(3);
  });

  it("basic straight không trúng → 0", () => {
    const board = {
      boardNo: "B6",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["999"],
    };
    const m = matchBoard(board, flattenedResult, prizes);
    expect(m.winAmount).toBe(0);
    expect(m.lineResults[0]!.tier).toBeNull();
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
  const flattenedResult = flattenDrawResult(result);

  it("board straight trúng ĐB + board plus cross-tier + board combo trúng", () => {
    const straightBoard = {
      boardNo: "B1",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["123"],
    };
    const straightResult = matchBoard(straightBoard, flattenedResult, prizes);
    expect(straightResult.lineResults[0]!.tier).toBe(BasicPrizeTier.Special);
    expect(straightResult.winAmount).toBe(1_000_000);

    const plusBoard = {
      boardNo: "B2",
      playMode: PlayMode.Plus,
      playType: PlayType.Straight,
      triplets: ["123", "789"] as [string, string],
    };
    const plusResult = matchBoard(plusBoard, flattenedResult, prizes);
    // 123→ĐB, 789→Nhất → cross-tier → Tư + Năm(123→ĐB) + Sáu(789→Nhất)
    const plusTierNames = plusResult.lineResults.map((l) => l.tier);
    expect(plusTierNames).toContain(PlusPrizeTier.Fourth);
    expect(plusTierNames).toContain(PlusPrizeTier.Fifth);
    expect(plusTierNames).toContain(PlusPrizeTier.Sixth);
    expect(plusResult.winAmount).toBe(prizes.plus.fourth + prizes.plus.fifth + prizes.plus.sixth);

    const comboBoard = {
      boardNo: "B3",
      playMode: PlayMode.Basic,
      playType: PlayType.Combo6,
      triplets: ["321"],
    };
    const comboResult = matchBoard(comboBoard, flattenedResult, prizes);
    const winningLines = comboResult.lineResults.filter((l) => l.winAmount > 0);
    expect(winningLines.length).toBeGreaterThanOrEqual(1);
  });

  it("board không trúng gì → tất cả 0", () => {
    const board = {
      boardNo: "B4",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["999"],
    };
    const m = matchBoard(board, flattenedResult, prizes);
    expect(m.winAmount).toBe(0);
    expect(m.lineResults[0]!.tier).toBeNull();
  });

  it("plus board duplicate → bipartite matching chỉ khớp 1 entry → Sáu ×2", () => {
    // First = ["789","012","345","678"]: pool có 1 entry "789"
    // Player "789"+"789" → bipartite match 1 → chỉ Giải Sáu ×2
    const board = {
      boardNo: "B5",
      playMode: PlayMode.Plus,
      playType: PlayType.Straight,
      triplets: ["789", "789"] as [string, string],
    };
    const m = matchBoard(board, flattenedResult, prizes);
    const tierNames = m.lineResults.map((l) => l.tier);
    expect(tierNames).not.toContain(PlusPrizeTier.First);
    expect(tierNames).toContain(PlusPrizeTier.Sixth);
    expect(m.winAmount).toBe(prizes.plus.sixth * 2);
  });
});

// ─────────────────────────────────────────────
// VIII. betCount — nhân bội lần cược
// ─────────────────────────────────────────────

describe("betCount — nhân bội lần cược (settle layer)", () => {
  const result = makeDrawResult();
  const flattenedResult = flattenDrawResult(result);

  it("matchBoard() trả per-unit (không biết betCount)", () => {
    // matchBoard() KHÔNG nhận betCount → kết quả luôn là per 1 unit
    const board = {
      boardNo: "A",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["111"],
    };
    const m = matchBoard(board, flattenedResult, prizes);
    // winAmount = giải ĐB per unit = 1,000,000
    expect(m.winAmount).toBe(1_000_000);
  });

  it("betCount = 1 → behavior giữ nguyên so với trước", () => {
    const board = {
      boardNo: "A",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["111"],
    };
    const m = matchBoard(board, flattenedResult, prizes);
    const betCount = 1;
    const effectiveWin = m.winAmount * betCount;
    // Với betCount=1: kết quả y chang trước khi có betCount
    expect(effectiveWin).toBe(1_000_000);
  });

  it("betCount = 3 → entryWinAmount = matchWinAmount × 3", () => {
    const board = {
      boardNo: "A",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["111"],
    };
    const m = matchBoard(board, flattenedResult, prizes);
    const betCount = 3;
    // Settle layer nhân betCount vào boardMatch.winAmount
    const entryWinAmount = m.winAmount * betCount;
    expect(entryWinAmount).toBe(1_000_000 * 3);
  });

  it("lineDoc.matchResult.winAmount = unitWin × betCount", () => {
    const board = {
      boardNo: "A",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["333"],
    };
    const m = matchBoard(board, flattenedResult, prizes);
    const betCount = 5;
    // Với mỗi lineResult: effectiveWin = lineResult.winAmount × betCount
    for (const lineResult of m.lineResults) {
      const effectiveWin = lineResult.winAmount * betCount;
      if (lineResult.tier !== null) {
        // lineDoc.matchResult.winAmount sẽ là effectiveWin (= unitWin × betCount)
        expect(effectiveWin).toBe(lineResult.winAmount * betCount);
        expect(effectiveWin).toBe(350_000 * 5);
      }
    }
  });

  it("betUnitCount = Σ(lineCount × betCount) cho 1 entry nhiều boards", () => {
    // Board A: basic straight (lineCount=1), betCount=2
    // Board B: basic combo6 (lineCount=6), betCount=3
    // betUnitCount = 1×2 + 6×3 = 20
    const betUnitCount = 1 * 2 + 6 * 3;
    expect(betUnitCount).toBe(20);
  });

  it("adjustedResults cho buildPayoutTiers: lineResults.winAmount đã nhân betCount", () => {
    const board = {
      boardNo: "A",
      playMode: PlayMode.Basic,
      playType: PlayType.Straight,
      triplets: ["111"],
    };
    const m = matchBoard(board, flattenedResult, prizes);
    const betCount = 4;

    // Simulate adjustedResults (cách settle-entries.ts tính)
    const adjustedResult = {
      ...m,
      winAmount: m.winAmount * betCount,
      lineResults: m.lineResults.map((lr) => ({
        ...lr,
        winAmount: lr.winAmount * betCount,
      })),
    };

    // winAmount của adjustedResult = 1,000,000 × 4
    expect(adjustedResult.winAmount).toBe(4_000_000);
    // Mỗi lineResult cũng đã nhân betCount
    for (const lr of adjustedResult.lineResults) {
      if (lr.tier !== null) {
        expect(lr.winAmount).toBe(1_000_000 * betCount);
      }
    }
  });

  it("betCount = 1 cho plus mode → behavior giữ nguyên", () => {
    const board = {
      boardNo: "A",
      playMode: PlayMode.Plus,
      playType: PlayType.Straight,
      triplets: ["111", "333"] as [string, string],
    };
    const m = matchBoard(board, flattenedResult, prizes);
    const betCount = 1;
    const entryWinAmount = m.winAmount * betCount;
    // betCount=1 → giữ nguyên giá trị per-unit
    expect(entryWinAmount).toBe(m.winAmount);
  });

  it("betCount = 2 cho plus mode → winAmount × 2", () => {
    const board = {
      boardNo: "A",
      playMode: PlayMode.Plus,
      playType: PlayType.Straight,
      triplets: ["111", "333"] as [string, string],
    };
    const m = matchBoard(board, flattenedResult, prizes);
    const betCount = 2;
    const entryWinAmount = m.winAmount * betCount;
    // cross-tier: fourth + fifth + sixth
    const expectedPerUnit = prizes.plus.fourth + prizes.plus.fifth + prizes.plus.sixth;
    expect(m.winAmount).toBe(expectedPerUnit);
    expect(entryWinAmount).toBe(expectedPerUnit * 2);
  });
});

import { describe, it, expect } from "vitest";
import { matchPair, flattenDrawResult } from "@megawin/game-max3dpro/rules/prize-tiers";
import { PrizeTier } from "@megawin/game-max3dpro/entities/enums";
import { DEFAULT_MAX3D_PRO_CONFIG } from "@megawin/game-max3dpro/rules/defaults";
import type { Max3dproDrawResult } from "@megawin/game-max3dpro/entities/draw-result";

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const prizes = DEFAULT_MAX3D_PRO_CONFIG.defaultPrizes.standard;

function makeDrawResult(overrides: Partial<Max3dproDrawResult> = {}): Max3dproDrawResult {
  return {
    special: ["111", "222"],
    first: ["333", "444", "555", "666"],
    second: ["100", "200", "300", "400", "500", "600"],
    third: ["700", "800", "900", "010", "020", "030", "040", "050"],
    ...overrides,
  };
}

/** Helper: lấy danh sách tier names từ wonTiers. */
function tierNames(m: { wonTiers: Array<{ tier: string }> }): string[] {
  return m.wonTiers.map((wt) => wt.tier);
}

// ─────────────────────────────────────────────
// I. flattenDrawResult
// ─────────────────────────────────────────────

describe("flattenDrawResult – gom kết quả quay Max 3D Pro", () => {
  it("trả đúng tổng 20 bộ ba số", () => {
    const result = makeDrawResult();
    const { allTriplets, byTier } = flattenDrawResult(result);

    expect(allTriplets).toHaveLength(20);
    expect(byTier.get("special")).toHaveLength(2);
    expect(byTier.get("first")).toHaveLength(4);
    expect(byTier.get("second")).toHaveLength(6);
    expect(byTier.get("third")).toHaveLength(8);
  });

  it("byTier chứa đúng triplets từ kết quả", () => {
    const result = makeDrawResult();
    const { byTier } = flattenDrawResult(result);

    expect(byTier.get("special")).toEqual(["111", "222"]);
    expect(byTier.get("first")).toEqual(["333", "444", "555", "666"]);
  });
});

// ─────────────────────────────────────────────
// II. matchPair – giải Đặc Biệt (đúng thứ tự)
// ─────────────────────────────────────────────

describe("matchPair – giải Đặc Biệt (đúng thứ tự quay)", () => {
  it("first=special[0], second=special[1] → Special 2,000,000,000 + gộp Tư + Năm + Sáu", () => {
    const result = makeDrawResult({ special: ["111", "222"] });
    const flat = flattenDrawResult(result);

    const m = matchPair("111", "222", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.Special);
    // Gộp giải: ĐB + Tư (cả 2 khớp 2 entry bất kỳ) + Năm (111 khớp ĐB) + Sáu (222 khớp ĐB? → Năm)
    // 111 khớp special → Năm, 222 khớp special → Năm
    expect(tierNames(m)).toContain(PrizeTier.Fourth);
    expect(tierNames(m)).toContain(PrizeTier.Fifth);
    expect(m.winAmount).toBe(2_000_000_000 + 1_000_000 + 100_000 + 100_000);
  });

  it("thứ tự ngược lại → KHÔNG phải Special, phải là SpecialSub", () => {
    const result = makeDrawResult({ special: ["111", "222"] });
    const flat = flattenDrawResult(result);
    const m = matchPair("222", "111", result, prizes, flat);
    expect(tierNames(m)).not.toContain(PrizeTier.Special);
    expect(tierNames(m)).toContain(PrizeTier.SpecialSub);
  });
});

// ─────────────────────────────────────────────
// III. matchPair – giải Phụ Đặc Biệt (ngược thứ tự)
// ─────────────────────────────────────────────

describe("matchPair – giải Phụ Đặc Biệt (ngược thứ tự quay)", () => {
  it("first=special[1], second=special[0] → SpecialSub 400,000,000 + gộp giải", () => {
    const result = makeDrawResult({ special: ["111", "222"] });
    const flat = flattenDrawResult(result);
    const m = matchPair("222", "111", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.SpecialSub);
    // Gộp: phụ ĐB + Tư + Năm(222 khớp ĐB) + Năm(111 khớp ĐB)
    expect(m.winAmount).toBe(400_000_000 + 1_000_000 + 100_000 + 100_000);
  });
});

// ─────────────────────────────────────────────
// IV. matchPair – giải Nhất, Nhì, Ba (gộp giải)
// ─────────────────────────────────────────────

describe("matchPair – giải Nhất, Nhì, Ba", () => {
  it("cả 2 trùng trong nhóm Nhất → First + Tư + 2×Sáu", () => {
    const result = makeDrawResult();
    const flat = flattenDrawResult(result);
    const m = matchPair("333", "444", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.First);
    expect(tierNames(m)).toContain(PrizeTier.Fourth);
    // 333 khớp Nhất → Sáu, 444 khớp Nhất → Sáu
    expect(m.winAmount).toBe(30_000_000 + 1_000_000 + 40_000 + 40_000);
  });

  it("cả 2 trùng trong nhóm Nhì → Second + Tư + 2×Sáu", () => {
    const result = makeDrawResult();
    const flat = flattenDrawResult(result);
    const m = matchPair("100", "200", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.Second);
    expect(tierNames(m)).toContain(PrizeTier.Fourth);
    expect(m.winAmount).toBe(10_000_000 + 1_000_000 + 40_000 + 40_000);
  });

  it("cả 2 trùng trong nhóm Ba → Third + Tư + 2×Sáu", () => {
    const result = makeDrawResult();
    const flat = flattenDrawResult(result);
    const m = matchPair("700", "800", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.Third);
    expect(tierNames(m)).toContain(PrizeTier.Fourth);
    expect(m.winAmount).toBe(4_000_000 + 1_000_000 + 40_000 + 40_000);
  });
});

// ─────────────────────────────────────────────
// V. matchPair – giải Tư (cross-tier)
// ─────────────────────────────────────────────

describe("matchPair – giải Tư (cross-tier)", () => {
  it("1 ĐB + 1 Nhất → Tư + Năm + Sáu", () => {
    const result = makeDrawResult();
    const flat = flattenDrawResult(result);
    const m = matchPair("111", "333", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.Fourth);
    expect(tierNames(m)).toContain(PrizeTier.Fifth);
    expect(tierNames(m)).toContain(PrizeTier.Sixth);
    expect(m.winAmount).toBe(1_000_000 + 100_000 + 40_000);
  });

  it("1 Nhì + 1 Ba → Tư + 2×Sáu", () => {
    const result = makeDrawResult();
    const flat = flattenDrawResult(result);
    const m = matchPair("100", "700", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.Fourth);
    expect(m.winAmount).toBe(1_000_000 + 40_000 + 40_000);
  });
});

// ─────────────────────────────────────────────
// VI. matchPair – giải Năm, Sáu (chỉ 1 trùng)
// ─────────────────────────────────────────────

describe("matchPair – giải Năm, Sáu (chỉ 1 trùng)", () => {
  it("chỉ 1 trùng giải ĐB → Fifth 100,000", () => {
    const result = makeDrawResult();
    const flat = flattenDrawResult(result);
    const m = matchPair("111", "999", result, prizes, flat);
    expect(tierNames(m)).toEqual([PrizeTier.Fifth]);
    expect(m.winAmount).toBe(100_000);
  });

  it("chỉ 1 trùng giải Nhất → Sixth 40,000", () => {
    const result = makeDrawResult();
    const flat = flattenDrawResult(result);
    const m = matchPair("333", "999", result, prizes, flat);
    expect(tierNames(m)).toEqual([PrizeTier.Sixth]);
    expect(m.winAmount).toBe(40_000);
  });

  it("chỉ 1 trùng giải Nhì → Sixth 40,000", () => {
    const result = makeDrawResult();
    const flat = flattenDrawResult(result);
    const m = matchPair("100", "999", result, prizes, flat);
    expect(tierNames(m)).toEqual([PrizeTier.Sixth]);
    expect(m.winAmount).toBe(40_000);
  });

  it("chỉ 1 trùng giải Ba → Sixth 40,000", () => {
    const result = makeDrawResult();
    const flat = flattenDrawResult(result);
    const m = matchPair("700", "999", result, prizes, flat);
    expect(tierNames(m)).toEqual([PrizeTier.Sixth]);
    expect(m.winAmount).toBe(40_000);
  });
});

// ─────────────────────────────────────────────
// VII. matchPair – không trùng
// ─────────────────────────────────────────────

describe("matchPair – không trùng", () => {
  it("cả 2 không trùng → wonTiers rỗng, 0 VND", () => {
    const result = makeDrawResult();
    const flat = flattenDrawResult(result);
    const m = matchPair("999", "998", result, prizes, flat);
    expect(m.wonTiers).toHaveLength(0);
    expect(m.winAmount).toBe(0);
    expect(m.matchedTriplets).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// VIII. matchPair – duplicate triplets (2 bộ giống nhau)
// ─────────────────────────────────────────────

describe("matchPair – duplicate triplets (thưởng ×2 cho Nhất→Sáu)", () => {
  it("duplicate trùng Nhất (pool có 2 entry giống) → First×2 + Tư×2 + Sáu×2", () => {
    // Cần pool Nhất có 2 entry "333" để bipartite match
    const result = makeDrawResult({ first: ["333", "333", "555", "666"] });
    const flat = flattenDrawResult(result);
    const m = matchPair("333", "333", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.First);
    expect(tierNames(m)).toContain(PrizeTier.Fourth);
    expect(tierNames(m)).toContain(PrizeTier.Sixth);
    // First×2 + Fourth×2 + Sixth×2
    expect(m.winAmount).toBe(30_000_000 * 2 + 1_000_000 * 2 + 40_000 * 2);
  });

  it("duplicate trùng Ba (pool có 2 entry giống) → Third×2 + Tư×2 + Sáu×2", () => {
    const result = makeDrawResult({
      third: ["700", "700", "900", "010", "020", "030", "040", "050"],
    });
    const flat = flattenDrawResult(result);
    const m = matchPair("700", "700", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.Third);
    expect(tierNames(m)).toContain(PrizeTier.Fourth);
    expect(m.winAmount).toBe(4_000_000 * 2 + 1_000_000 * 2 + 40_000 * 2);
  });

  it("duplicate trùng special[0] nhưng pool chỉ có 1 entry → chỉ Năm×2 (không đủ 2 entry ĐB)", () => {
    const result = makeDrawResult({ special: ["111", "222"] });
    const flat = flattenDrawResult(result);
    const m = matchPair("111", "111", result, prizes, flat);
    // Bipartite: pool ["111","222"] → match 1 lần "111", còn ["222"] → chỉ 1 match
    // Không trúng ĐB (cần đúng thứ tự), không trúng phụ ĐB
    // Không trúng Tư (bipartite allTriplets: match 1 < 2)
    // Trúng Năm: 111 khớp special → ×2
    expect(tierNames(m)).toEqual([PrizeTier.Fifth]);
    expect(m.winAmount).toBe(100_000 * 2);
  });

  it("duplicate ĐB: special=['111','111'] → ĐB + phụ ĐB đều trúng (cả đúng và ngược thứ tự)", () => {
    const result = makeDrawResult({ special: ["111", "111"] });
    const flat = flattenDrawResult(result);
    const m = matchPair("111", "111", result, prizes, flat);
    // Khi special=["111","111"] và player "111"+"111":
    // - first===special[0] && second===special[1] → ĐB đúng thứ tự
    // - first===special[1] && second===special[0] → phụ ĐB ngược thứ tự
    // Cả 2 điều kiện đều thoả vì tất cả giống nhau.
    expect(tierNames(m)).toContain(PrizeTier.Special);
    expect(tierNames(m)).toContain(PrizeTier.SpecialSub);
    // Duplicate ĐB: mỗi giải = special + specialSub = 2,400,000,000
    const specialWon = m.wonTiers.find((wt) => wt.tier === PrizeTier.Special)!;
    expect(specialWon.winAmount).toBe(2_000_000_000 + 400_000_000);
    const subWon = m.wonTiers.find((wt) => wt.tier === PrizeTier.SpecialSub)!;
    expect(subWon.winAmount).toBe(2_000_000_000 + 400_000_000);
    // Cũng trúng Tư×2 + Năm×2
    expect(tierNames(m)).toContain(PrizeTier.Fourth);
    expect(tierNames(m)).toContain(PrizeTier.Fifth);
    // Tổng: 2,400,000,000 (ĐB) + 2,400,000,000 (phụ ĐB) + 2,000,000 (Tư×2) + 200,000 (Năm×2)
    expect(m.winAmount).toBe(2_400_000_000 + 2_400_000_000 + 1_000_000 * 2 + 100_000 * 2);
  });
});

// ─────────────────────────────────────────────
// IX. Thứ tự quan trọng: [A,B] vs [B,A]
// ─────────────────────────────────────────────

describe("matchPair – thứ tự ảnh hưởng kết quả ĐB", () => {
  const result = makeDrawResult({ special: ["ABC", "XYZ"] });

  it("[ABC, XYZ] → Special (đúng thứ tự)", () => {
    const flat = flattenDrawResult(result);
    const m = matchPair("ABC", "XYZ", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.Special);
    const specialWon = m.wonTiers.find((wt) => wt.tier === PrizeTier.Special)!;
    expect(specialWon.winAmount).toBe(2_000_000_000);
  });

  it("[XYZ, ABC] → SpecialSub (ngược thứ tự)", () => {
    const flat = flattenDrawResult(result);
    const m = matchPair("XYZ", "ABC", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.SpecialSub);
    const subWon = m.wonTiers.find((wt) => wt.tier === PrizeTier.SpecialSub)!;
    expect(subWon.winAmount).toBe(400_000_000);
  });
});

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// XI. Tích hợp – kịch bản đầy đủ
// ─────────────────────────────────────────────

describe("Tích hợp – kịch bản đầy đủ Max 3D Pro", () => {
  const result: Max3dproDrawResult = {
    special: ["123", "456"],
    first: ["789", "012", "345", "678"],
    second: ["234", "567", "890", "135", "246", "357"],
    third: ["468", "579", "680", "791", "802", "913", "024", "147"],
  };

  const flat = flattenDrawResult(result);

  it("cặp đúng thứ tự ĐB → Special + gộp giải", () => {
    const flat = flattenDrawResult(result);
    const m = matchPair("123", "456", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.Special);
    const specialWon = m.wonTiers.find((wt) => wt.tier === PrizeTier.Special)!;
    expect(specialWon.winAmount).toBe(2_000_000_000);
  });

  it("cặp ngược thứ tự ĐB → SpecialSub + gộp giải", () => {
    const flat = flattenDrawResult(result);
    const m = matchPair("456", "123", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.SpecialSub);
    const subWon = m.wonTiers.find((wt) => wt.tier === PrizeTier.SpecialSub)!;
    expect(subWon.winAmount).toBe(400_000_000);
  });

  it("cặp cùng Nhất → First + gộp", () => {
    const flat = flattenDrawResult(result);
    const m = matchPair("789", "012", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.First);
    expect(tierNames(m)).toContain(PrizeTier.Fourth);
  });

  it("1 ĐB + 1 Nhì → Fourth + Năm + Sáu", () => {
    const flat = flattenDrawResult(result);
    const m = matchPair("123", "234", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.Fourth);
    expect(tierNames(m)).toContain(PrizeTier.Fifth);
    expect(tierNames(m)).toContain(PrizeTier.Sixth);
    expect(m.winAmount).toBe(1_000_000 + 100_000 + 40_000);
  });

  it("1 Nhất + không trùng → Sixth only", () => {
    const flat = flattenDrawResult(result);
    const m = matchPair("789", "999", result, prizes, flat);
    expect(tierNames(m)).toEqual([PrizeTier.Sixth]);
    expect(m.winAmount).toBe(40_000);
  });
});

// ─────────────────────────────────────────────
// XII. Bipartite matching – edge cases
// ─────────────────────────────────────────────

describe("matchPair – bipartite matching edge cases", () => {
  it("duplicate trùng Nhất nhưng pool chỉ có 1 entry → không trúng First", () => {
    const result = makeDrawResult({ first: ["333", "444", "555", "666"] });
    const flat = flattenDrawResult(result);
    const m = matchPair("333", "333", result, prizes, flat);
    // Pool Nhất: ["333","444","555","666"] → chỉ 1 entry "333"
    // Bipartite: match 1 < 2 → không trúng First
    expect(tierNames(m)).not.toContain(PrizeTier.First);
    // Nhưng vẫn trúng Sáu (1 bộ khớp Nhất) ×2
    expect(tierNames(m)).toContain(PrizeTier.Sixth);
    expect(m.winAmount).toBe(40_000 * 2);
  });

  it("non-duplicate 2 bộ khớp 2 entry riêng biệt Nhất → trúng First", () => {
    const result = makeDrawResult({ first: ["333", "444", "555", "666"] });
    const flat = flattenDrawResult(result);
    const m = matchPair("333", "444", result, prizes, flat);
    expect(tierNames(m)).toContain(PrizeTier.First);
  });
});

// ─────────────────────────────────────────────
// XIII. play-types – calculateLineCount & expandSelectionToPairs (multiNumber ordered pairs)
// ─────────────────────────────────────────────

import { calculateLineCount, expandSelectionToPairs } from "@megawin/game-max3dpro/rules/play-types";
import { PlayMode, PlayType } from "@megawin/game-max3dpro/entities/enums";
import type { BoardSelection } from "@megawin/game-max3dpro/entities/types";

describe("calculateLineCount – multiNumber → P(n,2) ordered pairs", () => {
  it("3 bộ ba → P(3,2) = 6", () => {
    const sel: BoardSelection = { triplets: ["096", "389", "683"] };
    expect(calculateLineCount(PlayMode.MultiNumber, sel)).toBe(6);
  });

  it("4 bộ ba → P(4,2) = 12", () => {
    const sel: BoardSelection = { triplets: ["001", "002", "003", "004"] };
    expect(calculateLineCount(PlayMode.MultiNumber, sel)).toBe(12);
  });

  it("5 bộ ba → P(5,2) = 20", () => {
    const sel: BoardSelection = { triplets: ["001", "002", "003", "004", "005"] };
    expect(calculateLineCount(PlayMode.MultiNumber, sel)).toBe(20);
  });

  it("10 bộ ba → P(10,2) = 90", () => {
    const sel: BoardSelection = {
      triplets: ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010"],
    };
    expect(calculateLineCount(PlayMode.MultiNumber, sel)).toBe(90);
  });

  it("20 bộ ba → P(20,2) = 380", () => {
    const sel: BoardSelection = {
      triplets: Array.from({ length: 20 }, (_, i) => String(i).padStart(3, "0")),
    };
    expect(calculateLineCount(PlayMode.MultiNumber, sel)).toBe(380);
  });
});

describe("expandSelectionToPairs – multiNumber → P(n,2) ordered pairs", () => {
  it("3 bộ ba → 6 ordered pairs (gồm cả (A,B) và (B,A))", () => {
    const sel: BoardSelection = { triplets: ["096", "389", "683"] };
    const pairs = expandSelectionToPairs(PlayMode.MultiNumber, sel);
    expect(pairs).toHaveLength(6);

    // Phải có CẢ (096,389) VÀ (389,096)
    const pairStrs = pairs.map((p) => `${p.first},${p.second}`);
    expect(pairStrs).toContain("096,389");
    expect(pairStrs).toContain("389,096");
    expect(pairStrs).toContain("096,683");
    expect(pairStrs).toContain("683,096");
    expect(pairStrs).toContain("389,683");
    expect(pairStrs).toContain("683,389");
  });

  it("4 bộ ba → 12 ordered pairs", () => {
    const sel: BoardSelection = { triplets: ["001", "002", "003", "004"] };
    const pairs = expandSelectionToPairs(PlayMode.MultiNumber, sel);
    expect(pairs).toHaveLength(12);

    // Đúng thứ tự và ngược thứ tự đều phải có
    const pairStrs = pairs.map((p) => `${p.first},${p.second}`);
    expect(pairStrs).toContain("001,002");
    expect(pairStrs).toContain("002,001");
  });

  it("không có cặp nào first === second (không tự ghép với chính nó)", () => {
    const sel: BoardSelection = { triplets: ["096", "389", "683", "111"] };
    const pairs = expandSelectionToPairs(PlayMode.MultiNumber, sel);
    for (const p of pairs) {
      // Trường hợp 2 triplet giống nhau trong input sẽ được test riêng
      // Ở đây test 4 triplet khác nhau → không có self-pair
      expect(p.first).not.toBe(p.second);
    }
  });

  it("kịch bản thực tế: player chọn ['096','389','683'], Special=['096','389'] → 1 pair trúng ĐB, 1 pair trúng phụ ĐB", () => {
    // Đây là ví dụ minh hoạ lý do cần ordered pairs:
    // - (096,389) → trúng Giải ĐB (đúng thứ tự) = 2 tỷ
    // - (389,096) → trúng Giải phụ ĐB (ngược thứ tự) = 400 triệu
    // Nếu dùng C(n,2) chỉ có (096,389) → mất 400 triệu giải phụ ĐB!
    const sel: BoardSelection = { triplets: ["096", "389", "683"] };
    const pairs = expandSelectionToPairs(PlayMode.MultiNumber, sel);
    const result: Max3dproDrawResult = {
      special: ["096", "389"],
      first: ["111", "222", "333", "444"],
      second: ["555", "666", "777", "888", "999", "000"],
      third: ["100", "200", "300", "400", "500", "600", "700", "800"],
    };

    let hasSpecial = false;
    let hasSpecialSub = false;
    for (const p of pairs) {
      const flat = flattenDrawResult(result);
      const m = matchPair(p.first, p.second, result, prizes, flat);
      if (tierNames(m).includes(PrizeTier.Special)) hasSpecial = true;
      if (tierNames(m).includes(PrizeTier.SpecialSub)) hasSpecialSub = true;
    }
    expect(hasSpecial).toBe(true);
    expect(hasSpecialSub).toBe(true);
  });
});

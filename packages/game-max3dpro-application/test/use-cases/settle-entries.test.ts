import { describe, it, expect } from "vitest";
import {
  matchPair,
  matchBoard,
  flattenDrawResult,
} from "@megawin/game-max3dpro/rules/prize-tiers";
import { PrizeTier } from "@megawin/game-max3dpro/entities/enums";
import { DEFAULT_MAX3D_PRO_CONFIG } from "@megawin/game-max3dpro/rules/defaults";
import type { Max3dproDrawResult } from "@megawin/game-max3dpro/entities/draw-result";

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const prizes = DEFAULT_MAX3D_PRO_CONFIG.defaultPrizes.standard;

function makeDrawResult(
  overrides: Partial<Max3dproDrawResult> = {}
): Max3dproDrawResult {
  return {
    special: ["111", "222"],
    first: ["333", "444", "555", "666"],
    second: ["100", "200", "300", "400", "500", "600"],
    third: ["700", "800", "900", "010", "020", "030", "040", "050"],
    ...overrides,
  };
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
  it("first=special[0], second=special[1] → Special 2,000,000,000", () => {
    const result = makeDrawResult({ special: ["111", "222"] });
    const m = matchPair("111", "222", result, prizes);
    expect(m.tier).toBe(PrizeTier.Special);
    expect(m.winAmount).toBe(2_000_000_000);
  });

  it("thứ tự ngược lại → KHÔNG phải Special", () => {
    const result = makeDrawResult({ special: ["111", "222"] });
    const m = matchPair("222", "111", result, prizes);
    expect(m.tier).not.toBe(PrizeTier.Special);
  });
});

// ─────────────────────────────────────────────
// III. matchPair – giải Phụ Đặc Biệt (ngược thứ tự)
// ─────────────────────────────────────────────

describe("matchPair – giải Phụ Đặc Biệt (ngược thứ tự quay)", () => {
  it("first=special[1], second=special[0] → SpecialSub 400,000,000", () => {
    const result = makeDrawResult({ special: ["111", "222"] });
    const m = matchPair("222", "111", result, prizes);
    expect(m.tier).toBe(PrizeTier.SpecialSub);
    expect(m.winAmount).toBe(400_000_000);
  });
});

// ─────────────────────────────────────────────
// IV. matchPair – giải Nhất, Nhì, Ba
// ─────────────────────────────────────────────

describe("matchPair – giải Nhất, Nhì, Ba", () => {
  it("cả 2 trùng trong nhóm Nhất → First 30,000,000", () => {
    const result = makeDrawResult();
    const m = matchPair("333", "444", result, prizes);
    expect(m.tier).toBe(PrizeTier.First);
    expect(m.winAmount).toBe(30_000_000);
  });

  it("cả 2 trùng trong nhóm Nhì → Second 10,000,000", () => {
    const result = makeDrawResult();
    const m = matchPair("100", "200", result, prizes);
    expect(m.tier).toBe(PrizeTier.Second);
    expect(m.winAmount).toBe(10_000_000);
  });

  it("cả 2 trùng trong nhóm Ba → Third 4,000,000", () => {
    const result = makeDrawResult();
    const m = matchPair("700", "800", result, prizes);
    expect(m.tier).toBe(PrizeTier.Third);
    expect(m.winAmount).toBe(4_000_000);
  });
});

// ─────────────────────────────────────────────
// V. matchPair – giải Tư (cross-tier)
// ─────────────────────────────────────────────

describe("matchPair – giải Tư (cross-tier)", () => {
  it("1 ĐB + 1 Nhất → Fourth 1,000,000", () => {
    const result = makeDrawResult();
    const m = matchPair("111", "333", result, prizes);
    expect(m.tier).toBe(PrizeTier.Fourth);
    expect(m.winAmount).toBe(1_000_000);
  });

  it("1 Nhì + 1 Ba → Fourth 1,000,000", () => {
    const result = makeDrawResult();
    const m = matchPair("100", "700", result, prizes);
    expect(m.tier).toBe(PrizeTier.Fourth);
    expect(m.winAmount).toBe(1_000_000);
  });

  it("1 Nhất + 1 Ba → Fourth 1,000,000", () => {
    const result = makeDrawResult();
    const m = matchPair("333", "700", result, prizes);
    expect(m.tier).toBe(PrizeTier.Fourth);
    expect(m.winAmount).toBe(1_000_000);
  });
});

// ─────────────────────────────────────────────
// VI. matchPair – giải Năm, Sáu
// ─────────────────────────────────────────────

describe("matchPair – giải Năm, Sáu (chỉ 1 trùng)", () => {
  it("chỉ 1 trùng giải ĐB → Fifth 100,000", () => {
    const result = makeDrawResult();
    const m = matchPair("111", "999", result, prizes);
    expect(m.tier).toBe(PrizeTier.Fifth);
    expect(m.winAmount).toBe(100_000);
  });

  it("chỉ 1 trùng giải Nhất → Sixth 40,000", () => {
    const result = makeDrawResult();
    const m = matchPair("333", "999", result, prizes);
    expect(m.tier).toBe(PrizeTier.Sixth);
    expect(m.winAmount).toBe(40_000);
  });

  it("chỉ 1 trùng giải Nhì → Sixth 40,000", () => {
    const result = makeDrawResult();
    const m = matchPair("100", "999", result, prizes);
    expect(m.tier).toBe(PrizeTier.Sixth);
    expect(m.winAmount).toBe(40_000);
  });

  it("chỉ 1 trùng giải Ba → Sixth 40,000", () => {
    const result = makeDrawResult();
    const m = matchPair("700", "999", result, prizes);
    expect(m.tier).toBe(PrizeTier.Sixth);
    expect(m.winAmount).toBe(40_000);
  });
});

// ─────────────────────────────────────────────
// VII. matchPair – không trùng
// ─────────────────────────────────────────────

describe("matchPair – không trùng", () => {
  it("cả 2 không trùng → null, 0 VND", () => {
    const result = makeDrawResult();
    const m = matchPair("999", "998", result, prizes);
    expect(m.tier).toBeNull();
    expect(m.winAmount).toBe(0);
    expect(m.matchedTriplets).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// VIII. matchPair – duplicate triplets (2 bộ giống nhau)
// ─────────────────────────────────────────────

describe("matchPair – duplicate triplets (thưởng ×2)", () => {
  it("duplicate trùng Nhất → First ×2 = 60,000,000", () => {
    const result = makeDrawResult();
    const m = matchPair("333", "333", result, prizes);
    expect(m.tier).toBe(PrizeTier.First);
    expect(m.winAmount).toBe(30_000_000 * 2);
  });

  it("duplicate trùng Ba → Third ×2 = 8,000,000", () => {
    const result = makeDrawResult();
    const m = matchPair("700", "700", result, prizes);
    expect(m.tier).toBe(PrizeTier.Third);
    expect(m.winAmount).toBe(4_000_000 * 2);
  });

  it("duplicate trùng special[0] → Fourth ×2 (không đủ cả 2 vị trí ĐB)", () => {
    const result = makeDrawResult({ special: ["111", "222"] });
    const m = matchPair("111", "111", result, prizes);
    expect(m.tier).toBe(PrizeTier.Fourth);
    expect(m.winAmount).toBe(1_000_000 * 2);
  });
});

// ─────────────────────────────────────────────
// IX. Thứ tự quan trọng: [A,B] vs [B,A]
// ─────────────────────────────────────────────

describe("matchPair – thứ tự ảnh hưởng kết quả ĐB", () => {
  const result = makeDrawResult({ special: ["ABC", "XYZ"] });

  it("[ABC, XYZ] → Special (đúng thứ tự)", () => {
    const m = matchPair("ABC", "XYZ", result, prizes);
    expect(m.tier).toBe(PrizeTier.Special);
    expect(m.winAmount).toBe(2_000_000_000);
  });

  it("[XYZ, ABC] → SpecialSub (ngược thứ tự)", () => {
    const m = matchPair("XYZ", "ABC", result, prizes);
    expect(m.tier).toBe(PrizeTier.SpecialSub);
    expect(m.winAmount).toBe(400_000_000);
  });

  it("chênh lệch giải thưởng giữa Special và SpecialSub = 1,600,000,000", () => {
    const forward = matchPair("ABC", "XYZ", result, prizes);
    const reverse = matchPair("XYZ", "ABC", result, prizes);
    expect(forward.winAmount - reverse.winAmount).toBe(1_600_000_000);
  });
});

// ─────────────────────────────────────────────
// X. matchBoard – nhiều cặp (multiNumber)
// ─────────────────────────────────────────────

describe("matchBoard – so khớp toàn bộ board (nhiều cặp)", () => {
  const result = makeDrawResult();

  it("board 1 cặp trúng First → totalWinAmount = 30,000,000", () => {
    const board = {
      boardNo: "B1",
      playMode: "multiNumber",
      playType: "straight",
      pairs: [{ first: "333", second: "444" }],
    };
    const m = matchBoard(board, result, prizes);
    expect(m.totalWinAmount).toBe(30_000_000);
    expect(m.lineResults).toHaveLength(1);
    expect(m.lineResults[0]!.tier).toBe(PrizeTier.First);
  });

  it("board C(3,2) = 3 cặp, 1 cặp trúng → tổng thưởng chỉ từ cặp đó", () => {
    const board = {
      boardNo: "B2",
      playMode: "multiNumber",
      playType: "straight",
      pairs: [
        { first: "333", second: "444" },
        { first: "333", second: "999" },
        { first: "444", second: "999" },
      ],
    };
    const m = matchBoard(board, result, prizes);
    expect(m.lineResults).toHaveLength(3);

    expect(m.lineResults[0]!.tier).toBe(PrizeTier.First);
    expect(m.lineResults[0]!.winAmount).toBe(30_000_000);

    expect(m.lineResults[1]!.tier).toBe(PrizeTier.Sixth);
    expect(m.lineResults[1]!.winAmount).toBe(40_000);

    expect(m.lineResults[2]!.tier).toBe(PrizeTier.Sixth);
    expect(m.lineResults[2]!.winAmount).toBe(40_000);

    expect(m.totalWinAmount).toBe(30_000_000 + 40_000 + 40_000);
  });

  it("board không cặp nào trúng → totalWinAmount = 0", () => {
    const board = {
      boardNo: "B3",
      playMode: "multiNumber",
      playType: "straight",
      pairs: [{ first: "999", second: "998" }],
    };
    const m = matchBoard(board, result, prizes);
    expect(m.totalWinAmount).toBe(0);
    expect(m.lineResults[0]!.tier).toBeNull();
  });

  it("board nhiều cặp, nhiều cặp trúng → tổng thưởng cộng dồn", () => {
    const board = {
      boardNo: "B4",
      playMode: "multiNumber",
      playType: "straight",
      pairs: [
        { first: "333", second: "444" },
        { first: "100", second: "200" },
        { first: "700", second: "800" },
      ],
    };
    const m = matchBoard(board, result, prizes);
    expect(m.totalWinAmount).toBe(30_000_000 + 10_000_000 + 4_000_000);
  });
});

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

  it("cặp đúng thứ tự ĐB → Special", () => {
    const m = matchPair("123", "456", result, prizes);
    expect(m.tier).toBe(PrizeTier.Special);
    expect(m.winAmount).toBe(2_000_000_000);
  });

  it("cặp ngược thứ tự ĐB → SpecialSub", () => {
    const m = matchPair("456", "123", result, prizes);
    expect(m.tier).toBe(PrizeTier.SpecialSub);
    expect(m.winAmount).toBe(400_000_000);
  });

  it("cặp cùng Nhất → First", () => {
    const m = matchPair("789", "012", result, prizes);
    expect(m.tier).toBe(PrizeTier.First);
    expect(m.winAmount).toBe(30_000_000);
  });

  it("1 ĐB + 1 Nhì → Fourth (cross-tier)", () => {
    const m = matchPair("123", "234", result, prizes);
    expect(m.tier).toBe(PrizeTier.Fourth);
    expect(m.winAmount).toBe(1_000_000);
  });

  it("1 Nhất + không trùng → Sixth", () => {
    const m = matchPair("789", "999", result, prizes);
    expect(m.tier).toBe(PrizeTier.Sixth);
    expect(m.winAmount).toBe(40_000);
  });

  it("board với 3 cặp hỗn hợp", () => {
    const board = {
      boardNo: "B1",
      playMode: "multiNumber",
      playType: "straight",
      pairs: [
        { first: "123", second: "456" },
        { first: "789", second: "012" },
        { first: "999", second: "998" },
      ],
    };
    const m = matchBoard(board, result, prizes);
    expect(m.lineResults[0]!.tier).toBe(PrizeTier.Special);
    expect(m.lineResults[1]!.tier).toBe(PrizeTier.First);
    expect(m.lineResults[2]!.tier).toBeNull();
    expect(m.totalWinAmount).toBe(2_000_000_000 + 30_000_000);
  });
});

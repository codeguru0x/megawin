/**
 * Max 3D – Odds table verification by FULL ENUMERATION
 *
 * PURE — không DB, không mock.
 *
 * Trọng tâm: chứng minh bảng `getBasicOddsTable()` / `getPlusOddsTable()` khớp
 * CHÍNH XÁC hành vi của `matchBasicStraight()` / `matchPlus()` — không phải khớp
 * một công thức viết tay trong JSDoc.
 *
 * Cách kiểm chứng: duyệt trọn không gian mẫu (1.000 bộ cho Basic, 1.000.000 cặp
 * có thứ tự cho Plus), cộng dồn **effective ways** của từng hạng:
 *
 *     effectiveWays[tier] = Σ (winAmount của hạng đó) ÷ (giá trị giải gốc)
 *
 * Phép chia này quy đổi cả 2 hiệu ứng mà công thức naive `k²` bỏ sót:
 * - Cặp trùng (t1 = t2) được ×2 giải thưởng từ Nhất → Sáu.
 * - Một cặp có thể trúng CÙNG một hạng nhiều lần (Giải Năm/Sáu tính theo từng bộ).
 *
 * Nhờ vậy `probability × prize` trong `analyzePlusProfitability()` cho chi phí kỳ
 * vọng ĐÚNG, không cần hệ số điều chỉnh — đó là điều test này khoá lại.
 *
 * Giả định: 20 bộ kết quả ĐỀU KHÁC NHAU (trường hợp phổ biến nhất, cũng là giả
 * định của bảng odds). Draw result dựng bên dưới cố ý dùng 20 giá trị phân biệt.
 */

import { describe, expect, it } from "vitest";

import type { Max3dDrawResult } from "../../src/entities/draw-result";
import { type BasicPrizeTier, PlusPrizeTier } from "../../src/entities/enums";
import type { BasicPrizeAmounts, PlusPrizeAmounts, Triplet } from "../../src/entities/types";
import {
  BASIC_TOTAL_OUTCOMES,
  getBasicOddsTable,
  getCombo3OddsTable,
  getCombo6OddsTable,
  getPlusOddsTable,
  PLUS_TOTAL_OUTCOMES,
} from "../../src/rules/odds";
import { flattenDrawResult, matchBasicStraight, matchPlus } from "../../src/rules/prize-tiers";

/** Bộ ba số dạng zero-padded từ số nguyên 0–999. */
function toTriplet(n: number): Triplet {
  return n.toString().padStart(3, "0");
}

// 20 bộ kết quả PHÂN BIỆT: 000-001 (ĐB), 002-005 (Nhất), 006-011 (Nhì), 012-019 (Ba).
const drawResult: Max3dDrawResult = {
  special: [toTriplet(0), toTriplet(1)],
  first: [2, 3, 4, 5].map(toTriplet),
  second: [6, 7, 8, 9, 10, 11].map(toTriplet),
  third: [12, 13, 14, 15, 16, 17, 18, 19].map(toTriplet),
};

// Giải thưởng dùng để enumerate. Giá trị KHÔNG cần giống default config — chỉ cần
// khác 0 để chia ra effective ways. Dùng số phân biệt để lỗi gán sai tier lộ ra.
const basicPrizes: BasicPrizeAmounts = {
  special: 1_000_000,
  first: 350_000,
  second: 210_000,
  third: 100_000,
};

const plusPrizes: PlusPrizeAmounts = {
  special: 1_000_000_000,
  first: 40_000_000,
  second: 10_000_000,
  third: 5_000_000,
  fourth: 1_000_000,
  fifth: 150_000,
  sixth: 40_000,
};

describe("getBasicOddsTable — enumerate 1.000 bộ ba số qua matchBasicStraight()", () => {
  const { byTier } = flattenDrawResult(drawResult);

  /** effectiveWays theo tier, cộng dồn winAmount ÷ prize gốc. */
  const enumerated = new Map<BasicPrizeTier, number>();

  for (let n = 0; n < BASIC_TOTAL_OUTCOMES; n++) {
    const { tiers } = matchBasicStraight(toTriplet(n), byTier, basicPrizes);
    for (const tier of tiers) {
      enumerated.set(tier, (enumerated.get(tier) ?? 0) + 1);
    }
  }

  it("Đúng số học — resultCount & probability từng hạng khớp enumeration", () => {
    for (const row of getBasicOddsTable()) {
      expect(enumerated.get(row.tier) ?? 0, `hạng ${row.tier}`).toBe(row.resultCount);
      expect(row.probability, `hạng ${row.tier}`).toBeCloseTo(row.resultCount / BASIC_TOTAL_OUTCOMES, 12);
    }
  });

  it("Đúng số học — tổng số bộ trúng = 20 (2 ĐB + 4 Nhất + 6 Nhì + 8 Ba)", () => {
    const total = [...enumerated.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(20);
  });

  it("Logic ngược — 980 bộ còn lại không trúng hạng nào", () => {
    let losers = 0;
    for (let n = 0; n < BASIC_TOTAL_OUTCOMES; n++) {
      if (matchBasicStraight(toTriplet(n), byTier, basicPrizes).tiers.length === 0) {
        losers++;
      }
    }
    expect(losers).toBe(980);
  });
});

describe("getCombo3/6OddsTable — hệ số hoán vị", () => {
  // Combo KHÔNG phải xác suất "ít nhất 1 lần": mỗi hoán vị là 1 line so khớp độc
  // lập nên con số là SỐ LẦN TRÚNG KỲ VỌNG của cả board = k × p(straight).
  it("Đúng số học — Combo3 = 3 × straight, Combo6 = 6 × straight", () => {
    const straight = getBasicOddsTable();
    const combo3 = getCombo3OddsTable();
    const combo6 = getCombo6OddsTable();

    for (let i = 0; i < straight.length; i++) {
      expect(combo3[i]!.probability).toBeCloseTo(straight[i]!.probability * 3, 12);
      expect(combo6[i]!.probability).toBeCloseTo(straight[i]!.probability * 6, 12);
    }
  });
});

describe("getPlusOddsTable — enumerate 1.000.000 cặp có thứ tự qua matchPlus()", () => {
  const { byTier, allTriplets } = flattenDrawResult(drawResult);

  // Cộng dồn effective ways: winAmount ÷ prize gốc. Chia (không phải đếm) để
  // hấp thụ ×2 của cặp trùng và các lần trúng lặp của Giải Năm/Sáu.
  const enumerated = new Map<PlusPrizeTier, number>();
  const triplets: Triplet[] = Array.from({ length: 1000 }, (_, n) => toTriplet(n));

  for (const t1 of triplets) {
    for (const t2 of triplets) {
      const { wonTiers } = matchPlus(t1, t2, byTier, allTriplets, plusPrizes);
      for (const { tier, winAmount } of wonTiers) {
        enumerated.set(tier, (enumerated.get(tier) ?? 0) + winAmount / plusPrizes[tier]);
      }
    }
  }

  it("Đúng số học — effective ways từng hạng khớp enumeration đủ 1.000.000 cặp", () => {
    for (const row of getPlusOddsTable()) {
      expect(enumerated.get(row.tier) ?? 0, `hạng ${row.tier}`).toBe(row.ways);
    }
  });

  it("Đúng số học — probability = ways / 1.000.000 và oneInN là nghịch đảo", () => {
    for (const row of getPlusOddsTable()) {
      expect(row.probability, `hạng ${row.tier}`).toBeCloseTo(row.ways / PLUS_TOTAL_OUTCOMES, 12);
      expect(row.oneInN, `hạng ${row.tier}`).toBeCloseTo(1 / row.probability, 6);
    }
  });

  it("Đúng nghiệp vụ — nhóm cặp dùng k×(k−1), KHÔNG phải k² (cặp trùng không khớp 2 entry riêng biệt)", () => {
    const ways = new Map(getPlusOddsTable().map((r) => [r.tier, r.ways]));
    expect(ways.get(PlusPrizeTier.Special)).toBe(2 * 1);
    expect(ways.get(PlusPrizeTier.First)).toBe(4 * 3);
    expect(ways.get(PlusPrizeTier.Second)).toBe(6 * 5);
    expect(ways.get(PlusPrizeTier.Third)).toBe(8 * 7);
    expect(ways.get(PlusPrizeTier.Fourth)).toBe(20 * 19);
  });

  it("Đúng nghiệp vụ — nhóm đơn (Năm/Sáu) đếm số LẦN trúng: 2 vị trí × k entry × 1.000", () => {
    const ways = new Map(getPlusOddsTable().map((r) => [r.tier, r.ways]));
    expect(ways.get(PlusPrizeTier.Fifth)).toBe(2 * 2 * 1000);
    expect(ways.get(PlusPrizeTier.Sixth)).toBe(2 * 18 * 1000);
  });

  it("Logic ngược — cặp trùng KHÔNG trúng giải ĐB khi 2 bộ ĐB khác giá trị", () => {
    const { wonTiers } = matchPlus(toTriplet(0), toTriplet(0), byTier, allTriplets, plusPrizes);
    expect(wonTiers.some((w) => w.tier === PlusPrizeTier.Special)).toBe(false);
    // Vẫn trúng Giải Năm và được ×2 vì là cặp trùng.
    const fifth = wonTiers.find((w) => w.tier === PlusPrizeTier.Fifth);
    expect(fifth?.winAmount).toBe(plusPrizes.fifth * 2);
  });
});

describe("matchPlus — Giải Năm/Sáu kiểm tra ĐỘC LẬP (triplet nằm ở cả 2 pool)", () => {
  // Draw result cố ý cho "096" xuất hiện ở CẢ pool ĐB lẫn pool Nhất — chuyện có
  // thể xảy ra vì 20 bộ ba được quay độc lập. Theo luật gộp giải, 1 bộ số như vậy
  // phải trúng CẢ Giải Năm (khớp ĐB) lẫn Giải Sáu (khớp Nhất), không chỉ hạng cao nhất.
  const overlapResult: Max3dDrawResult = {
    special: ["096", toTriplet(1)],
    first: ["096", toTriplet(3), toTriplet(4), toTriplet(5)],
    second: [6, 7, 8, 9, 10, 11].map(toTriplet),
    third: [12, 13, 14, 15, 16, 17, 18, 19].map(toTriplet),
  };

  const { byTier, allTriplets } = flattenDrawResult(overlapResult);

  it("Đúng nghiệp vụ — bộ số ở cả pool ĐB và Nhất → trúng CẢ Giải Năm lẫn Giải Sáu", () => {
    const { wonTiers } = matchPlus("096", toTriplet(900), byTier, allTriplets, plusPrizes);
    const tiers = wonTiers.map((w) => w.tier);

    expect(tiers).toContain(PlusPrizeTier.Fifth);
    expect(tiers).toContain(PlusPrizeTier.Sixth);
  });

  it("Đúng nghiệp vụ — Giải Sáu chỉ tính 1 lần/bộ dù khớp nhiều pool trong Nhất/Nhì/Ba", () => {
    // "300" đặt ở cả pool Nhì lẫn Ba → điều kiện Giải Sáu là "Nhất, Nhì HOẶC Ba",
    // một giải duy nhất, nên không được đếm 2 lần.
    const multiNonSpecial: Max3dDrawResult = {
      special: [toTriplet(0), toTriplet(1)],
      first: [2, 3, 4, 5].map(toTriplet),
      second: ["300", toTriplet(7), toTriplet(8), toTriplet(9), toTriplet(10), toTriplet(11)],
      third: [
        "300",
        toTriplet(13),
        toTriplet(14),
        toTriplet(15),
        toTriplet(16),
        toTriplet(17),
        toTriplet(18),
        toTriplet(19),
      ],
    };
    const flat = flattenDrawResult(multiNonSpecial);

    const { wonTiers } = matchPlus("300", toTriplet(900), flat.byTier, flat.allTriplets, plusPrizes);
    const sixthHits = wonTiers.filter((w) => w.tier === PlusPrizeTier.Sixth);

    expect(sixthHits).toHaveLength(1);
  });
});

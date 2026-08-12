/**
 * Max 3D Pro – Odds table verification by FULL ENUMERATION
 *
 * PURE — không DB, không mock.
 *
 * Trọng tâm: chứng minh bảng `getProOddsTable()` khớp CHÍNH XÁC hành vi của
 * `matchPair()` — không phải khớp một công thức viết tay trong JSDoc.
 *
 * Cách kiểm chứng: duyệt trọn 1.000.000 cặp có thứ tự, cộng dồn **effective ways**:
 *
 *     effectiveWays[tier] = Σ (winAmount của hạng đó) ÷ (giá trị giải gốc)
 *
 * Phép chia quy đổi 2 hiệu ứng mà công thức naive `k²` bỏ sót:
 * - Cặp trùng (first = second) được ×2 giải thưởng từ Nhất → Sáu.
 * - Một cặp có thể trúng CÙNG một hạng nhiều lần (Giải Năm/Sáu tính theo từng bộ).
 *
 * Nhờ vậy `probability × prize` trong `analyzeProProfitability()` cho chi phí kỳ
 * vọng ĐÚNG mà không cần hệ số điều chỉnh — đó là điều test này khoá lại.
 *
 * Giả định: 20 bộ kết quả ĐỀU KHÁC NHAU (giả định của bảng odds). Riêng nhánh
 * 2 bộ ĐB trùng giá trị được test riêng vì lúc đó luật ĐB đổi hẳn công thức.
 */

import { describe, expect, it } from "vitest";

import type { Max3dproDrawResult } from "../../src/entities/draw-result";
import { PrizeTier } from "../../src/entities/enums";
import type { PrizeAmounts, Triplet } from "../../src/entities/types";
import { getProOddsTable, PRO_TOTAL_OUTCOMES } from "../../src/rules/odds";
import { flattenDrawResult, matchPair } from "../../src/rules/prize-tiers";

/** Bộ ba số dạng zero-padded từ số nguyên 0–999. */
function toTriplet(n: number): Triplet {
  return n.toString().padStart(3, "0");
}

// 20 bộ kết quả PHÂN BIỆT: 000-001 (ĐB), 002-005 (Nhất), 006-011 (Nhì), 012-019 (Ba).
const drawResult: Max3dproDrawResult = {
  special: [toTriplet(0), toTriplet(1)],
  first: [2, 3, 4, 5].map(toTriplet),
  second: [6, 7, 8, 9, 10, 11].map(toTriplet),
  third: [12, 13, 14, 15, 16, 17, 18, 19].map(toTriplet),
};

// Giá trị phân biệt để lỗi gán sai tier lộ ra khi chia lấy effective ways.
const prizes: PrizeAmounts = {
  special: 2_000_000_000,
  specialSub: 400_000_000,
  first: 30_000_000,
  second: 10_000_000,
  third: 4_000_000,
  fourth: 1_000_000,
  fifth: 100_000,
  sixth: 40_000,
};

describe("getProOddsTable — enumerate 1.000.000 cặp có thứ tự qua matchPair()", () => {
  const flat = flattenDrawResult(drawResult);

  const enumerated = new Map<PrizeTier, number>();
  const triplets: Triplet[] = Array.from({ length: 1000 }, (_, n) => toTriplet(n));

  for (const first of triplets) {
    for (const second of triplets) {
      const { wonTiers } = matchPair(first, second, drawResult, prizes, flat);
      for (const { tier, winAmount } of wonTiers) {
        enumerated.set(tier, (enumerated.get(tier) ?? 0) + winAmount / prizes[tier]);
      }
    }
  }

  it("Đúng số học — effective ways từng hạng khớp enumeration đủ 1.000.000 cặp", () => {
    for (const row of getProOddsTable()) {
      expect(enumerated.get(row.tier) ?? 0, `hạng ${row.tier}`).toBe(row.ways);
    }
  });

  it("Đúng số học — probability = ways / 1.000.000 và oneInN là nghịch đảo", () => {
    for (const row of getProOddsTable()) {
      expect(row.probability, `hạng ${row.tier}`).toBeCloseTo(row.ways / PRO_TOTAL_OUTCOMES, 12);
      expect(row.oneInN, `hạng ${row.tier}`).toBeCloseTo(1 / row.probability, 6);
    }
  });

  it("Đúng nghiệp vụ — ĐB / phụ ĐB là cặp CÓ THỨ TỰ → đúng 1 way mỗi hạng", () => {
    const ways = new Map(getProOddsTable().map((r) => [r.tier, r.ways]));
    expect(ways.get(PrizeTier.Special)).toBe(1);
    expect(ways.get(PrizeTier.SpecialSub)).toBe(1);
  });

  it("Đúng nghiệp vụ — nhóm cặp dùng k×(k−1), KHÔNG phải k² (cặp trùng không khớp 2 entry riêng biệt)", () => {
    const ways = new Map(getProOddsTable().map((r) => [r.tier, r.ways]));
    expect(ways.get(PrizeTier.First)).toBe(4 * 3);
    expect(ways.get(PrizeTier.Second)).toBe(6 * 5);
    expect(ways.get(PrizeTier.Third)).toBe(8 * 7);
    expect(ways.get(PrizeTier.Fourth)).toBe(20 * 19);
  });

  it("Đúng nghiệp vụ — nhóm đơn (Năm/Sáu) đếm số LẦN trúng: 2 vị trí × k entry × 1.000", () => {
    const ways = new Map(getProOddsTable().map((r) => [r.tier, r.ways]));
    expect(ways.get(PrizeTier.Fifth)).toBe(2 * 2 * 1000);
    expect(ways.get(PrizeTier.Sixth)).toBe(2 * 18 * 1000);
  });

  it("Logic ngược — đảo thứ tự (special[1], special[0]) trúng phụ ĐB, KHÔNG trúng ĐB", () => {
    const { wonTiers } = matchPair(toTriplet(1), toTriplet(0), drawResult, prizes, flat);
    const tiers = wonTiers.map((w) => w.tier);
    expect(tiers).toContain(PrizeTier.SpecialSub);
    expect(tiers).not.toContain(PrizeTier.Special);
  });
});

describe("getProOddsTable — nhánh 2 bộ ĐB TRÙNG giá trị (bảng odds không phủ)", () => {
  // Khi special[0] === special[1], cặp trùng khớp cả ĐB lẫn phụ ĐB và mỗi hạng
  // trả special + specialSub → effective ways theo ĐB tăng vọt so với bảng.
  // Test này ghi nhận sự lệch CÓ CHỦ ĐÍCH đó để không ai "sửa" bảng odds theo nhánh hiếm này.
  const dupResult: Max3dproDrawResult = { ...drawResult, special: [toTriplet(0), toTriplet(0)] };
  const dupFlat = flattenDrawResult(dupResult);

  it("Đúng nghiệp vụ — cặp trùng khớp ĐB nhận special + specialSub cho CẢ ĐB lẫn phụ ĐB", () => {
    const { wonTiers } = matchPair(toTriplet(0), toTriplet(0), dupResult, prizes, dupFlat);

    const special = wonTiers.find((w) => w.tier === PrizeTier.Special);
    const specialSub = wonTiers.find((w) => w.tier === PrizeTier.SpecialSub);

    expect(special?.winAmount).toBe(prizes.special + prizes.specialSub);
    expect(specialSub?.winAmount).toBe(prizes.special + prizes.specialSub);
  });

  it("Đúng nghiệp vụ — bảng odds giả định 20 bộ phân biệt nên KHÔNG phản ánh nhánh này", () => {
    const ways = new Map(getProOddsTable().map((r) => [r.tier, r.ways]));
    // Bảng vẫn giữ 1 way cho ĐB — đúng với giả định phân biệt, không chạy theo nhánh hiếm.
    expect(ways.get(PrizeTier.Special)).toBe(1);
  });
});

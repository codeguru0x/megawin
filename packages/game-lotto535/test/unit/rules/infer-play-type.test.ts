/**
 * Lotto 5/35 – Unit test: `inferPlayType` (pure, p1-01)
 *
 * PURE — không DB. Suy `PlayType` từ (mainCount, specialCount) cho player combo popularity
 * (player chỉ gửi numbers/specials, không gửi playType). Đối chiếu bảng `play-types.ts`:
 * 4+1→mainCover4, 5+1→standard, 6-15+1→mainCover, 5+(2-12)→specialCover. Tổ hợp khác → null
 * (caller trả 400). Trọng tâm: ranh giới + tổ hợp mập mờ (5+1 phải là standard, KHÔNG
 * specialCover) + biên trên/dưới.
 */

import { PlayType } from "@megawin/game-lotto535/entities";
import { inferPlayType } from "@megawin/game-lotto535/rules";
import { describe, expect, it } from "vitest";

describe("inferPlayType — khớp playType", () => {
  it("4 chính + 1 ĐB → MainCover4", () => {
    expect(inferPlayType(4, 1)).toBe(PlayType.MainCover4);
  });

  it("5 chính + 1 ĐB → Standard (KHÔNG SpecialCover — specialCover cần ≥2 ĐB)", () => {
    expect(inferPlayType(5, 1)).toBe(PlayType.Standard);
  });

  it("6..15 chính + 1 ĐB → MainCover (biên 6 và 15)", () => {
    expect(inferPlayType(6, 1)).toBe(PlayType.MainCover);
    expect(inferPlayType(10, 1)).toBe(PlayType.MainCover);
    expect(inferPlayType(15, 1)).toBe(PlayType.MainCover);
  });

  it("5 chính + 2..12 ĐB → SpecialCover (biên 2 và 12)", () => {
    expect(inferPlayType(5, 2)).toBe(PlayType.SpecialCover);
    expect(inferPlayType(5, 7)).toBe(PlayType.SpecialCover);
    expect(inferPlayType(5, 12)).toBe(PlayType.SpecialCover);
  });
});

describe("inferPlayType — tổ hợp không hợp lệ → null (caller trả 400)", () => {
  it("16 chính + 1 ĐB (vượt biên mainCover) → null", () => {
    expect(inferPlayType(16, 1)).toBeNull();
  });

  it("5 chính + 13 ĐB (vượt biên specialCover) → null", () => {
    expect(inferPlayType(5, 13)).toBeNull();
  });

  it("4 chính + 2 ĐB (mainCover4 cần đúng 1 ĐB) → null", () => {
    expect(inferPlayType(4, 2)).toBeNull();
  });

  it("6 chính + 2 ĐB (mainCover cần đúng 1 ĐB; specialCover cần đúng 5 chính) → null", () => {
    expect(inferPlayType(6, 2)).toBeNull();
  });

  it("3 chính + 1 ĐB (dưới biên) → null", () => {
    expect(inferPlayType(3, 1)).toBeNull();
  });

  it("0 chính + 0 ĐB → null", () => {
    expect(inferPlayType(0, 0)).toBeNull();
  });

  it("5 chính + 0 ĐB → null (mọi playType cần ≥1 ĐB)", () => {
    expect(inferPlayType(5, 0)).toBeNull();
  });
});

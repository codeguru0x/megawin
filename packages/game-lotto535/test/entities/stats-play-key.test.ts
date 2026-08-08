/**
 * Lotto 5/35 – Unit test: `Lotto535StatsPlayKey` + `toStatsPlayKey`
 *
 * PURE — không DB, không cần quy tắc test staging chung (00-overview.md chỉ áp
 * dụng cho test có I/O). Test type-safety (Q6 review 06/08) + hành vi dẫn xuất
 * key từ board.
 */

import { describe, it, expect } from "vitest";
import { PlayType } from "../../src/entities/enums";
import { Lotto535StatsPlayKey, toStatsPlayKey } from "../../src/entities/betting-stats";

describe("Lotto535StatsPlayKey", () => {
  it("Đúng logic — có đúng 13 giá trị, không trùng nhau", () => {
    const values = Object.values(Lotto535StatsPlayKey);
    expect(values).toHaveLength(13);
    expect(new Set(values).size).toBe(13);
  });

  it("Đúng logic — mọi giá trị tham chiếu PlayType (không plain text tự gõ)", () => {
    // Mọi giá trị PHẢI bắt đầu bằng 1 trong 4 PlayType member — nếu ai đó gõ tay
    // "maincover6" (sai case) hoặc "mainCover16" (N ngoài range), test sẽ CHƯA bắt
    // được lỗi thực thi (giá trị vẫn hợp lệ về mặt string) nhưng ít nhất đảm bảo
    // toàn bộ set giá trị nằm trong 4 tiền tố PlayType hợp lệ.
    const validPrefixes = [PlayType.Standard, PlayType.MainCover4, PlayType.MainCover, PlayType.SpecialCover];
    for (const value of Object.values(Lotto535StatsPlayKey)) {
      const matchesPrefix = validPrefixes.some((p) => value === p || value.startsWith(p));
      expect(matchesPrefix).toBe(true);
    }
  });

  it("Đúng logic — mainCover6..mainCover15 đủ 10 giá trị liên tục", () => {
    const mainCoverKeys = Object.values(Lotto535StatsPlayKey).filter(
      (v) => v.startsWith(PlayType.MainCover) && v !== PlayType.MainCover4,
    );
    expect(mainCoverKeys.sort()).toEqual(
      [6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => `${PlayType.MainCover}${n}`).sort(),
    );
  });
});

describe("toStatsPlayKey", () => {
  it("Đúng logic — board standard → PlayType.Standard", () => {
    expect(toStatsPlayKey({ playType: PlayType.Standard, mainNumbers: ["01", "02", "03", "04", "05"] })).toBe(
      PlayType.Standard,
    );
  });

  it("Đúng logic — board mainCover4 → PlayType.MainCover4 (KHÔNG suy theo mainNumbers.length)", () => {
    expect(toStatsPlayKey({ playType: PlayType.MainCover4, mainNumbers: ["01", "02", "03", "04"] })).toBe(
      PlayType.MainCover4,
    );
  });

  it("Đúng logic — board mainCover 6 số → mainCover6", () => {
    const key = toStatsPlayKey({
      playType: PlayType.MainCover,
      mainNumbers: ["01", "02", "03", "04", "05", "06"],
    });
    expect(key).toBe("mainCover6");
  });

  it("Đúng logic — board mainCover 15 số → mainCover15", () => {
    const mainNumbers = Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, "0"));
    expect(toStatsPlayKey({ playType: PlayType.MainCover, mainNumbers })).toBe("mainCover15");
  });

  it("Đúng logic — board specialCover → PlayType.SpecialCover (không phụ thuộc mainNumbers.length)", () => {
    expect(
      toStatsPlayKey({
        playType: PlayType.SpecialCover,
        mainNumbers: ["01", "02", "03", "04", "05"],
      }),
    ).toBe(PlayType.SpecialCover);
  });

  it("Logic ngược — mainCover với mainNumbers.length ngoài phạm vi khai báo (5 hoặc 16) vẫn trả key theo công thức, không throw (hợp đồng: caller đảm bảo N hợp lệ qua validateSelection trước khi gọi)", () => {
    expect(toStatsPlayKey({ playType: PlayType.MainCover, mainNumbers: ["01", "02", "03", "04", "05"] })).toBe(
      "mainCover5",
    );
    const mainNumbers16 = Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, "0"));
    expect(toStatsPlayKey({ playType: PlayType.MainCover, mainNumbers: mainNumbers16 })).toBe("mainCover16");
  });
});

// ─── Type-level guard (Q6 — R5 rủi ro trong plan p0-01) ───
// Đảm bảo Lotto535StatsPlayKey KHÔNG suy thành `string` (mất union literal type).
// Nếu template literal `${PlayType.MainCover}6` bị suy rộng thành string, dòng
// dưới sẽ KHÔNG báo lỗi và @ts-expect-error trở thành "unused directive" → check-types FAIL.
function assertPlayKeyIsLiteralUnion(): void {
  // @ts-expect-error — "mainCover99" không thuộc union 13 giá trị hợp lệ.
  const invalid: Lotto535StatsPlayKey = "mainCover99";
  void invalid;
}
void assertPlayKeyIsLiteralUnion;

// Record đầy đủ 13 khoá bắt buộc bởi type — thiếu 1 khoá thì check-types FAIL.
function assertRecordRequiresAllKeys(): Record<Lotto535StatsPlayKey, number> {
  return {
    [Lotto535StatsPlayKey.Standard]: 0,
    [Lotto535StatsPlayKey.MainCover4]: 0,
    [Lotto535StatsPlayKey.MainCover6]: 0,
    [Lotto535StatsPlayKey.MainCover7]: 0,
    [Lotto535StatsPlayKey.MainCover8]: 0,
    [Lotto535StatsPlayKey.MainCover9]: 0,
    [Lotto535StatsPlayKey.MainCover10]: 0,
    [Lotto535StatsPlayKey.MainCover11]: 0,
    [Lotto535StatsPlayKey.MainCover12]: 0,
    [Lotto535StatsPlayKey.MainCover13]: 0,
    [Lotto535StatsPlayKey.MainCover14]: 0,
    [Lotto535StatsPlayKey.MainCover15]: 0,
    [Lotto535StatsPlayKey.SpecialCover]: 0,
  };
}
void assertRecordRequiresAllKeys;

/**
 * Lotto 5/35 – Unit test: `ComboStatsRepository.sumJackpotUnitsForStandardSet` (p1-01, RỦI RO)
 *
 * PURE — KHÔNG DB. Spy `findMany` để mô phỏng 3 nhánh truy vấn, KHÔNG chạm staging (đúng
 * `test-data-safety.mdc` — test này không sinh/không xoá data thật). Constructor repo lazy
 * (không connect), spy chặn trước mọi DB access.
 *
 * ## Vì sao test này TỐI QUAN TRỌNG (bug đã phát hiện + fix)
 *
 * `jackpotUnits` là MẪU SỐ chia Jackpot hiển thị cho player — sai = player hiểu sai mức
 * chia. Doc combo lưu `mainNumbers` ĐÃ SORT (accumulator sort trước `buildComboKey`).
 * Nhánh 4 (specialCover) so `mainNumbers` bằng ARRAY-EQUALITY của Mongo (ORDER-SENSITIVE).
 * Handler + use-case truyền `numbers` theo THỨ TỰ CSV player gửi (không sort) → nếu repo
 * không tự sort, nhánh 4 MISS mọi board specialCover phủ bộ chuẩn → undercount.
 *
 * Test mô phỏng Mongo array-equality (chỉ match khi `filter.mainNumbers` == sorted) và
 * truyền input UNSORTED — chứng minh repo phải sort nội bộ để đếm đúng cả 4 nhánh.
 */

import { describe, it, expect, vi } from "vitest";
import { PlayType } from "@megawin/game-lotto535/entities";
import { buildComboKey } from "@megawin/game-lotto535/rules";
import { ComboStatsRepository } from "../../src/infras/repos/combo-stats-repo";

const DRAW_ID = "2999-01-01.001";
const SPECIAL = "07";
const M_UNSORTED = ["34", "01", "23", "05", "12"];
const M_SORTED = ["01", "05", "12", "23", "34"];

function arraysEqual(a: unknown, b: string[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Docs canned cho 4 nhánh — mỗi doc chọn `sets = betCount × expandedLines` để `betCount`
 * suy ra tròn. Kỳ vọng: units = Σ betCount = 3 + 2 + 4 + 5 = 14.
 */
const standardDoc = {
  playType: PlayType.Standard,
  mainNumbers: M_SORTED,
  specialNumbers: [SPECIAL],
  sets: 3, // expandedLines 1 → betCount 3
};
const mc4Doc = {
  playType: PlayType.MainCover4,
  mainNumbers: ["01", "05", "12", "23"], // 4-subset của M
  specialNumbers: [SPECIAL],
  sets: 62, // expandedLines 31 → betCount 2
};
const mainCoverDoc = {
  playType: PlayType.MainCover,
  mainNumbers: [...M_SORTED, "20"], // 6 số ⊇ M
  specialNumbers: [SPECIAL],
  sets: 24, // expandedLines C(6,5)=6 → betCount 4
};
const specialCoverDoc = {
  playType: PlayType.SpecialCover,
  mainNumbers: M_SORTED,
  specialNumbers: [SPECIAL, "09"],
  sets: 10, // expandedLines 2 → betCount 5
};

/**
 * Mock `findMany` mô phỏng Mongo: nhánh specialCover dùng array-equality ORDER-SENSITIVE
 * — chỉ trả doc khi `filter.mainNumbers` deep-equal `M_SORTED`. Nhánh $in/$all
 * order-independent → luôn trả doc.
 */
function stubFindMany(repo: ComboStatsRepository) {
  return vi
    .spyOn(repo as unknown as { findMany: (f: Record<string, unknown>) => Promise<unknown[]> }, "findMany")
    .mockImplementation(async (filter: Record<string, unknown>) => {
      if (filter.comboKey && typeof filter.comboKey === "object") {
        return [standardDoc, mc4Doc];
      }
      if (filter.playType === PlayType.MainCover) {
        return [mainCoverDoc];
      }
      if (filter.playType === PlayType.SpecialCover) {
        return arraysEqual(filter.mainNumbers, M_SORTED) ? [specialCoverDoc] : [];
      }
      return [];
    });
}

describe("sumJackpotUnitsForStandardSet — tổng đúng 4 nhánh + fix order specialCover", () => {
  it("input UNSORTED → nhánh specialCover VẪN match (repo tự sort) → units = 14", async () => {
    const repo = new ComboStatsRepository();
    stubFindMany(repo);

    const units = await repo.sumJackpotUnitsForStandardSet(DRAW_ID, M_UNSORTED, [SPECIAL]);
    // 3 (standard) + 2 (mainCover4) + 4 (mainCover6) + 5 (specialCover) = 14.
    expect(units).toBe(14);
  });

  it("input SORTED → cùng kết quả 14 (đối xứng, không phụ thuộc thứ tự)", async () => {
    const repo = new ComboStatsRepository();
    stubFindMany(repo);

    const units = await repo.sumJackpotUnitsForStandardSet(DRAW_ID, M_SORTED, [SPECIAL]);
    expect(units).toBe(14);
  });

  it("nhánh specialCover PHẢI được gọi với mainNumbers ĐÃ SORT dù input lộn xộn", async () => {
    const repo = new ComboStatsRepository();
    const spy = stubFindMany(repo);

    await repo.sumJackpotUnitsForStandardSet(DRAW_ID, M_UNSORTED, [SPECIAL]);

    const specialCoverCall = spy.mock.calls.find(
      ([filter]) => (filter as Record<string, unknown>).playType === PlayType.SpecialCover,
    );
    expect(specialCoverCall).toBeDefined();
    const filter = specialCoverCall![0] as Record<string, unknown>;
    expect(filter.mainNumbers).toEqual(M_SORTED);
    expect(filter.specialNumbers).toBe(SPECIAL); // scalar → membership s ∈ specialNumbers
  });

  it("nhánh $in (standard+mainCover4) enumerate ĐÚNG 6 key: 1 standard + 5 subset 4/5", async () => {
    const repo = new ComboStatsRepository();
    const spy = stubFindMany(repo);

    await repo.sumJackpotUnitsForStandardSet(DRAW_ID, M_UNSORTED, [SPECIAL]);

    const inCall = spy.mock.calls.find(
      ([filter]) =>
        (filter as Record<string, unknown>).comboKey &&
        typeof (filter as Record<string, unknown>).comboKey === "object",
    );
    const keys = (inCall![0] as { comboKey: { $in: string[] } }).comboKey.$in;
    expect(keys).toHaveLength(6);
    expect(keys[0]).toBe(buildComboKey(PlayType.Standard, M_SORTED, [SPECIAL]));
    // 5 subset bỏ lần lượt 1 số của M (sorted).
    for (let i = 0; i < M_SORTED.length; i++) {
      const subset = M_SORTED.filter((_, j) => j !== i);
      expect(keys).toContain(buildComboKey(PlayType.MainCover4, subset, [SPECIAL]));
    }
  });

  it("mainCover ($all) query bound playType = MainCover + $all mainNumbers sorted", async () => {
    const repo = new ComboStatsRepository();
    const spy = stubFindMany(repo);

    await repo.sumJackpotUnitsForStandardSet(DRAW_ID, M_UNSORTED, [SPECIAL]);

    const allCall = spy.mock.calls.find(
      ([filter]) => (filter as Record<string, unknown>).playType === PlayType.MainCover,
    );
    const filter = allCall![0] as { mainNumbers: { $all: string[] } };
    expect(filter.mainNumbers.$all).toEqual(M_SORTED);
  });

  it("không doc nào phủ (mọi nhánh rỗng) → units = 0", async () => {
    const repo = new ComboStatsRepository();
    vi.spyOn(repo as unknown as { findMany: () => Promise<unknown[]> }, "findMany").mockResolvedValue([]);

    const units = await repo.sumJackpotUnitsForStandardSet(DRAW_ID, M_SORTED, [SPECIAL]);
    expect(units).toBe(0);
  });
});

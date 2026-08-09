/**
 * Lotto 5/35 – Unit test: `Lotto535StatsAccumulator` (pure, delta-only)
 *
 * PURE — không DB, không cần quy tắc test staging chung (00-overview chỉ áp dụng cho test
 * có I/O). Đối chiếu analysis §4.3 — mỗi con số delta tính tay so với công thức. Điểm mấu
 * chốt Lotto 5/35 (khác Power 6/55): 2 chiều số (main + special), 13 play key, comboKey có
 * special.
 */

import { Lotto535NumberKind, PlayType } from "@megawin/game-lotto535/entities";
import { describe, expect, it } from "vitest";

import type { EntryBoardForStats, EntryForStats } from "../../src/infras/repos/types";
import { Lotto535StatsAccumulator, type PrizeContext } from "../../src/use-cases/operations/stats-accumulator";

const DRAW_ID = "2000-01-01.001";
const UNIT_PRICE = 10_000;
const TIER1 = 10_000_000;
const LARGE_BET_AMOUNT = 30_000_000;

const PRIZE: PrizeContext = {
  unitPrice: UNIT_PRICE,
  tier1: TIER1,
  largeBetAmount: LARGE_BET_AMOUNT,
};

function board(overrides: Partial<EntryBoardForStats> = {}): EntryBoardForStats {
  return {
    playType: PlayType.Standard,
    mainNumbers: ["01", "05", "12", "23", "34"],
    specialNumbers: ["07"],
    expandedLines: 1,
    betCount: 1,
    ...overrides,
  };
}

function entry(overrides: Partial<EntryForStats> = {}): EntryForStats {
  const boards = overrides.boards ?? [board()];
  const betUnitCount = overrides.betUnitCount ?? boards.reduce((sum, b) => sum + b.expandedLines * b.betCount, 0);
  return {
    id: "64b000000000000000000001",
    drawId: DRAW_ID,
    tenantId: "tenantA",
    accountId: "acc1",
    username: "user1",
    amount: UNIT_PRICE * betUnitCount,
    betUnitCount,
    commission: 0,
    boards,
    ...overrides,
  };
}

describe("Lotto535StatsAccumulator — đúng logic per playType", () => {
  it("standard 1 board/1 line/betCount 1 — totals/byPlayType/number(5 main+1 special)/combo đúng", () => {
    const acc = new Lotto535StatsAccumulator(DRAW_ID, PRIZE);
    const e = entry();
    acc.addEntry(e);

    const stats = acc.drainStatsDelta();
    expect(stats.totals.revenue).toBe(e.amount);
    expect(stats.totals.entries).toBe(1);
    expect(stats.totals.sets).toBe(1);
    expect(stats.totals.largeBetCount).toBe(0);
    expect(stats.byPlayType[PlayType.Standard]).toEqual({ amount: UNIT_PRICE, sets: 1, boards: 1 });
    expect(stats.fixedWorstCase).toBe(1 * TIER1);

    const numberDeltas = acc.drainNumberDeltas();
    // 5 số chính + 1 số ĐB = 6 doc, KHÔNG expand line.
    expect(numberDeltas).toHaveLength(6);
    const mains = numberDeltas.filter((n) => n.kind === Lotto535NumberKind.Main);
    const specials = numberDeltas.filter((n) => n.kind === Lotto535NumberKind.Special);
    expect(mains).toHaveLength(5);
    expect(specials).toHaveLength(1);
    for (const nd of numberDeltas) {
      // Cộng TRỌN board, không chia đôi main/special.
      expect(nd).toMatchObject({ drawId: DRAW_ID, sets: 1, amount: UNIT_PRICE, boards: 1 });
    }

    const comboDeltas = acc.drainComboDeltas();
    expect(comboDeltas).toHaveLength(1);
    expect(comboDeltas[0]).toMatchObject({
      comboKey: `${PlayType.Standard}:01,05,12,23,34|07`,
      playType: PlayType.Standard,
      mainNumbers: ["01", "05", "12", "23", "34"],
      specialNumbers: ["07"],
      sets: 1,
      amount: UNIT_PRICE,
    });
  });

  it("mainCover15 betCount 2 — sets=3003×2, đúng 15 doc main + 1 special (KHÔNG 3003), key mainCover15", () => {
    const acc = new Lotto535StatsAccumulator(DRAW_ID, PRIZE);
    const main15 = Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, "0"));
    const b = board({
      playType: PlayType.MainCover,
      mainNumbers: main15,
      specialNumbers: ["09"],
      expandedLines: 3003,
      betCount: 2,
    });
    const e = entry({ boards: [b], betUnitCount: 3003 * 2 });
    acc.addEntry(e);

    const stats = acc.drainStatsDelta();
    expect(stats.totals.sets).toBe(3003 * 2);
    expect(stats.byPlayType["mainCover15"]).toEqual({
      amount: 3003 * 2 * UNIT_PRICE,
      sets: 3003 * 2,
      boards: 1, // KHÔNG nhân betCount.
    });
    expect(stats.fixedWorstCase).toBe(3003 * 2 * TIER1);

    const numberDeltas = acc.drainNumberDeltas();
    const mains = numberDeltas.filter((n) => n.kind === Lotto535NumberKind.Main);
    const specials = numberDeltas.filter((n) => n.kind === Lotto535NumberKind.Special);
    expect(mains).toHaveLength(15); // đúng 15 số đã chọn, KHÔNG 3003 lines.
    expect(specials).toHaveLength(1);
    for (const nd of numberDeltas) {
      expect(nd.sets).toBe(3003 * 2);
      expect(nd.amount).toBe(3003 * 2 * UNIT_PRICE);
      expect(nd.boards).toBe(1);
    }

    const comboDeltas = acc.drainComboDeltas();
    expect(comboDeltas).toHaveLength(1); // 1 board = 1 combo doc, KHÔNG C(15,5).
    expect(comboDeltas[0]!.mainNumbers).toHaveLength(15);
  });

  it("specialCover K=12 betCount 1 — 5 main + 12 special number deltas, key SpecialCover (gộp)", () => {
    const acc = new Lotto535StatsAccumulator(DRAW_ID, PRIZE);
    const special12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
    const b = board({
      playType: PlayType.SpecialCover,
      mainNumbers: ["01", "02", "03", "04", "05"],
      specialNumbers: special12,
      expandedLines: 12,
      betCount: 1,
    });
    const e = entry({ boards: [b], betUnitCount: 12 });
    acc.addEntry(e);

    const stats = acc.drainStatsDelta();
    expect(stats.totals.sets).toBe(12);
    expect(stats.byPlayType[PlayType.SpecialCover]).toEqual({
      amount: 12 * UNIT_PRICE,
      sets: 12,
      boards: 1,
    });

    const numberDeltas = acc.drainNumberDeltas();
    expect(numberDeltas.filter((n) => n.kind === Lotto535NumberKind.Main)).toHaveLength(5);
    expect(numberDeltas.filter((n) => n.kind === Lotto535NumberKind.Special)).toHaveLength(12);
  });

  it("mainCover4 — 31 lines, key MainCover4", () => {
    const acc = new Lotto535StatsAccumulator(DRAW_ID, PRIZE);
    const b = board({
      playType: PlayType.MainCover4,
      mainNumbers: ["01", "02", "03", "04"],
      specialNumbers: ["05"],
      expandedLines: 31,
      betCount: 1,
    });
    const e = entry({ boards: [b], betUnitCount: 31 });
    acc.addEntry(e);

    const stats = acc.drainStatsDelta();
    expect(stats.byPlayType[PlayType.MainCover4]).toEqual({
      amount: 31 * UNIT_PRICE,
      sets: 31,
      boards: 1,
    });
    expect(stats.totals.sets).toBe(31);
    // 4 số chính + 1 ĐB.
    const numberDeltas = acc.drainNumberDeltas();
    expect(numberDeltas.filter((n) => n.kind === Lotto535NumberKind.Main)).toHaveLength(4);
    expect(numberDeltas.filter((n) => n.kind === Lotto535NumberKind.Special)).toHaveLength(1);
  });

  it("vé 5 board hỗn hợp — cộng dồn per-board đúng, totals.sets = Σ betUnitCount", () => {
    const acc = new Lotto535StatsAccumulator(DRAW_ID, PRIZE);
    const boards: EntryBoardForStats[] = [
      board({ playType: PlayType.Standard, mainNumbers: ["01", "02", "03", "04", "05"] }),
      board({
        playType: PlayType.MainCover4,
        mainNumbers: ["10", "11", "12", "13"],
        specialNumbers: ["06"],
        expandedLines: 31,
        betCount: 1,
      }),
      board({
        playType: PlayType.MainCover,
        mainNumbers: ["20", "21", "22", "23", "24", "25"],
        specialNumbers: ["06"],
        expandedLines: 6,
        betCount: 1,
      }),
      board({ playType: PlayType.Standard, mainNumbers: ["30", "31", "32", "33", "34"] }),
      board({
        playType: PlayType.SpecialCover,
        mainNumbers: ["01", "02", "03", "04", "05"],
        specialNumbers: ["01", "02", "03"],
        expandedLines: 3,
        betCount: 1,
      }),
    ];
    const totalSets = boards.reduce((s, b) => s + b.expandedLines * b.betCount, 0);
    const e = entry({ boards, betUnitCount: totalSets });
    acc.addEntry(e);

    const stats = acc.drainStatsDelta();
    expect(stats.totals.sets).toBe(totalSets);
    expect(stats.byPlayType[PlayType.Standard]!.boards).toBe(2);
    expect(stats.byPlayType[PlayType.Standard]!.sets).toBe(2);
    expect(stats.byPlayType[PlayType.MainCover4]!.sets).toBe(31);
    expect(stats.byPlayType["mainCover6"]!.sets).toBe(6);
    expect(stats.byPlayType[PlayType.SpecialCover]!.sets).toBe(3);

    // 5 combo doc riêng biệt (2 standard khác số + 3 kiểu khác).
    expect(acc.drainComboDeltas()).toHaveLength(5);
  });

  it("amount >= largeBetAmount → largeBetCount = 1; dưới ngưỡng → 0", () => {
    const accAbove = new Lotto535StatsAccumulator(DRAW_ID, PRIZE);
    accAbove.addEntry(entry({ amount: LARGE_BET_AMOUNT }));
    expect(accAbove.drainStatsDelta().totals.largeBetCount).toBe(1);

    const accBelow = new Lotto535StatsAccumulator(DRAW_ID, PRIZE);
    accBelow.addEntry(entry({ amount: LARGE_BET_AMOUNT - 1 }));
    expect(accBelow.drainStatsDelta().totals.largeBetCount).toBe(0);
  });

  it("2 board cùng bộ số (main+special) + cùng playType từ 2 account → 1 combo delta, 2 combo-account", () => {
    const acc = new Lotto535StatsAccumulator(DRAW_ID, PRIZE);
    const main = ["01", "05", "12", "23", "34"];
    const special = ["07"];

    acc.addEntry(
      entry({
        id: "64b000000000000000000001",
        accountId: "accA",
        username: "userA",
        boards: [board({ mainNumbers: main, specialNumbers: special })],
      }),
    );
    acc.addEntry(
      entry({
        id: "64b000000000000000000002",
        accountId: "accB",
        username: "userB",
        boards: [board({ mainNumbers: main, specialNumbers: special })],
      }),
    );

    const comboDeltas = acc.drainComboDeltas();
    expect(comboDeltas).toHaveLength(1);
    expect(comboDeltas[0]!.sets).toBe(2);
    expect(comboDeltas[0]!.accounts.size).toBe(2);
    expect(comboDeltas[0]!.accounts.get("accA")).toMatchObject({ username: "userA", sets: 1 });
    expect(comboDeltas[0]!.accounts.get("accB")).toMatchObject({ username: "userB", sets: 1 });
  });
});

describe("Lotto535StatsAccumulator — logic ngược/sai (bẫy copy từ Power 6/55)", () => {
  it("mainNumbers/specialNumbers chưa sort → comboKey ổn định VÀ input KHÔNG bị mutate", () => {
    const acc = new Lotto535StatsAccumulator(DRAW_ID, PRIZE);
    const unsortedMain = ["34", "01", "23", "05", "12"];
    const unsortedSpecial = ["07"];
    const b = board({ mainNumbers: unsortedMain, specialNumbers: unsortedSpecial });
    acc.addEntry(entry({ boards: [b] }));

    const comboDeltas = acc.drainComboDeltas();
    expect(comboDeltas[0]!.comboKey).toBe(`${PlayType.Standard}:01,05,12,23,34|07`);
    // Input KHÔNG bị mutate — thứ tự gốc giữ nguyên.
    expect(b.mainNumbers).toEqual(unsortedMain);
    expect(b.specialNumbers).toEqual(unsortedSpecial);
  });

  it("main giống nhau, special khác → 2 combo delta RIÊNG (chiều special tham gia key)", () => {
    const acc = new Lotto535StatsAccumulator(DRAW_ID, PRIZE);
    const main = ["01", "02", "03", "04", "05"];
    acc.addEntry(entry({ boards: [board({ mainNumbers: main, specialNumbers: ["07"] })] }));
    acc.addEntry(entry({ boards: [board({ mainNumbers: main, specialNumbers: ["08"] })] }));
    expect(acc.drainComboDeltas()).toHaveLength(2);
  });

  it("mainCover 6 số vs 7 số → 2 key byPlayType khác nhau (không gộp)", () => {
    const acc = new Lotto535StatsAccumulator(DRAW_ID, PRIZE);
    acc.addEntry(
      entry({
        boards: [
          board({
            playType: PlayType.MainCover,
            mainNumbers: ["01", "02", "03", "04", "05", "06"],
            specialNumbers: ["07"],
            expandedLines: 6,
            betCount: 1,
          }),
        ],
        betUnitCount: 6,
      }),
    );
    acc.addEntry(
      entry({
        boards: [
          board({
            playType: PlayType.MainCover,
            mainNumbers: ["01", "02", "03", "04", "05", "06", "07"],
            specialNumbers: ["08"],
            expandedLines: 21,
            betCount: 1,
          }),
        ],
        betUnitCount: 21,
      }),
    );

    const stats = acc.drainStatsDelta();
    expect(stats.byPlayType["mainCover6"]!.boards).toBe(1);
    expect(stats.byPlayType["mainCover7"]!.boards).toBe(1);
  });
});

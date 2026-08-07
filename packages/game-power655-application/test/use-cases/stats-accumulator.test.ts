import { describe, it, expect } from "vitest";
import { PlayType } from "@megawin/game-power655/entities";
import {
  Power655StatsAccumulator,
  type PrizeContext,
} from "../../src/use-cases/operations/stats-accumulator";
import type { EntryBoardForStats, EntryForStats } from "../../src/infras/repos/types";

const DRAW_ID = "2026-08-05.001";
const UNIT_PRICE = 10_000;
const TIER1 = 40_000_000;
const LARGE_BET_AMOUNT = 30_000_000;

const PRIZE: PrizeContext = {
  unitPrice: UNIT_PRICE,
  tier1: TIER1,
  largeBetAmount: LARGE_BET_AMOUNT,
};

function board(overrides: Partial<EntryBoardForStats> = {}): EntryBoardForStats {
  return {
    playType: PlayType.Standard,
    mainNumbers: ["01", "05", "12", "23", "34", "45"],
    expandedLines: 1,
    betCount: 1,
    ...overrides,
  };
}

function entry(overrides: Partial<EntryForStats> = {}): EntryForStats {
  const boards = overrides.boards ?? [board()];
  const betUnitCount =
    overrides.betUnitCount ?? boards.reduce((sum, b) => sum + b.expandedLines * b.betCount, 0);
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

describe("Power655StatsAccumulator (pure, delta-only)", () => {
  it("entry standard 1 board/1 line/betCount 1 — totals/byPlayType/number/combo đúng, fixedWorstCase = 1 × tier1", () => {
    const acc = new Power655StatsAccumulator(DRAW_ID, PRIZE);
    const e = entry();
    acc.addEntry(e);

    const stats = acc.drainStatsDelta();
    expect(stats.totals.revenue).toBe(e.amount);
    expect(stats.totals.entries).toBe(1);
    expect(stats.totals.sets).toBe(1);
    expect(stats.totals.largeBetCount).toBe(0);
    expect(stats.byPlayType[PlayType.Standard]).toEqual({
      amount: UNIT_PRICE * 1,
      sets: 1,
      boards: 1,
    });
    // fixedWorstCase tính ở CẤP ENTRY = betUnitCount × tier1, KHÔNG theo playType.
    expect(stats.fixedWorstCase).toBe(1 * TIER1);

    const numberDeltas = acc.drainNumberDeltas();
    expect(numberDeltas).toHaveLength(6);
    for (const nd of numberDeltas) {
      expect(nd).toMatchObject({ drawId: DRAW_ID, sets: 1, amount: UNIT_PRICE * 1, boards: 1 });
    }

    const comboDeltas = acc.drainComboDeltas();
    expect(comboDeltas).toHaveLength(1);
    expect(comboDeltas[0]).toMatchObject({
      comboKey: `${PlayType.Standard}:01,05,12,23,34,45`,
      drawId: DRAW_ID,
      playType: PlayType.Standard,
      mainNumbers: ["01", "05", "12", "23", "34", "45"],
      sets: 1,
      amount: UNIT_PRICE * 1,
    });
  });

  it("entry bao18 betCount 2 — sets = 18564×2, 18 number deltas (KHÔNG 18.564), comboKey KHÔNG expand", () => {
    const acc = new Power655StatsAccumulator(DRAW_ID, PRIZE);
    const bao18Numbers = Array.from({ length: 18 }, (_, i) => String(i + 1).padStart(2, "0"));
    const b = board({
      playType: PlayType.Bao18,
      mainNumbers: bao18Numbers,
      expandedLines: 18_564,
      betCount: 2,
    });
    const e = entry({ boards: [b], betUnitCount: 18_564 * 2 });
    acc.addEntry(e);

    const stats = acc.drainStatsDelta();
    expect(stats.totals.sets).toBe(18_564 * 2);
    expect(stats.byPlayType[PlayType.Bao18]).toEqual({
      amount: 18_564 * 2 * UNIT_PRICE,
      sets: 18_564 * 2,
      boards: 1, // KHÔNG nhân betCount — đo số board, không phải số đơn vị cược.
    });
    // fixedWorstCase tính từ betUnitCount CỦA ENTRY (= 18564×2), không theo playType.
    expect(stats.fixedWorstCase).toBe(18_564 * 2 * TIER1);

    const numberDeltas = acc.drainNumberDeltas();
    expect(numberDeltas).toHaveLength(18); // đúng 18 số được chọn, KHÔNG 18.564 lines.
    for (const nd of numberDeltas) {
      expect(nd.sets).toBe(18_564 * 2);
      expect(nd.amount).toBe(18_564 * 2 * UNIT_PRICE);
      expect(nd.boards).toBe(1);
    }

    const comboDeltas = acc.drainComboDeltas();
    expect(comboDeltas).toHaveLength(1); // 1 board Bao 18 = 1 combo doc, KHÔNG C(18,6).
    expect(comboDeltas[0]!.mainNumbers).toHaveLength(18);
    expect(comboDeltas[0]!.sets).toBe(18_564 * 2);
    expect(comboDeltas[0]!.amount).toBe(18_564 * 2 * UNIT_PRICE);
  });

  it("entry 5 board hỗn hợp — cộng dồn per-board đúng, totals.sets = Σ betUnitCount", () => {
    const acc = new Power655StatsAccumulator(DRAW_ID, PRIZE);
    const boards: EntryBoardForStats[] = [
      board({ playType: PlayType.Standard, mainNumbers: ["01", "02", "03", "04", "05", "06"] }),
      board({
        playType: PlayType.Bao5,
        mainNumbers: ["10", "11", "12", "13", "14"],
        expandedLines: 50,
        betCount: 1,
      }),
      board({
        playType: PlayType.Bao7,
        mainNumbers: ["20", "21", "22", "23", "24", "25", "26"],
        expandedLines: 7,
        betCount: 1,
      }),
      board({ playType: PlayType.Standard, mainNumbers: ["30", "31", "32", "33", "34", "35"] }),
      board({
        playType: PlayType.Bao8,
        mainNumbers: ["40", "41", "42", "43", "44", "45", "46", "47"],
        expandedLines: 28,
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
    expect(stats.byPlayType[PlayType.Bao5]!.sets).toBe(50);
    expect(stats.byPlayType[PlayType.Bao7]!.sets).toBe(7);
    expect(stats.byPlayType[PlayType.Bao8]!.sets).toBe(28);

    expect(acc.drainComboDeltas()).toHaveLength(5); // 5 combo doc riêng biệt (bộ số khác nhau).
  });

  it("amount >= largeBetAmount → largeBetCount = 1; dưới ngưỡng → 0", () => {
    const accAbove = new Power655StatsAccumulator(DRAW_ID, PRIZE);
    accAbove.addEntry(entry({ amount: LARGE_BET_AMOUNT }));
    expect(accAbove.drainStatsDelta().totals.largeBetCount).toBe(1);

    const accBelow = new Power655StatsAccumulator(DRAW_ID, PRIZE);
    accBelow.addEntry(entry({ amount: LARGE_BET_AMOUNT - 1 }));
    expect(accBelow.drainStatsDelta().totals.largeBetCount).toBe(0);
  });

  it("2 board cùng bộ số + cùng playType từ 2 account → 1 combo delta, 2 combo-account delta", () => {
    const acc = new Power655StatsAccumulator(DRAW_ID, PRIZE);
    const numbers = ["01", "05", "12", "23", "34", "45"];

    acc.addEntry(
      entry({
        id: "64b000000000000000000001",
        accountId: "accA",
        username: "userA",
        boards: [board({ mainNumbers: numbers })],
      }),
    );
    acc.addEntry(
      entry({
        id: "64b000000000000000000002",
        accountId: "accB",
        username: "userB",
        boards: [board({ mainNumbers: numbers })],
      }),
    );

    const comboDeltas = acc.drainComboDeltas();
    expect(comboDeltas).toHaveLength(1); // cùng comboKey → gộp 1 delta.
    expect(comboDeltas[0]!.sets).toBe(2);
    expect(comboDeltas[0]!.accounts.size).toBe(2); // 2 account riêng biệt trong breakdown.
    expect(comboDeltas[0]!.accounts.get("accA")).toMatchObject({ username: "userA", sets: 1 });
    expect(comboDeltas[0]!.accounts.get("accB")).toMatchObject({ username: "userB", sets: 1 });
  });

  it("mainNumbers chưa sort → comboKey ổn định (đã sort) và input KHÔNG bị mutate", () => {
    const acc = new Power655StatsAccumulator(DRAW_ID, PRIZE);
    const unsorted = ["45", "01", "34", "05", "23", "12"];
    const b = board({ mainNumbers: unsorted });
    acc.addEntry(entry({ boards: [b] }));

    const comboDeltas = acc.drainComboDeltas();
    expect(comboDeltas[0]!.comboKey).toBe(`${PlayType.Standard}:01,05,12,23,34,45`);
    expect(comboDeltas[0]!.mainNumbers).toEqual(["01", "05", "12", "23", "34", "45"]);
    // Input KHÔNG bị mutate — thứ tự gốc giữ nguyên.
    expect(b.mainNumbers).toEqual(unsorted);
  });
});

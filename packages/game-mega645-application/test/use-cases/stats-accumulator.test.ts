/**
 * Mega 6/45 – Unit Tests: Stats Accumulator (p0-02)
 *
 * PURE — không DB. Kiểm chứng toàn bộ phép tính delta của accumulator: nguồn duy nhất
 * quyết định số liệu thống kê worker ghi vào Mongo. Sai ở đây = mọi con số ops/alert sai.
 *
 * Trọng tâm review rủi ro "tính toán sai dữ liệu thống kê":
 * - Cộng dồn revenue/entries/sets/commission đúng Σ.
 * - `largeBetCount` dùng ngưỡng `>=` (không phải `>`).
 * - `fixedWorstCase = Σ(betUnitCount × tier1)`.
 * - `boardSets = expandedLines × betCount`; byPlayType đo BOARD (không nhân betCount).
 * - numberFreq đếm theo board.numbers (KHÔNG expand lines).
 * - combo key theo board, dedupe account, BẤT BIẾN `sets / expandedLines = Σ betCount`
 *   (mẫu số jackpotUnits của p1-01).
 * - Không mutate `board.numbers` của caller.
 */

import { describe, it, expect } from "vitest";
import { PlayType } from "@megawin/game-mega645/entities";
import { buildComboKey, calculateLineCount } from "@megawin/game-mega645/rules";
import { Mega645StatsAccumulator } from "../../src/use-cases/operations/stats-accumulator";
import type { PrizeContext } from "../../src/use-cases/operations/stats-accumulator";
import type { EntryForStats, EntryBoardForStats } from "../../src/infras/repos/types";

const DRAW_ID = "2999-01-01.001"; // sentinel — pure test, không chạm DB nhưng giữ convention
const UNIT_PRICE = 10_000;
const TIER1 = 10_000_000;
const LARGE_BET = 30_000_000;

const PRIZE: PrizeContext = {
  unitPrice: UNIT_PRICE,
  tier1: TIER1,
  largeBetAmount: LARGE_BET,
};

function board(playType: PlayType, numbers: string[], betCount = 1): EntryBoardForStats {
  return {
    playType,
    numbers,
    expandedLines: calculateLineCount(playType),
    betCount,
  };
}

let entrySeq = 0;
function entry(
  overrides: Partial<EntryForStats> & { boards: EntryBoardForStats[] },
): EntryForStats {
  entrySeq += 1;
  // betUnitCount mặc định = Σ(expandedLines × betCount) — khớp cách place-bet tính.
  const betUnitCount =
    overrides.betUnitCount ??
    overrides.boards.reduce((s, b) => s + b.expandedLines * b.betCount, 0);
  const amount = overrides.amount ?? betUnitCount * UNIT_PRICE;
  return {
    id: `entry${entrySeq}`,
    drawId: DRAW_ID,
    tenantId: "tenant-A",
    accountId: "acc-1",
    username: "user1",
    amount,
    betUnitCount,
    commission: overrides.commission ?? 0,
    ...overrides,
  };
}

// ─── Totals: revenue / entries / sets / commission ───────────────────────────

describe("Mega645StatsAccumulator – totals cộng dồn đúng Σ", () => {
  it("2 entry standard → revenue/entries/sets/commission = Σ", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    acc.addEntry(
      entry({
        amount: 10_000,
        commission: 2_000,
        boards: [board(PlayType.Standard, ["01", "02", "03", "04", "05", "06"])],
      }),
    );
    acc.addEntry(
      entry({
        amount: 20_000,
        commission: 4_000,
        boards: [board(PlayType.Standard, ["07", "08", "09", "10", "11", "12"], 2)],
      }),
    );

    const d = acc.drainStatsDelta();
    expect(d.totals.revenue).toBe(30_000);
    expect(d.totals.entries).toBe(2);
    // sets = betUnitCount: entry1 = 1×1 = 1; entry2 = 1×2 = 2 → 3
    expect(d.totals.sets).toBe(3);
    expect(d.totals.commission).toBe(6_000);
  });

  it("INVARIANT: totals.sets == Σ byPlayType.sets", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    acc.addEntry(
      entry({ boards: [board(PlayType.Standard, ["01", "02", "03", "04", "05", "06"], 3)] }),
    );
    acc.addEntry(
      entry({ boards: [board(PlayType.Bao7, ["01", "02", "03", "04", "05", "06", "07"], 2)] }),
    );
    acc.addEntry(entry({ boards: [board(PlayType.Bao5, ["10", "11", "12", "13", "14"])] }));

    const d = acc.drainStatsDelta();
    const sumByPlayType = Object.values(d.byPlayType).reduce((s, v) => s + (v?.sets ?? 0), 0);
    expect(d.totals.sets).toBe(sumByPlayType);
    // Kiểm chứng số học tường minh: 1×3 + 7×2 + 40×1 = 3 + 14 + 40 = 57
    expect(d.totals.sets).toBe(57);
  });
});

// ─── largeBetCount: ngưỡng >= ──────────────────────────────────────────────

describe("Mega645StatsAccumulator – largeBetCount dùng >= (không >)", () => {
  it("amount == ngưỡng → tính là large bet", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    acc.addEntry(
      entry({
        amount: LARGE_BET,
        boards: [board(PlayType.Standard, ["01", "02", "03", "04", "05", "06"])],
      }),
    );
    expect(acc.drainStatsDelta().totals.largeBetCount).toBe(1);
  });

  it("amount = ngưỡng - 1 → KHÔNG tính", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    acc.addEntry(
      entry({
        amount: LARGE_BET - 1,
        boards: [board(PlayType.Standard, ["01", "02", "03", "04", "05", "06"])],
      }),
    );
    expect(acc.drainStatsDelta().totals.largeBetCount).toBe(0);
  });
});

// ─── fixedWorstCase = Σ(betUnitCount × tier1) ──────────────────────────────

describe("Mega645StatsAccumulator – fixedWorstCase", () => {
  it("= Σ(betUnitCount) × tier1", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    // entry1 betUnitCount 1, entry2 bao7 betUnitCount 7 → Σ = 8
    acc.addEntry(
      entry({ boards: [board(PlayType.Standard, ["01", "02", "03", "04", "05", "06"])] }),
    );
    acc.addEntry(
      entry({ boards: [board(PlayType.Bao7, ["01", "02", "03", "04", "05", "06", "07"])] }),
    );

    const d = acc.drainStatsDelta();
    expect(d.fixedWorstCase).toBe(8 * TIER1);
  });
});

// ─── byPlayType: board đo theo BOARD (không nhân betCount), sets nhân betCount ─

describe("Mega645StatsAccumulator – byPlayType (boards vs sets)", () => {
  it("bao7 betCount 5: boards=1 nhưng sets=35 (7×5), amount=350k", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    acc.addEntry(
      entry({ boards: [board(PlayType.Bao7, ["01", "02", "03", "04", "05", "06", "07"], 5)] }),
    );

    const d = acc.drainStatsDelta();
    const stat = d.byPlayType[PlayType.Bao7]!;
    expect(stat.boards).toBe(1); // 1 board vật lý
    expect(stat.sets).toBe(35); // 7 expandedLines × 5 betCount
    expect(stat.amount).toBe(35 * UNIT_PRICE);
  });

  it("2 board cùng playType từ 2 entry → boards=2, sets cộng dồn", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    acc.addEntry(
      entry({ boards: [board(PlayType.Standard, ["01", "02", "03", "04", "05", "06"])] }),
    );
    acc.addEntry(
      entry({ boards: [board(PlayType.Standard, ["07", "08", "09", "10", "11", "12"], 3)] }),
    );

    const stat = acc.drainStatsDelta().byPlayType[PlayType.Standard]!;
    expect(stat.boards).toBe(2);
    expect(stat.sets).toBe(4); // 1 + 3
  });

  it("play type không cược → không xuất hiện trong delta (partial)", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    acc.addEntry(
      entry({ boards: [board(PlayType.Standard, ["01", "02", "03", "04", "05", "06"])] }),
    );
    const d = acc.drainStatsDelta();
    expect(d.byPlayType[PlayType.Standard]).toBeDefined();
    expect(d.byPlayType[PlayType.Bao18]).toBeUndefined();
  });
});

// ─── numberFreq: đếm theo board.numbers, KHÔNG expand lines ──────────────────

describe("Mega645StatsAccumulator – numberFreq (theo board, không expand)", () => {
  it("bao7 (7 số) chạm ĐÚNG 7 doc số — không phải 7 (expanded) lines", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    acc.addEntry(
      entry({ boards: [board(PlayType.Bao7, ["01", "02", "03", "04", "05", "06", "07"], 2)] }),
    );

    const nums = acc.drainNumberDeltas();
    expect(nums).toHaveLength(7);
    // Mỗi số nhận boardSets = 7×2 = 14, amount = 140k, boards = 1
    for (const n of nums) {
      expect(n.sets).toBe(14);
      expect(n.amount).toBe(14 * UNIT_PRICE);
      expect(n.boards).toBe(1);
    }
  });

  it("số xuất hiện ở 2 board → cộng dồn sets/amount/boards", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    acc.addEntry(
      entry({ boards: [board(PlayType.Standard, ["01", "02", "03", "04", "05", "06"])] }),
    );
    acc.addEntry(
      entry({ boards: [board(PlayType.Standard, ["01", "07", "08", "09", "10", "11"])] }),
    );

    const nums = acc.drainNumberDeltas();
    const num01 = nums.find((n) => n.number === "01")!;
    expect(num01.boards).toBe(2);
    expect(num01.sets).toBe(2); // 1 + 1
  });
});

// ─── combo: key theo board + BẤT BIẾN jackpotUnits (p1-01) ───────────────────

describe("Mega645StatsAccumulator – combo delta", () => {
  it("key ổn định bất kể thứ tự số (buildComboKey tự sort)", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    acc.addEntry(
      entry({ boards: [board(PlayType.Standard, ["06", "05", "04", "03", "02", "01"])] }),
    );

    const combos = acc.drainComboDeltas();
    expect(combos).toHaveLength(1);
    expect(combos[0]!.comboKey).toBe(
      buildComboKey(PlayType.Standard, ["01", "02", "03", "04", "05", "06"]),
    );
    expect(combos[0]!.numbers).toEqual(["01", "02", "03", "04", "05", "06"]);
  });

  it("BẤT BIẾN p1-01: combo.sets / expandedLines == Σ betCount", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    // Cùng bộ 6 số standard, 3 entry betCount 2 + 3 + 5 = 10 → sets = 1×10 = 10
    const set6 = ["10", "20", "30", "40", "05", "06"];
    acc.addEntry(entry({ accountId: "a1", boards: [board(PlayType.Standard, set6, 2)] }));
    acc.addEntry(entry({ accountId: "a2", boards: [board(PlayType.Standard, set6, 3)] }));
    acc.addEntry(entry({ accountId: "a3", boards: [board(PlayType.Standard, set6, 5)] }));

    const combos = acc.drainComboDeltas();
    const c = combos.find((x) => x.playType === PlayType.Standard)!;
    expect(c.sets).toBe(10);
    // jackpotUnits = sets / expandedLines = 10 / 1 = 10 = Σ betCount → khớp mẫu số chia JP
    expect(c.sets / calculateLineCount(PlayType.Standard)).toBe(10);
    // 3 account riêng biệt
    expect(c.accounts.size).toBe(3);
  });

  it("bao7 combo: sets / 7 == Σ betCount (mẫu số jackpotUnits qua nhánh superset)", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    const set7 = ["01", "02", "03", "04", "05", "06", "07"];
    acc.addEntry(entry({ boards: [board(PlayType.Bao7, set7, 4)] }));

    const c = acc.drainComboDeltas().find((x) => x.playType === PlayType.Bao7)!;
    expect(c.sets).toBe(28); // 7 × 4
    expect(c.sets / calculateLineCount(PlayType.Bao7)).toBe(4);
  });

  it("cùng account cược combo 2 lần → dedupe 1 account, sets cộng dồn", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    const set6 = ["01", "02", "03", "04", "05", "06"];
    acc.addEntry(
      entry({ accountId: "a1", username: "u1", boards: [board(PlayType.Standard, set6, 1)] }),
    );
    acc.addEntry(
      entry({ accountId: "a1", username: "u1", boards: [board(PlayType.Standard, set6, 4)] }),
    );

    const c = acc.drainComboDeltas().find((x) => x.playType === PlayType.Standard)!;
    expect(c.accounts.size).toBe(1);
    expect(c.accounts.get("a1")!.sets).toBe(5);
  });
});

// ─── An toàn: KHÔNG mutate input board.numbers ──────────────────────────────

describe("Mega645StatsAccumulator – không mutate input", () => {
  it("board.numbers giữ nguyên thứ tự sau accumulate", () => {
    const acc = new Mega645StatsAccumulator(DRAW_ID, PRIZE);
    const original = ["06", "05", "04", "03", "02", "01"];
    const b = board(PlayType.Standard, original);
    acc.addEntry(entry({ boards: [b] }));
    // Accumulator sort trên bản copy → input KHÔNG bị đổi thứ tự.
    expect(b.numbers).toEqual(["06", "05", "04", "03", "02", "01"]);
  });
});

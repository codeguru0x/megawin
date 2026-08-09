import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";

import { BettingStatsMapper } from "../../src/infras/mappers/betting-stats-mapper";

describe("BettingStatsMapper – normalize phía đọc (p0-03)", () => {
  const mapper = new BettingStatsMapper();

  it("doc RỖNG (như ensureDocs mới tạo — chỉ _id/drawId/final/updatedAt) → entity đủ shape", () => {
    const doc = {
      _id: new ObjectId(),
      drawId: "2026-08-02.001",
      final: false,
      updatedAt: new Date("2026-08-02T00:00:00Z"),
    };

    const entity = mapper.mapOne(doc)!;

    expect(entity.totals.revenue).toBe(0);
    expect(entity.totals.entries).toBe(0);
    expect(entity.totals.largeBetCount).toBe(0);
    expect(entity.byPlayType.bigSmall.big.amount).toBe(0);
    expect(entity.byPlayType.evenOdd.odd.sets).toBe(0);
    expect(entity.byPlayType.pick10.sets).toBe(0);
    expect(entity.numberFreq).toEqual({});
    expect(entity.byTenant).toEqual({});
    expect(entity.exposure.worstCaseTotal).toBe(0);
    expect(entity.exposure.capSets.pick10).toBe(0);
    expect(entity.topPotential).toEqual([]);
    expect(entity.lastEntryId).toBeUndefined();
  });

  it("doc PARTIAL (chỉ pick8 + totals.revenue — sau 1 tick chỉ cược pick8) → slot pick8 giữ giá trị, còn lại zero", () => {
    const doc = {
      _id: new ObjectId(),
      drawId: "2026-08-02.002",
      final: false,
      updatedAt: new Date(),
      lastEntryId: "64b000000000000000000001",
      totals: { revenue: 100_000 },
      byPlayType: {
        pick8: { amount: 100_000, sets: 5, entries: 2 },
      },
    };

    const entity = mapper.mapOne(doc)!;

    expect(entity.totals.revenue).toBe(100_000);
    expect(entity.totals.entries).toBe(0); // field không có trong doc → zero
    // `entries` trong doc raw là field CŨ (đã xoá khỏi entity ở Q3) — mapper bỏ qua, không map.
    expect(entity.byPlayType.pick8).toEqual({ amount: 100_000, sets: 5 });
    expect(entity.byPlayType.pick1).toEqual({ amount: 0, sets: 0 });
    expect(entity.byPlayType.bigSmall.small).toEqual({ amount: 0, sets: 0 });
    expect(entity.lastEntryId).toBe("64b000000000000000000001");
  });

  it("doc kỳ đã final (đủ field `sets`, không có field cũ) → mapper đọc thẳng, không cộng gộp", () => {
    const doc = {
      _id: new ObjectId(),
      drawId: "2026-08-02.003",
      final: true,
      updatedAt: new Date(),
      lastEntryId: "64b000000000000000000002",
      totals: {
        revenue: 5_000_000,
        entries: 10,
        sets: 20,
        commission: 100_000,
        largeBetCount: 1,
      },
      byPlayType: {
        pick1: { amount: 1000, sets: 1 },
        pick2: { amount: 0, sets: 0 },
        pick3: { amount: 0, sets: 0 },
        pick4: { amount: 0, sets: 0 },
        pick5: { amount: 0, sets: 0 },
        pick6: { amount: 0, sets: 0 },
        pick7: { amount: 0, sets: 0 },
        pick8: { amount: 0, sets: 0 },
        pick9: { amount: 0, sets: 0 },
        pick10: { amount: 0, sets: 0 },
        bigSmall: {
          big: { amount: 2000, sets: 2 },
          small: { amount: 0, sets: 0 },
          draw: { amount: 0, sets: 0 },
        },
        evenOdd: {
          even: { amount: 0, sets: 0 },
          even1112: { amount: 0, sets: 0 },
          draw: { amount: 0, sets: 0 },
          odd1112: { amount: 0, sets: 0 },
          odd: { amount: 3000, sets: 3 },
        },
      },
      numberFreq: { "01": { sets: 4, amount: 400 } },
      byTenant: { tenantA: { amount: 1000, entries: 1, commission: 50 } },
      exposure: {
        worstCaseByPlayType: { pick8: 100 },
        worstCaseTotal: 100,
        capSets: { pick8: 1, pick9: 0, pick10: 0 },
      },
      topPotential: [
        {
          entryId: "e1",
          accountId: "a1",
          username: "user1",
          amount: 1000,
          potentialWin: 500_000,
        },
      ],
    };

    const entity = mapper.mapOne(doc)!;

    expect(entity.totals).toEqual({
      revenue: 5_000_000,
      entries: 10,
      sets: 20,
      commission: 100_000,
      largeBetCount: 1,
    });
    expect(entity.byPlayType.pick1).toEqual({ amount: 1000, sets: 1 });
    expect(entity.byPlayType.bigSmall.big.amount).toBe(2000);
    expect(entity.byPlayType.evenOdd.odd.amount).toBe(3000);
    expect(entity.numberFreq["01"]).toEqual({ sets: 4, amount: 400 });
    expect(entity.byTenant.tenantA).toEqual({ amount: 1000, entries: 1, commission: 50 });
    expect(entity.exposure.capSets.pick8).toBe(1);
    expect(entity.topPotential).toHaveLength(1);
    expect(entity.topPotential[0]!.potentialWin).toBe(500_000);
  });
});

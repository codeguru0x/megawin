import { PlayType } from "@megawin/game-power655/entities";
import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";

import { BettingStatsMapper } from "../../src/infras/mappers/betting-stats-mapper";

describe("BettingStatsMapper – normalize phía đọc (p0-02, port Keno)", () => {
  const mapper = new BettingStatsMapper();

  it("doc RỖNG (như ensureDocs mới tạo — chỉ _id/drawId/final) → entity đủ 12 key byPlayType zero-value", () => {
    const doc = {
      _id: new ObjectId(),
      drawId: "2026-08-05.001",
      final: false,
    };

    const entity = mapper.mapOne(doc)!;

    expect(entity.totals).toEqual({
      revenue: 0,
      entries: 0,
      sets: 0,
      commission: 0,
      largeBetCount: 0,
    });
    // 12 key cố định — dù doc chưa từng $inc chạm tới.
    expect(Object.keys(entity.byPlayType)).toHaveLength(Object.values(PlayType).length);
    for (const pt of Object.values(PlayType)) {
      expect(entity.byPlayType[pt]).toEqual({ amount: 0, sets: 0, boards: 0 });
    }
    expect(entity.byTenant).toEqual({});
    expect(entity.exposure.fixedWorstCase).toBe(0);
    expect(entity.topPotential).toEqual([]);
    expect(entity.lastEntryId).toBeUndefined();
  });

  it("doc PARTIAL (chỉ standard + bao18, sau vài tick chỉ 2 playType có cược) → 2 slot giữ giá trị, 10 slot còn lại zero", () => {
    const doc = {
      _id: new ObjectId(),
      drawId: "2026-08-05.002",
      final: false,
      lastEntryId: "64b000000000000000000001",
      totals: { revenue: 100_000, sets: 10 },
      byPlayType: {
        standard: { amount: 60_000, sets: 6, boards: 6 },
        bao18: { amount: 371_280_000, sets: 37_128, boards: 2 },
      },
    };

    const entity = mapper.mapOne(doc)!;

    expect(entity.totals.revenue).toBe(100_000);
    expect(entity.totals.entries).toBe(0); // field không có trong doc → zero
    expect(entity.byPlayType[PlayType.Standard]).toEqual({ amount: 60_000, sets: 6, boards: 6 });
    expect(entity.byPlayType[PlayType.Bao18]).toEqual({
      amount: 371_280_000,
      sets: 37_128,
      boards: 2,
    });
    // 10 playType khác chưa từng có delta → zero-stat.
    expect(entity.byPlayType[PlayType.Bao5]).toEqual({ amount: 0, sets: 0, boards: 0 });
    expect(entity.byPlayType[PlayType.Bao13]).toEqual({ amount: 0, sets: 0, boards: 0 });
    expect(entity.lastEntryId).toBe("64b000000000000000000001");
  });

  it("doc kỳ đã final (đủ field) → mapper đọc thẳng, không cộng gộp", () => {
    const doc = {
      _id: new ObjectId(),
      drawId: "2026-08-05.003",
      final: true,
      lastEntryId: "64b000000000000000000002",
      updatedAt: new Date("2026-08-05T18:00:00Z"),
      totals: { revenue: 5_000_000, entries: 10, sets: 20, commission: 100_000, largeBetCount: 1 },
      byPlayType: {
        standard: { amount: 1000, sets: 1, boards: 1 },
        bao7: { amount: 70_000, sets: 7, boards: 1 },
      },
      byTenant: { tenantA: { amount: 1000, entries: 1, commission: 50 } },
      exposure: { fixedWorstCase: 2_500_000_000 },
      topPotential: [
        {
          entryId: "e1",
          accountId: "a1",
          username: "user1",
          amount: 1000,
          fixedPotential: 40_000_000,
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
    expect(entity.byPlayType[PlayType.Standard]).toEqual({ amount: 1000, sets: 1, boards: 1 });
    expect(entity.byPlayType[PlayType.Bao7]).toEqual({ amount: 70_000, sets: 7, boards: 1 });
    expect(entity.byTenant.tenantA).toEqual({ amount: 1000, entries: 1, commission: 50 });
    expect(entity.exposure.fixedWorstCase).toBe(2_500_000_000);
    expect(entity.topPotential).toHaveLength(1);
    expect(entity.topPotential[0]!.fixedPotential).toBe(40_000_000);
    expect(entity.final).toBe(true);
  });
});

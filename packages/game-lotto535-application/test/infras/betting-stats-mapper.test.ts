/**
 * Lotto 5/35 – Unit test: `BettingStatsMapper` (pure, normalize shape phía đọc)
 *
 * PURE — không DB, chỉ gọi `mapOne(doc)`. Mục tiêu (p0-02, rủi ro "doc ghi tối thiểu"):
 * doc từ DB có thể THIẾU bất kỳ nhánh nào (ensureDocs chỉ seed final/updatedAt/lastEntryId;
 * $inc chỉ tạo path được chạm) → mapper PHẢI trả full shape: byPlayType đủ 13 key
 * zero-stat, totals/exposure zero-fill, KHÔNG default `lastEntryId`/`updatedAt` (ngữ nghĩa
 * Mongo $lt/$gt). Đối chiếu JSDoc mapper.
 */

import { Lotto535StatsPlayKey } from "@megawin/game-lotto535/entities";
import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";

import { BettingStatsMapper } from "../../src/infras/mappers/betting-stats-mapper";

const mapper = new BettingStatsMapper();
const DRAW_ID = "2000-01-01.001";

describe("BettingStatsMapper — doc tối thiểu (ensureDocs vừa seed, chưa áp batch)", () => {
  it("thiếu totals/byPlayType/byTenant/exposure/topPotential → zero-fill full shape", () => {
    const oid = new ObjectId();
    const entity = mapper.mapOne({
      _id: oid,
      drawId: DRAW_ID,
      final: false,
      updatedAt: new Date(),
      // KHÔNG có lastEntryId, totals, byPlayType, byTenant, exposure, topPotential.
    })!;

    expect(entity.id).toBe(oid.toHexString());
    expect(entity.drawId).toBe(DRAW_ID);
    expect(entity.final).toBe(false);
    // lastEntryId thiếu → giữ undefined (KHÔNG default) để $lt coi là null.
    expect(entity.lastEntryId).toBeUndefined();

    expect(entity.totals).toEqual({
      revenue: 0,
      entries: 0,
      sets: 0,
      commission: 0,
      largeBetCount: 0,
    });
    expect(entity.exposure).toEqual({ fixedWorstCase: 0 });
    expect(entity.byTenant).toEqual({});
    expect(entity.topPotential).toEqual([]);

    // byPlayType PHẢI đủ 13 key, mỗi key zero-stat.
    const keys = Object.values(Lotto535StatsPlayKey);
    expect(keys).toHaveLength(13);
    for (const key of keys) {
      expect(entity.byPlayType[key]).toEqual({ amount: 0, sets: 0, boards: 0 });
    }
  });

  it("final thiếu → default false", () => {
    const entity = mapper.mapOne({ _id: new ObjectId(), drawId: DRAW_ID, updatedAt: new Date() })!;
    expect(entity.final).toBe(false);
  });
});

describe("BettingStatsMapper — doc một phần (chỉ vài play type có delta)", () => {
  it("chỉ standard + mainCover15 có delta → 2 key giữ giá trị, 11 key còn lại zero", () => {
    const entity = mapper.mapOne({
      _id: new ObjectId(),
      drawId: DRAW_ID,
      final: false,
      updatedAt: new Date(),
      lastEntryId: "64b000000000000000000009",
      totals: { revenue: 100_000, entries: 2, sets: 3004, commission: 0, largeBetCount: 1 },
      byPlayType: {
        [Lotto535StatsPlayKey.Standard]: { amount: 10_000, sets: 1, boards: 1 },
        [Lotto535StatsPlayKey.MainCover15]: { amount: 30_030_000, sets: 3003, boards: 1 },
      },
      exposure: { fixedWorstCase: 30_040_000_000 },
    })!;

    expect(entity.lastEntryId).toBe("64b000000000000000000009");
    expect(entity.byPlayType[Lotto535StatsPlayKey.Standard]).toEqual({
      amount: 10_000,
      sets: 1,
      boards: 1,
    });
    expect(entity.byPlayType[Lotto535StatsPlayKey.MainCover15]).toEqual({
      amount: 30_030_000,
      sets: 3003,
      boards: 1,
    });
    // Key không có trong doc → zero-stat (không undefined).
    expect(entity.byPlayType[Lotto535StatsPlayKey.SpecialCover]).toEqual({
      amount: 0,
      sets: 0,
      boards: 0,
    });
    expect(entity.byPlayType[Lotto535StatsPlayKey.MainCover4]).toEqual({
      amount: 0,
      sets: 0,
      boards: 0,
    });
  });

  it("byTenant field thiếu (chỉ amount) → entries/commission zero-fill per tenant", () => {
    const entity = mapper.mapOne({
      _id: new ObjectId(),
      drawId: DRAW_ID,
      updatedAt: new Date(),
      byTenant: { tenantA: { amount: 50_000 } },
    })!;
    expect(entity.byTenant.tenantA).toEqual({ amount: 50_000, entries: 0, commission: 0 });
  });
});

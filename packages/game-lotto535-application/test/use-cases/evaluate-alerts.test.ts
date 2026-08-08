/**
 * Lotto 5/35 – Unit test: `evaluateAlerts` (pure, 5 rule)
 *
 * PURE — không DB. Đối chiếu analysis §4.4 + JSDoc từng member `Lotto535OpsAlertType`.
 * 5 rule: large_bet, exposure_threshold, combo_concentration, cover_high_stake (đánh giá
 * TỪ byPlayType, giá board = C(N,5)×unitPrice), special_skew (MỚI — đánh giá từ number
 * stats kind=special). Mỗi rule test: dưới ngưỡng → im; chạm ngưỡng → warning; vượt 2× →
 * critical; enabled=false → im. Kèm case "logic ngược" bẫy copy từ Power 6/55.
 */

import type {
  Lotto535DrawBettingStatsEntity,
  Lotto535DrawComboStatsEntity,
  Lotto535DrawNumberStatsEntity,
  Lotto535OpsAlertsConfig,
  Lotto535PlayTypeStat,
} from "@megawin/game-lotto535/entities";
import {
  Lotto535NumberKind,
  Lotto535OpsAlertType,
  Lotto535StatsPlayKey,
  OpsAlertSeverity,
  OpsAlertStatus,
  PlayType,
} from "@megawin/game-lotto535/entities";
import { describe, expect, it } from "vitest";

import { evaluateAlerts } from "../../src/use-cases/operations/evaluate-alerts";

const DRAW_ID = "2000-01-01.001";
const UNIT_PRICE = 10_000;

function baseAlertsConfig(overrides: Partial<Lotto535OpsAlertsConfig> = {}): Lotto535OpsAlertsConfig {
  return {
    largeBetAmount: 30_000_000,
    fixedExposureWarnAmount: 500_000_000,
    comboAccountsWarn: 5,
    coverHighStakeAmount: 10_000_000,
    specialSkewRatio: 0.35,
    specialSkewMinAmount: 50_000_000,
    enabled: {
      [Lotto535OpsAlertType.LargeBet]: true,
      [Lotto535OpsAlertType.ExposureThreshold]: true,
      [Lotto535OpsAlertType.ComboConcentration]: true,
      [Lotto535OpsAlertType.CoverHighStake]: true,
      [Lotto535OpsAlertType.SpecialSkew]: true,
      [Lotto535OpsAlertType.RevenueAnomaly]: false,
      [Lotto535OpsAlertType.SettleStuck]: false,
    },
    ...overrides,
  };
}

function emptyPlayTypeStats(): Lotto535DrawBettingStatsEntity["byPlayType"] {
  return Object.fromEntries(
    Object.values(Lotto535StatsPlayKey).map((k) => [k, { amount: 0, sets: 0, boards: 0 }]),
  ) as Lotto535DrawBettingStatsEntity["byPlayType"];
}

function baseStats(overrides: Partial<Lotto535DrawBettingStatsEntity> = {}): Lotto535DrawBettingStatsEntity {
  return {
    id: "64b000000000000000000000",
    drawId: DRAW_ID,
    final: false,
    totals: { revenue: 0, entries: 0, sets: 0, commission: 0, largeBetCount: 0 },
    byPlayType: emptyPlayTypeStats(),
    byTenant: {},
    exposure: { fixedWorstCase: 0 },
    topPotential: [],
    updatedAt: new Date(),
    createdAt: new Date(),
    lastEntryId: undefined,
    ...overrides,
  } as Lotto535DrawBettingStatsEntity;
}

function baseCombo(overrides: Partial<Lotto535DrawComboStatsEntity> = {}): Lotto535DrawComboStatsEntity {
  return {
    id: "64c000000000000000000000",
    drawId: DRAW_ID,
    comboKey: `${PlayType.Standard}:01,05,12,23,34|07`,
    playType: PlayType.Standard,
    mainNumbers: ["01", "05", "12", "23", "34"],
    specialNumbers: ["07"],
    sets: 5,
    amount: 50_000,
    accountCount: 5,
    lastEntryId: "64b000000000000000000001",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Lotto535DrawComboStatsEntity;
}

function specialNum(
  number: string,
  amount: number,
  overrides: Partial<Lotto535DrawNumberStatsEntity> = {},
): Lotto535DrawNumberStatsEntity {
  return {
    id: `64d0000000000000000000${number}`,
    drawId: DRAW_ID,
    kind: Lotto535NumberKind.Special,
    number,
    sets: 1,
    amount,
    boards: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Lotto535DrawNumberStatsEntity;
}

function setPlayType(
  stats: Lotto535DrawBettingStatsEntity,
  key: Lotto535StatsPlayKey,
  stat: Lotto535PlayTypeStat,
): Lotto535DrawBettingStatsEntity {
  stats.byPlayType[key] = stat;
  return stats;
}

function run(
  overrides: {
    stats?: Lotto535DrawBettingStatsEntity;
    combos?: Lotto535DrawComboStatsEntity[];
    specialNumberStats?: Lotto535DrawNumberStatsEntity[];
    alerts?: Lotto535OpsAlertsConfig;
  } = {},
) {
  return evaluateAlerts({
    drawId: DRAW_ID,
    stats: overrides.stats ?? baseStats(),
    combos: overrides.combos ?? [],
    specialNumberStats: overrides.specialNumberStats ?? [],
    alerts: overrides.alerts ?? baseAlertsConfig(),
    unitPrice: UNIT_PRICE,
  });
}

describe("evaluateAlerts — large_bet", () => {
  it("largeBetCount = 0 → im", () => {
    expect(run().filter((a) => a.type === Lotto535OpsAlertType.LargeBet)).toHaveLength(0);
  });

  it("0 < largeBetCount < 10 → warning, dedupeKey = large_bet, status New", () => {
    const stats = baseStats({
      totals: { revenue: 0, entries: 0, sets: 0, commission: 0, largeBetCount: 3 },
    });
    const a = run({ stats }).find((x) => x.type === Lotto535OpsAlertType.LargeBet)!;
    expect(a.severity).toBe(OpsAlertSeverity.Warning);
    expect(a.dedupeKey).toBe(Lotto535OpsAlertType.LargeBet);
    expect(a.status).toBe(OpsAlertStatus.New);
  });

  it("largeBetCount >= 10 → critical", () => {
    const stats = baseStats({
      totals: { revenue: 0, entries: 0, sets: 0, commission: 0, largeBetCount: 10 },
    });
    const a = run({ stats }).find((x) => x.type === Lotto535OpsAlertType.LargeBet)!;
    expect(a.severity).toBe(OpsAlertSeverity.Critical);
  });

  it("enabled[large_bet]=false → im dù largeBetCount>0", () => {
    const stats = baseStats({
      totals: { revenue: 0, entries: 0, sets: 0, commission: 0, largeBetCount: 10 },
    });
    const alerts = baseAlertsConfig({
      enabled: { ...baseAlertsConfig().enabled, [Lotto535OpsAlertType.LargeBet]: false },
    });
    expect(run({ stats, alerts }).filter((a) => a.type === Lotto535OpsAlertType.LargeBet)).toHaveLength(0);
  });
});

describe("evaluateAlerts — exposure_threshold (so VND tuyệt đối)", () => {
  it("fixedWorstCase < ngưỡng → im", () => {
    const stats = baseStats({ exposure: { fixedWorstCase: 499_999_999 } });
    expect(run({ stats }).filter((a) => a.type === Lotto535OpsAlertType.ExposureThreshold)).toHaveLength(0);
  });

  it("fixedWorstCase = ngưỡng → warning", () => {
    const stats = baseStats({ exposure: { fixedWorstCase: 500_000_000 } });
    const a = run({ stats }).find((x) => x.type === Lotto535OpsAlertType.ExposureThreshold)!;
    expect(a.severity).toBe(OpsAlertSeverity.Warning);
  });

  it("fixedWorstCase >= 2× ngưỡng → critical", () => {
    const stats = baseStats({ exposure: { fixedWorstCase: 1_000_000_000 } });
    const a = run({ stats }).find((x) => x.type === Lotto535OpsAlertType.ExposureThreshold)!;
    expect(a.severity).toBe(OpsAlertSeverity.Critical);
  });

  it("enabled=false → im", () => {
    const stats = baseStats({ exposure: { fixedWorstCase: 5_000_000_000 } });
    const alerts = baseAlertsConfig({
      enabled: { ...baseAlertsConfig().enabled, [Lotto535OpsAlertType.ExposureThreshold]: false },
    });
    expect(run({ stats, alerts }).filter((a) => a.type === Lotto535OpsAlertType.ExposureThreshold)).toHaveLength(0);
  });
});

describe("evaluateAlerts — combo_concentration", () => {
  it("không combo → im", () => {
    expect(run({ combos: [] }).filter((a) => a.type === Lotto535OpsAlertType.ComboConcentration)).toHaveLength(0);
  });

  it("accountCount = ngưỡng → warning, dedupeKey = combo:${comboKey}, payload có specialNumbers", () => {
    const combo = baseCombo({ accountCount: 5 });
    const a = run({ combos: [combo] }).find((x) => x.type === Lotto535OpsAlertType.ComboConcentration)!;
    expect(a.severity).toBe(OpsAlertSeverity.Warning);
    expect(a.dedupeKey).toBe(`combo:${combo.comboKey}`);
    expect(a.payload.specialNumbers).toEqual(["07"]);
  });

  it("accountCount >= 2× ngưỡng → critical", () => {
    const combo = baseCombo({ accountCount: 10 });
    const a = run({ combos: [combo] }).find((x) => x.type === Lotto535OpsAlertType.ComboConcentration)!;
    expect(a.severity).toBe(OpsAlertSeverity.Critical);
  });

  it("enabled=false → im dù combo tập trung", () => {
    const combo = baseCombo({ accountCount: 10 });
    const alerts = baseAlertsConfig({
      enabled: { ...baseAlertsConfig().enabled, [Lotto535OpsAlertType.ComboConcentration]: false },
    });
    expect(
      run({ combos: [combo], alerts }).filter((a) => a.type === Lotto535OpsAlertType.ComboConcentration),
    ).toHaveLength(0);
  });
});

describe("evaluateAlerts — cover_high_stake (đánh giá TỪ byPlayType, giá board = C(N,5)×unitPrice)", () => {
  it("mainCover6 (C(6,5)=6 → 60k board < 10tr) → KHÔNG bật", () => {
    const stats = setPlayType(baseStats(), Lotto535StatsPlayKey.MainCover6, {
      amount: 600_000,
      sets: 60,
      boards: 10,
    });
    expect(run({ stats }).filter((a) => a.type === Lotto535OpsAlertType.CoverHighStake)).toHaveLength(0);
  });

  it("mainCover13 (C(13,5)=1287 → 12,87tr >= 10tr, KHÔNG có mainCover15) → warning", () => {
    const stats = setPlayType(baseStats(), Lotto535StatsPlayKey.MainCover13, {
      amount: 12_870_000,
      sets: 1287,
      boards: 1,
    });
    const a = run({ stats }).find((x) => x.type === Lotto535OpsAlertType.CoverHighStake)!;
    expect(a).toBeDefined();
    expect(a.severity).toBe(OpsAlertSeverity.Warning);
    expect(a.dedupeKey).toBe(Lotto535OpsAlertType.CoverHighStake);
  });

  it("mainCover15 (C(15,5)=3003 → 30,03tr) → critical", () => {
    const stats = setPlayType(baseStats(), Lotto535StatsPlayKey.MainCover15, {
      amount: 30_030_000,
      sets: 3003,
      boards: 1,
    });
    const a = run({ stats }).find((x) => x.type === Lotto535OpsAlertType.CoverHighStake)!;
    expect(a.severity).toBe(OpsAlertSeverity.Critical);
  });

  it("boards = 0 (giá board vượt ngưỡng nhưng chưa có board thật) → KHÔNG bật", () => {
    const stats = setPlayType(baseStats(), Lotto535StatsPlayKey.MainCover15, {
      amount: 0,
      sets: 0,
      boards: 0,
    });
    expect(run({ stats }).filter((a) => a.type === Lotto535OpsAlertType.CoverHighStake)).toHaveLength(0);
  });

  it("enabled=false → im dù mainCover15 boards>0", () => {
    const stats = setPlayType(baseStats(), Lotto535StatsPlayKey.MainCover15, {
      amount: 30_030_000,
      sets: 3003,
      boards: 1,
    });
    const alerts = baseAlertsConfig({
      enabled: { ...baseAlertsConfig().enabled, [Lotto535OpsAlertType.CoverHighStake]: false },
    });
    expect(run({ stats, alerts }).filter((a) => a.type === Lotto535OpsAlertType.CoverHighStake)).toHaveLength(0);
  });
});

describe("evaluateAlerts — special_skew (đánh giá TỪ number stats kind=special)", () => {
  it("Σamount < specialSkewMinAmount → im (chống nhiễu kỳ vắng) dù 1 số chiếm 100%", () => {
    const specials = [specialNum("07", 40_000_000)]; // < 50tr min
    expect(
      run({ specialNumberStats: specials }).filter((a) => a.type === Lotto535OpsAlertType.SpecialSkew),
    ).toHaveLength(0);
  });

  it("Σamount đủ, ratio < 0.35 → im (phân bố đều)", () => {
    // 3 số 20tr mỗi số = 60tr; ratio mỗi số ≈ 0,333 < 0,35.
    const specials = [specialNum("01", 20_000_000), specialNum("02", 20_000_000), specialNum("03", 20_000_000)];
    expect(
      run({ specialNumberStats: specials }).filter((a) => a.type === Lotto535OpsAlertType.SpecialSkew),
    ).toHaveLength(0);
  });

  it("ratio = 0.35..<0.70 → warning, dedupeKey = special_skew:${number}", () => {
    // Số 07 = 35tr / tổng 100tr = 0,35 (chạm ngưỡng).
    const specials = [specialNum("07", 35_000_000), specialNum("01", 33_000_000), specialNum("02", 32_000_000)];
    const a = run({ specialNumberStats: specials }).find((x) => x.type === Lotto535OpsAlertType.SpecialSkew)!;
    expect(a).toBeDefined();
    expect(a.severity).toBe(OpsAlertSeverity.Warning);
    expect(a.dedupeKey).toBe("special_skew:07");
  });

  it("ratio >= 2× (0.70) → critical", () => {
    // Số 07 = 80tr / tổng 100tr = 0,80 >= 0,70.
    const specials = [specialNum("07", 80_000_000), specialNum("01", 20_000_000)];
    const a = run({ specialNumberStats: specials }).find((x) => x.type === Lotto535OpsAlertType.SpecialSkew)!;
    expect(a.severity).toBe(OpsAlertSeverity.Critical);
  });

  it("enabled=false → im dù có skew mạnh", () => {
    const specials = [specialNum("07", 80_000_000), specialNum("01", 20_000_000)];
    const alerts = baseAlertsConfig({
      enabled: { ...baseAlertsConfig().enabled, [Lotto535OpsAlertType.SpecialSkew]: false },
    });
    expect(
      run({ specialNumberStats: specials, alerts }).filter((a) => a.type === Lotto535OpsAlertType.SpecialSkew),
    ).toHaveLength(0);
  });
});

describe("evaluateAlerts — bất biến chung", () => {
  it("mọi alert có status = New, createdAt là Date, drawId đúng", () => {
    const stats = baseStats({
      totals: { revenue: 0, entries: 0, sets: 0, commission: 0, largeBetCount: 1 },
      exposure: { fixedWorstCase: 1_000_000_000 },
    });
    const alerts = run({ stats, combos: [baseCombo({ accountCount: 10 })] });
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(a.status).toBe(OpsAlertStatus.New);
      expect(a.createdAt).toBeInstanceOf(Date);
      expect(a.drawId).toBe(DRAW_ID);
    }
  });
});

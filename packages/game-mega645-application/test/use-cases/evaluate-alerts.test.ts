/**
 * Mega 6/45 – Unit Tests: Alert Evaluator (p0-02)
 *
 * PURE — không DB. Kiểm chứng 4 rule P0 + phân mức severity + BAO_COMBINATIONS indexing
 * (điểm rủi ro port từ Power 6/55: bảng BAO_COMBINATIONS Mega 6/45 keyed theo SỐ, không
 * theo playType → phải qua BAO_NUMBER_COUNT).
 *
 * Trọng tâm review rủi ro "ngăn chặn rủi ro dữ liệu sai chính xác":
 * - Ngưỡng dùng `>=` (chạm ngưỡng = bắn), critical khi ≥ 2× / ≥ 10 / có bao18.
 * - Rule `enabled=false` KHÔNG bắn.
 * - bao_high_stake boardPrice = BAO_COMBINATIONS[N] × unitPrice đúng từng playType.
 * - dedupeKey ổn định để upsert idempotent (không sinh doc trùng).
 */

import { describe, it, expect } from "vitest";
import { OpsAlertSeverity, PlayType, Mega645OpsAlertType } from "@megawin/game-mega645/entities";
import type {
  Mega645DrawBettingStatsEntity,
  Mega645DrawComboStatsEntity,
  Mega645OpsAlertsConfig,
  Mega645PlayTypeStat,
} from "@megawin/game-mega645/entities";
import { evaluateAlerts } from "../../src/use-cases/operations/evaluate-alerts";

const DRAW_ID = "2999-01-01.001";
const UNIT_PRICE = 10_000;

function allEnabled(): Record<Mega645OpsAlertType, boolean> {
  return {
    [Mega645OpsAlertType.LargeBet]: true,
    [Mega645OpsAlertType.ExposureThreshold]: true,
    [Mega645OpsAlertType.ComboConcentration]: true,
    [Mega645OpsAlertType.BaoHighStake]: true,
    [Mega645OpsAlertType.RevenueAnomaly]: true,
    [Mega645OpsAlertType.SettleStuck]: true,
  };
}

function alertsConfig(overrides: Partial<Mega645OpsAlertsConfig> = {}): Mega645OpsAlertsConfig {
  return {
    largeBetAmount: 30_000_000,
    fixedExposureWarnAmount: 500_000_000,
    comboAccountsWarn: 5,
    baoHighStakeAmount: 30_000_000,
    enabled: allEnabled(),
    ...overrides,
  };
}

function emptyByPlayType(): Record<PlayType, Mega645PlayTypeStat> {
  return Object.fromEntries(
    Object.values(PlayType).map((pt) => [pt, { amount: 0, sets: 0, boards: 0 }]),
  ) as Record<PlayType, Mega645PlayTypeStat>;
}

function stats(
  overrides: Partial<Mega645DrawBettingStatsEntity> = {},
): Mega645DrawBettingStatsEntity {
  return {
    id: "stats1",
    drawId: DRAW_ID,
    updatedAt: new Date(),
    final: false,
    lastEntryId: "ffffffffffffffffffffffff",
    totals: { revenue: 0, entries: 0, sets: 0, commission: 0, largeBetCount: 0 },
    byPlayType: emptyByPlayType(),
    byTenant: {},
    exposure: { fixedWorstCase: 0 },
    topPotential: [],
    ...overrides,
  } as Mega645DrawBettingStatsEntity;
}

function combo(overrides: Partial<Mega645DrawComboStatsEntity>): Mega645DrawComboStatsEntity {
  return {
    id: "c1",
    comboKey: "standard:01,02,03,04,05,06",
    drawId: DRAW_ID,
    playType: PlayType.Standard,
    numbers: ["01", "02", "03", "04", "05", "06"],
    sets: 10,
    amount: 100_000,
    accountCount: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Mega645DrawComboStatsEntity;
}

function base(overrides: Partial<Parameters<typeof evaluateAlerts>[0]> = {}) {
  return {
    drawId: DRAW_ID,
    stats: stats(),
    combos: [],
    alerts: alertsConfig(),
    unitPrice: UNIT_PRICE,
    ...overrides,
  };
}

// ─── large_bet ───────────────────────────────────────────────────────────────

describe("evaluateAlerts – large_bet", () => {
  it("largeBetCount > 0 → bắn warning", () => {
    const out = evaluateAlerts(
      base({
        stats: stats({
          totals: { revenue: 0, entries: 1, sets: 1, commission: 0, largeBetCount: 3 },
        }),
      }),
    );
    const a = out.find((x) => x.type === Mega645OpsAlertType.LargeBet)!;
    expect(a).toBeDefined();
    expect(a.severity).toBe(OpsAlertSeverity.Warning);
  });

  it("largeBetCount >= 10 → critical", () => {
    const out = evaluateAlerts(
      base({
        stats: stats({
          totals: { revenue: 0, entries: 1, sets: 1, commission: 0, largeBetCount: 10 },
        }),
      }),
    );
    const a = out.find((x) => x.type === Mega645OpsAlertType.LargeBet)!;
    expect(a.severity).toBe(OpsAlertSeverity.Critical);
  });

  it("largeBetCount = 0 → KHÔNG bắn", () => {
    const out = evaluateAlerts(base());
    expect(out.find((x) => x.type === Mega645OpsAlertType.LargeBet)).toBeUndefined();
  });

  it("enabled=false → KHÔNG bắn dù largeBetCount > 0", () => {
    const out = evaluateAlerts(
      base({
        stats: stats({
          totals: { revenue: 0, entries: 1, sets: 1, commission: 0, largeBetCount: 5 },
        }),
        alerts: alertsConfig({
          enabled: { ...allEnabled(), [Mega645OpsAlertType.LargeBet]: false },
        }),
      }),
    );
    expect(out.find((x) => x.type === Mega645OpsAlertType.LargeBet)).toBeUndefined();
  });
});

// ─── exposure_threshold ───────────────────────────────────────────────────────

describe("evaluateAlerts – exposure_threshold", () => {
  it("fixedWorstCase == ngưỡng → bắn warning (>=)", () => {
    const out = evaluateAlerts(
      base({ stats: stats({ exposure: { fixedWorstCase: 500_000_000 } }) }),
    );
    const a = out.find((x) => x.type === Mega645OpsAlertType.ExposureThreshold)!;
    expect(a.severity).toBe(OpsAlertSeverity.Warning);
  });

  it("fixedWorstCase >= 2× ngưỡng → critical", () => {
    const out = evaluateAlerts(
      base({ stats: stats({ exposure: { fixedWorstCase: 1_000_000_000 } }) }),
    );
    const a = out.find((x) => x.type === Mega645OpsAlertType.ExposureThreshold)!;
    expect(a.severity).toBe(OpsAlertSeverity.Critical);
  });

  it("fixedWorstCase = ngưỡng - 1 → KHÔNG bắn", () => {
    const out = evaluateAlerts(
      base({ stats: stats({ exposure: { fixedWorstCase: 499_999_999 } }) }),
    );
    expect(out.find((x) => x.type === Mega645OpsAlertType.ExposureThreshold)).toBeUndefined();
  });
});

// ─── combo_concentration ──────────────────────────────────────────────────────

describe("evaluateAlerts – combo_concentration", () => {
  it("accountCount == warn → warning, dedupeKey theo comboKey", () => {
    const out = evaluateAlerts(
      base({ combos: [combo({ accountCount: 5, comboKey: "standard:01,02,03,04,05,06" })] }),
    );
    const a = out.find((x) => x.type === Mega645OpsAlertType.ComboConcentration)!;
    expect(a.severity).toBe(OpsAlertSeverity.Warning);
    expect(a.dedupeKey).toBe("combo:standard:01,02,03,04,05,06");
  });

  it("accountCount >= 2× warn → critical", () => {
    const out = evaluateAlerts(base({ combos: [combo({ accountCount: 10 })] }));
    const a = out.find((x) => x.type === Mega645OpsAlertType.ComboConcentration)!;
    expect(a.severity).toBe(OpsAlertSeverity.Critical);
  });

  it("nhiều combo vượt ngưỡng → mỗi combo 1 alert (dedupeKey riêng)", () => {
    const out = evaluateAlerts(
      base({
        combos: [
          combo({ accountCount: 5, comboKey: "standard:01,02,03,04,05,06" }),
          combo({
            accountCount: 6,
            comboKey: "bao7:01,02,03,04,05,06,07",
            playType: PlayType.Bao7,
          }),
        ],
      }),
    );
    const alerts = out.filter((x) => x.type === Mega645OpsAlertType.ComboConcentration);
    expect(alerts).toHaveLength(2);
    expect(new Set(alerts.map((a) => a.dedupeKey)).size).toBe(2);
  });
});

// ─── bao_high_stake — điểm rủi ro BAO_COMBINATIONS indexing ────────────────────

describe("evaluateAlerts – bao_high_stake (BAO_COMBINATIONS[N] × unitPrice)", () => {
  function withBaoBoards(pts: PlayType[]): Mega645DrawBettingStatsEntity {
    const bpt = emptyByPlayType();
    for (const pt of pts) {
      bpt[pt] = { amount: 1, sets: 1, boards: 1 };
    }
    return stats({ byPlayType: bpt });
  }

  it("bao14 (3003 lines × 10k = 30,03tr) >= 30tr → bắn", () => {
    const out = evaluateAlerts(base({ stats: withBaoBoards([PlayType.Bao14]) }));
    const a = out.find((x) => x.type === Mega645OpsAlertType.BaoHighStake)!;
    expect(a).toBeDefined();
    expect(a.severity).toBe(OpsAlertSeverity.Warning); // không có bao18
    const triggered = (
      a.payload as { triggered: Array<{ playType: PlayType; boardPrice: number }> }
    ).triggered;
    expect(triggered[0]!.boardPrice).toBe(3003 * UNIT_PRICE);
  });

  it("bao13 (1716 lines × 10k = 17,16tr) < 30tr → KHÔNG bắn", () => {
    const out = evaluateAlerts(base({ stats: withBaoBoards([PlayType.Bao13]) }));
    expect(out.find((x) => x.type === Mega645OpsAlertType.BaoHighStake)).toBeUndefined();
  });

  it("bao18 (18564 × 10k = 185,64tr) → critical", () => {
    const out = evaluateAlerts(base({ stats: withBaoBoards([PlayType.Bao18]) }));
    const a = out.find((x) => x.type === Mega645OpsAlertType.BaoHighStake)!;
    expect(a.severity).toBe(OpsAlertSeverity.Critical);
    const triggered = (
      a.payload as { triggered: Array<{ playType: PlayType; boardPrice: number }> }
    ).triggered;
    expect(triggered.find((t) => t.playType === PlayType.Bao18)!.boardPrice).toBe(
      18564 * UNIT_PRICE,
    );
  });

  it("boards = 0 → KHÔNG bắn dù playType trong nhóm", () => {
    const bpt = emptyByPlayType();
    bpt[PlayType.Bao18] = { amount: 0, sets: 0, boards: 0 };
    const out = evaluateAlerts(base({ stats: stats({ byPlayType: bpt }) }));
    expect(out.find((x) => x.type === Mega645OpsAlertType.BaoHighStake)).toBeUndefined();
  });

  it("gộp 1 alert cho draw dù nhiều bao playType cùng vượt ngưỡng", () => {
    const out = evaluateAlerts(
      base({ stats: withBaoBoards([PlayType.Bao14, PlayType.Bao15, PlayType.Bao18]) }),
    );
    const alerts = out.filter((x) => x.type === Mega645OpsAlertType.BaoHighStake);
    expect(alerts).toHaveLength(1); // gộp
    const triggered = (alerts[0]!.payload as { triggered: unknown[] }).triggered;
    expect(triggered).toHaveLength(3);
  });
});

// ─── Tổng thể: enabled toàn bộ, nhiều rule cùng bắn ────────────────────────────

describe("evaluateAlerts – tổng thể", () => {
  it("không rule nào enabled → mảng rỗng", () => {
    const disabled = Object.fromEntries(
      Object.values(Mega645OpsAlertType).map((t) => [t, false]),
    ) as Record<Mega645OpsAlertType, boolean>;
    const out = evaluateAlerts(
      base({
        stats: stats({
          totals: { revenue: 0, entries: 1, sets: 1, commission: 0, largeBetCount: 5 },
          exposure: { fixedWorstCase: 1_000_000_000 },
        }),
        combos: [combo({ accountCount: 10 })],
        alerts: alertsConfig({ enabled: disabled }),
      }),
    );
    expect(out).toHaveLength(0);
  });
});

import type {
  Power655DrawBettingStatsEntity,
  Power655DrawComboStatsEntity,
  Power655OpsAlertsConfig,
} from "@megawin/game-power655/entities";
import { OpsAlertSeverity, OpsAlertStatus, PlayType, Power655OpsAlertType } from "@megawin/game-power655/entities";
import { describe, expect, it } from "vitest";

import { evaluateAlerts } from "../../src/use-cases/operations/evaluate-alerts";

const DRAW_ID = "2026-08-05.001";
const UNIT_PRICE = 10_000;

function baseAlertsConfig(overrides: Partial<Power655OpsAlertsConfig> = {}): Power655OpsAlertsConfig {
  return {
    largeBetAmount: 30_000_000,
    fixedExposureWarnAmount: 2_000_000_000,
    comboAccountsWarn: 5,
    baoHighStakeAmount: 30_000_000,
    enabled: {
      [Power655OpsAlertType.LargeBet]: true,
      [Power655OpsAlertType.ExposureThreshold]: true,
      [Power655OpsAlertType.ComboConcentration]: true,
      [Power655OpsAlertType.BaoHighStake]: true,
      [Power655OpsAlertType.RevenueAnomaly]: false,
      [Power655OpsAlertType.SettleStuck]: false,
    },
    ...overrides,
  };
}

function emptyPlayTypeStats(): Power655DrawBettingStatsEntity["byPlayType"] {
  return Object.fromEntries(
    Object.values(PlayType).map((pt) => [pt, { amount: 0, sets: 0, boards: 0 }]),
  ) as Power655DrawBettingStatsEntity["byPlayType"];
}

function baseStats(overrides: Partial<Power655DrawBettingStatsEntity> = {}): Power655DrawBettingStatsEntity {
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
  } as Power655DrawBettingStatsEntity;
}

function baseCombo(overrides: Partial<Power655DrawComboStatsEntity> = {}): Power655DrawComboStatsEntity {
  return {
    id: "64c000000000000000000000",
    drawId: DRAW_ID,
    comboKey: `${PlayType.Standard}:01,05,12,23,34,45`,
    playType: PlayType.Standard,
    mainNumbers: ["01", "05", "12", "23", "34", "45"],
    sets: 5,
    amount: 50_000,
    accountCount: 5,
    lastEntryId: "64b000000000000000000001",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Power655DrawComboStatsEntity;
}

describe("evaluateAlerts — Power 6/55 (4 rule: large_bet, exposure_threshold, combo_concentration, bao_high_stake)", () => {
  describe("large_bet", () => {
    it("largeBetCount = 0 → không bắn alert", () => {
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats: baseStats(),
        combos: [],
        alerts: baseAlertsConfig(),
        unitPrice: UNIT_PRICE,
      });
      expect(alerts.filter((a) => a.type === Power655OpsAlertType.LargeBet)).toHaveLength(0);
    });

    it("largeBetCount > 0, < 10 → warning", () => {
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats: baseStats({
          totals: { revenue: 0, entries: 0, sets: 0, commission: 0, largeBetCount: 3 },
        }),
        combos: [],
        alerts: baseAlertsConfig(),
        unitPrice: UNIT_PRICE,
      });
      const alert = alerts.find((a) => a.type === Power655OpsAlertType.LargeBet)!;
      expect(alert.severity).toBe(OpsAlertSeverity.Warning);
      expect(alert.dedupeKey).toBe(Power655OpsAlertType.LargeBet);
      expect(alert.status).toBe(OpsAlertStatus.New);
    });

    it("largeBetCount >= 10 → critical", () => {
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats: baseStats({
          totals: { revenue: 0, entries: 0, sets: 0, commission: 0, largeBetCount: 10 },
        }),
        combos: [],
        alerts: baseAlertsConfig(),
        unitPrice: UNIT_PRICE,
      });
      const alert = alerts.find((a) => a.type === Power655OpsAlertType.LargeBet)!;
      expect(alert.severity).toBe(OpsAlertSeverity.Critical);
    });

    it("enabled[large_bet] = false → không bắn dù largeBetCount > 0", () => {
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats: baseStats({
          totals: { revenue: 0, entries: 0, sets: 0, commission: 0, largeBetCount: 10 },
        }),
        combos: [],
        alerts: baseAlertsConfig({
          enabled: { ...baseAlertsConfig().enabled, [Power655OpsAlertType.LargeBet]: false },
        }),
        unitPrice: UNIT_PRICE,
      });
      expect(alerts.filter((a) => a.type === Power655OpsAlertType.LargeBet)).toHaveLength(0);
    });
  });

  describe("exposure_threshold", () => {
    it("fixedWorstCase < ngưỡng → không bắn", () => {
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats: baseStats({ exposure: { fixedWorstCase: 1_999_999_999 } }),
        combos: [],
        alerts: baseAlertsConfig(),
        unitPrice: UNIT_PRICE,
      });
      expect(alerts.filter((a) => a.type === Power655OpsAlertType.ExposureThreshold)).toHaveLength(0);
    });

    it("fixedWorstCase = ngưỡng → warning", () => {
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats: baseStats({ exposure: { fixedWorstCase: 2_000_000_000 } }),
        combos: [],
        alerts: baseAlertsConfig(),
        unitPrice: UNIT_PRICE,
      });
      const alert = alerts.find((a) => a.type === Power655OpsAlertType.ExposureThreshold)!;
      expect(alert.severity).toBe(OpsAlertSeverity.Warning);
    });

    it("fixedWorstCase >= 2× ngưỡng → critical", () => {
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats: baseStats({ exposure: { fixedWorstCase: 4_000_000_000 } }),
        combos: [],
        alerts: baseAlertsConfig(),
        unitPrice: UNIT_PRICE,
      });
      const alert = alerts.find((a) => a.type === Power655OpsAlertType.ExposureThreshold)!;
      expect(alert.severity).toBe(OpsAlertSeverity.Critical);
    });

    it("enabled[exposure_threshold] = false → không bắn", () => {
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats: baseStats({ exposure: { fixedWorstCase: 5_000_000_000 } }),
        combos: [],
        alerts: baseAlertsConfig({
          enabled: {
            ...baseAlertsConfig().enabled,
            [Power655OpsAlertType.ExposureThreshold]: false,
          },
        }),
        unitPrice: UNIT_PRICE,
      });
      expect(alerts.filter((a) => a.type === Power655OpsAlertType.ExposureThreshold)).toHaveLength(0);
    });
  });

  describe("combo_concentration", () => {
    it("không có combo tập trung → không bắn", () => {
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats: baseStats(),
        combos: [],
        alerts: baseAlertsConfig(),
        unitPrice: UNIT_PRICE,
      });
      expect(alerts.filter((a) => a.type === Power655OpsAlertType.ComboConcentration)).toHaveLength(0);
    });

    it("accountCount = comboAccountsWarn → warning, dedupeKey = combo:${comboKey}", () => {
      const combo = baseCombo({ accountCount: 5 });
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats: baseStats(),
        combos: [combo],
        alerts: baseAlertsConfig(),
        unitPrice: UNIT_PRICE,
      });
      const alert = alerts.find((a) => a.type === Power655OpsAlertType.ComboConcentration)!;
      expect(alert.severity).toBe(OpsAlertSeverity.Warning);
      expect(alert.dedupeKey).toBe(`combo:${combo.comboKey}`);
    });

    it("accountCount >= 2× ngưỡng → critical", () => {
      const combo = baseCombo({ accountCount: 10 });
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats: baseStats(),
        combos: [combo],
        alerts: baseAlertsConfig(),
        unitPrice: UNIT_PRICE,
      });
      const alert = alerts.find((a) => a.type === Power655OpsAlertType.ComboConcentration)!;
      expect(alert.severity).toBe(OpsAlertSeverity.Critical);
    });

    it("enabled[combo_concentration] = false → không bắn dù combo tập trung", () => {
      const combo = baseCombo({ accountCount: 10 });
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats: baseStats(),
        combos: [combo],
        alerts: baseAlertsConfig({
          enabled: {
            ...baseAlertsConfig().enabled,
            [Power655OpsAlertType.ComboConcentration]: false,
          },
        }),
        unitPrice: UNIT_PRICE,
      });
      expect(alerts.filter((a) => a.type === Power655OpsAlertType.ComboConcentration)).toHaveLength(0);
    });
  });

  describe("bao_high_stake — đánh giá TỪ byPlayType", () => {
    it("bao13 (giá board 17,16tr < 30tr) → KHÔNG bật", () => {
      const stats = baseStats();
      stats.byPlayType[PlayType.Bao13] = { amount: 100_000, sets: 10, boards: 1 };
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats,
        combos: [],
        alerts: baseAlertsConfig(),
        unitPrice: UNIT_PRICE,
      });
      expect(alerts.filter((a) => a.type === Power655OpsAlertType.BaoHighStake)).toHaveLength(0);
    });

    it("bao14 (giá board 30,03tr >= 30tr) → bật, warning (không có bao18)", () => {
      const stats = baseStats();
      stats.byPlayType[PlayType.Bao14] = { amount: 100_000, sets: 10, boards: 1 };
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats,
        combos: [],
        alerts: baseAlertsConfig(),
        unitPrice: UNIT_PRICE,
      });
      const alert = alerts.find((a) => a.type === Power655OpsAlertType.BaoHighStake)!;
      expect(alert).toBeDefined();
      expect(alert.severity).toBe(OpsAlertSeverity.Warning);
      expect(alert.dedupeKey).toBe(Power655OpsAlertType.BaoHighStake);
    });

    it("có board bao18 → critical", () => {
      const stats = baseStats();
      stats.byPlayType[PlayType.Bao18] = { amount: 100_000, sets: 10, boards: 1 };
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats,
        combos: [],
        alerts: baseAlertsConfig(),
        unitPrice: UNIT_PRICE,
      });
      const alert = alerts.find((a) => a.type === Power655OpsAlertType.BaoHighStake)!;
      expect(alert.severity).toBe(OpsAlertSeverity.Critical);
    });

    it("boards = 0 (chưa có board nào) → không bật dù giá board vượt ngưỡng", () => {
      const stats = baseStats(); // byPlayType mọi key boards = 0
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats,
        combos: [],
        alerts: baseAlertsConfig(),
        unitPrice: UNIT_PRICE,
      });
      expect(alerts.filter((a) => a.type === Power655OpsAlertType.BaoHighStake)).toHaveLength(0);
    });

    it("enabled[bao_high_stake] = false → không bắn dù có board bao18", () => {
      const stats = baseStats();
      stats.byPlayType[PlayType.Bao18] = { amount: 100_000, sets: 10, boards: 1 };
      const alerts = evaluateAlerts({
        drawId: DRAW_ID,
        stats,
        combos: [],
        alerts: baseAlertsConfig({
          enabled: { ...baseAlertsConfig().enabled, [Power655OpsAlertType.BaoHighStake]: false },
        }),
        unitPrice: UNIT_PRICE,
      });
      expect(alerts.filter((a) => a.type === Power655OpsAlertType.BaoHighStake)).toHaveLength(0);
    });
  });

  it("mọi alert sinh ra có status = New, createdAt là Date hợp lệ", () => {
    const stats = baseStats({
      totals: { revenue: 0, entries: 0, sets: 0, commission: 0, largeBetCount: 1 },
    });
    const alerts = evaluateAlerts({
      drawId: DRAW_ID,
      stats,
      combos: [],
      alerts: baseAlertsConfig(),
      unitPrice: UNIT_PRICE,
    });
    for (const a of alerts) {
      expect(a.status).toBe(OpsAlertStatus.New);
      expect(a.createdAt).toBeInstanceOf(Date);
      expect(a.drawId).toBe(DRAW_ID);
    }
  });
});

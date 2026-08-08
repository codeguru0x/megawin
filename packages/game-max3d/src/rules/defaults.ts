/**
 * Max 3D – Default Configuration Values
 *
 * Giá trị mặc định cho global game config. Dùng khi seed database.
 * Tất cả giải thưởng cố định (không có Jackpot tích lũy).
 *
 * Giải thưởng áp dụng cho 1 lần tham gia mệnh giá 10.000 VND.
 */

import { Max3dOpsAlertType } from "../entities/ops-alert";
import type { FinancialRates, Max3dPrizeConfig, OpsConfig, PlayRules } from "../entities/types";

export const DEFAULT_MAX3D_CONFIG: {
  rates: FinancialRates;
  defaultPrizes: Max3dPrizeConfig;
  play: PlayRules;
  ops: OpsConfig;
} = {
  rates: {
    defaultCommissionRate: 0.2,
  },
  defaultPrizes: {
    basic: {
      special: 1_000_000,
      first: 350_000,
      second: 210_000,
      third: 100_000,
    },
    combo: {
      combo3: {
        special: 340_000,
        first: 120_000,
        second: 70_000,
        third: 30_000,
      },
      combo6: {
        special: 170_000,
        first: 60_000,
        second: 35_000,
        third: 15_000,
      },
    },
    plus: {
      special: 1_000_000_000,
      first: 40_000_000,
      second: 10_000_000,
      third: 5_000_000,
      fourth: 1_000_000,
      fifth: 150_000,
      sixth: 40_000,
    },
  },
  play: {
    unitPrice: 10_000,
    minBetCount: 1,
    maxBetCount: 10,
    maxBoardsPerTicket: 4,
    maxDrawCount: 6,
    salesCloseBeforeMinutes: 5,
    drawsPerDay: 1,
    drawTimes: ["18:00"],
    drawDaysOfWeek: [1, 3, 5],
  },
  /**
   * Cấu hình vận hành mặc định (analysis max3d-ops §3.6, ngưỡng chốt 30/07/2026).
   * Ngưỡng TUYỆT ĐỐI VND (không có cap kỳ / revenue ổn định làm mẫu số).
   * tickSeconds 30 (chốt §7 Q3 — 3 kỳ/tuần, kỳ bán nhiều ngày, không cần nhịp 10s).
   */
  ops: {
    alerts: {
      largeBetAmount: 5_000_000,
      exposureWarnAmount: 5_000_000_000,
      pairLiabilityWarnAmount: 2_000_000_000,
      comboAccountsWarn: 5,
      enabled: {
        [Max3dOpsAlertType.LargeBet]: true,
        [Max3dOpsAlertType.ExposureThreshold]: true,
        [Max3dOpsAlertType.PairLiability]: true,
        [Max3dOpsAlertType.ComboConcentration]: true,
        // Để dành — không bắn ở P0.
        [Max3dOpsAlertType.RevenueAnomaly]: false,
        [Max3dOpsAlertType.SettleStuck]: false,
      },
    },
    stats: {
      tickSeconds: 30,
      topCombosK: 100,
      topPotentialK: 50,
      topAccountsK: 50,
    },
  },
};

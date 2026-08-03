/**
 * Max 3D Pro – Default Configuration Values
 *
 * Giá trị mặc định cho global game config. Dùng khi seed database.
 * Tất cả giải thưởng cố định (không có Jackpot tích lũy).
 *
 * Giải thưởng áp dụng cho 1 lần tham gia mệnh giá 10.000 VND.
 * Giải thưởng dành cho vé gồm 2 bộ ba số KHÁC NHAU.
 *
 * Max 3D Pro quay vào thứ 3, thứ 5, thứ 7 (drawDaysOfWeek = [2, 4, 6])
 * lúc 18h00.
 */

import type { FinancialRates, Max3dproPrizeConfig, OpsConfig, PlayRules } from "../entities/types";
import { Max3dproOpsAlertType } from "../entities/ops-alert";

export const DEFAULT_MAX3D_PRO_CONFIG: {
  rates: FinancialRates;
  defaultPrizes: Max3dproPrizeConfig;
  play: PlayRules;
  ops: OpsConfig;
} = {
  rates: {
    defaultCommissionRate: 0.2,
  },
  defaultPrizes: {
    standard: {
      special: 2_000_000_000,
      specialSub: 400_000_000,
      first: 30_000_000,
      second: 10_000_000,
      third: 4_000_000,
      fourth: 1_000_000,
      fifth: 100_000,
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
    drawDaysOfWeek: [2, 4, 6],
  },
  /**
   * Cấu hình vận hành mặc định (analysis max3dpro-ops §3.6, ngưỡng chốt 30/07/2026).
   * KHÁC Max 3D: largeBet 10tr (multiNumber 20 bộ = 3,8tr/kỳ betCount 1 — 5tr sẽ noise);
   * pairLiability 4 tỷ (ĐB Pro 2 tỷ/unit). tickSeconds 30 (3 kỳ/tuần, bán nhiều ngày).
   */
  ops: {
    alerts: {
      largeBetAmount: 10_000_000,
      exposureWarnAmount: 5_000_000_000,
      pairLiabilityWarnAmount: 4_000_000_000,
      comboAccountsWarn: 5,
      enabled: {
        [Max3dproOpsAlertType.LargeBet]: true,
        [Max3dproOpsAlertType.ExposureThreshold]: true,
        [Max3dproOpsAlertType.PairLiability]: true,
        [Max3dproOpsAlertType.ComboConcentration]: true,
        // Để dành — không bắn ở P0.
        [Max3dproOpsAlertType.RevenueAnomaly]: false,
        [Max3dproOpsAlertType.SettleStuck]: false,
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

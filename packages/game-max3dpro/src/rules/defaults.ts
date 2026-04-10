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

import type { FinancialRates, Max3dproPrizeConfig, PlayRules } from "../entities/types";

export const DEFAULT_MAX3D_PRO_CONFIG: {
  rates: FinancialRates;
  defaultPrizes: Max3dproPrizeConfig;
  play: PlayRules;
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
};

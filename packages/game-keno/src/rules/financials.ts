/**
 * Keno – Financial Calculations
 *
 * Keno không có Jackpot tích luỹ. Giải thưởng cố định theo bảng.
 * Tuy nhiên có giới hạn trả thưởng mỗi kỳ cho bậc 8, 9, 10.
 */

import type { GlobalConfigDoc } from "../entities/game-config";

// ─────────────────────────────────────────────
// Draw Financial Calculation
// ─────────────────────────────────────────────

export interface DrawFinancialInput {
  totalRevenue: number;
  totalPrizes: number;
  tenantRevenues: Array<{
    tenantId: string;
    revenue: number;
    commissionRate: number;
  }>;
  companyRate: number;
}

export interface DrawFinancialResult {
  totalRevenue: number;
  totalPrizes: number;
  totalAgentCommission: number;
  companyTake: number;
  profit: number;
  tenantBreakdown: Array<{
    tenantId: string;
    revenue: number;
    commission: number;
    commissionRate: number;
  }>;
}

export function calculateKenoDrawFinancials(
  input: DrawFinancialInput
): DrawFinancialResult {
  const { totalRevenue, totalPrizes, tenantRevenues, companyRate } = input;

  const tenantBreakdown = tenantRevenues.map((t) => ({
    tenantId: t.tenantId,
    revenue: t.revenue,
    commission: Math.round(t.revenue * t.commissionRate),
    commissionRate: t.commissionRate,
  }));

  const totalAgentCommission = tenantBreakdown.reduce(
    (sum, t) => sum + t.commission,
    0
  );

  const companyTake = Math.round(totalRevenue * companyRate);

  const profit =
    totalRevenue - totalPrizes - totalAgentCommission - companyTake;

  return {
    totalRevenue,
    totalPrizes,
    totalAgentCommission,
    companyTake,
    profit,
    tenantBreakdown,
  };
}

// ─────────────────────────────────────────────
// Payout Cap Logic
// ─────────────────────────────────────────────

/**
 * Tính giải thưởng thực tế cho bậc cao (8, 9, 10) có giới hạn.
 *
 * Quy tắc Keno Vietlott:
 * - Bậc 10 trùng 10: ≤5 bộ → 2 tỷ/bộ, >5 bộ → 10 tỷ chia đều
 * - Bậc 9 trùng 9: ≤12 bộ → 800tr/bộ, >12 bộ → 10 tỷ chia đều
 * - Bậc 8 trùng 8: ≤50 bộ → 200tr/bộ, >50 bộ → 10 tỷ chia đều
 *
 * @param fixedPrize - Giải thưởng cố định mỗi bộ
 * @param winnerCount - Số bộ trúng
 * @param maxPerDraw - Tổng giải thưởng tối đa cho kỳ
 * @param maxSetsForFixed - Số bộ tối đa được trả giải cố định
 * @returns Giải thưởng mỗi bộ thực tế (VND)
 */
export function calculateCappedPrize(
  fixedPrize: number,
  winnerCount: number,
  maxPerDraw: number,
  maxSetsForFixed: number
): number {
  if (winnerCount <= maxSetsForFixed) {
    return fixedPrize;
  }
  return Math.floor(maxPerDraw / winnerCount);
}

// ─────────────────────────────────────────────
// Default Config Values
// ─────────────────────────────────────────────

export const DEFAULT_KENO_CONFIG: Pick<
  GlobalConfigDoc,
  | "rates"
  | "basicPrizes"
  | "bigSmallPrizes"
  | "evenOddPrizes"
  | "payoutCaps"
  | "play"
> = {
  rates: {
    defaultCommissionRate: 0.2,
    companyRate: 0.15,
  },
  basicPrizes: {
    pick1: { 1: 20_000 },
    pick2: { 2: 90_000 },
    pick3: { 3: 200_000, 2: 20_000 },
    pick4: { 4: 400_000, 3: 50_000, 2: 10_000 },
    pick5: { 5: 4_400_000, 4: 150_000, 3: 10_000, 2: 10_000 },
    pick6: { 6: 12_500_000, 5: 450_000, 4: 40_000, 3: 10_000 },
    pick7: { 7: 40_000_000, 6: 1_200_000, 5: 100_000, 4: 20_000, 3: 10_000 },
    pick8: {
      8: 200_000_000,
      7: 5_000_000,
      6: 500_000,
      5: 50_000,
      4: 10_000,
      3: 10_000,
      0: 10_000,
    },
    pick9: {
      9: 800_000_000,
      8: 12_000_000,
      7: 1_500_000,
      6: 150_000,
      5: 30_000,
      4: 10_000,
      0: 10_000,
    },
    pick10: {
      10: 2_000_000_000,
      9: 150_000_000,
      8: 8_000_000,
      7: 710_000,
      6: 80_000,
      5: 20_000,
      0: 10_000,
    },
  },
  bigSmallPrizes: {
    big13Plus: 26_000,
    big1112: 10_000,
    draw: 26_000,
    small1112: 10_000,
    small13Plus: 26_000,
  },
  evenOddPrizes: {
    even15Plus: 200_000,
    even1314: 40_000,
    even1112: 20_000,
    draw: 20_000,
    odd1112: 20_000,
    odd1314: 40_000,
    odd15Plus: 200_000,
  },
  payoutCaps: {
    pick8MaxPerDraw: 10_000_000_000,
    pick8MaxSetsForFixed: 50,
    pick9MaxPerDraw: 10_000_000_000,
    pick9MaxSetsForFixed: 12,
    pick10MaxPerDraw: 10_000_000_000,
    pick10MaxSetsForFixed: 5,
  },
  play: {
    unitPrice: 10_000,
    maxBasicBoardsPerTicket: 2,
    maxDrawCount: 20,
    salesCloseBeforeMinutes: 5,
    drawIntervalMinutes: 10,
    firstDrawTime: "06:00",
    lastDrawTime: "21:55",
    timezone: "Asia/Ho_Chi_Minh",
  },
};

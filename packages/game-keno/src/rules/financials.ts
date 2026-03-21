/**
 * Keno – Financial Calculations
 *
 * Keno không có Jackpot tích luỹ. Giải thưởng cố định theo bảng.
 * Tuy nhiên có giới hạn trả thưởng mỗi kỳ cho bậc 8, 9, 10.
 */

import type { GlobalConfigDoc } from "../entities/global-config";

// ─────────────────────────────────────────────
// Draw Financial Calculation
// ─────────────────────────────────────────────

/**
 * Input tính tài chính kỳ quay Keno.
 *
 * Được tổng hợp từ DB (aggregateRevenueByTenant + aggregateSettledPayoutSummary)
 * trước khi gọi `calculateKenoDrawFinancials()`.
 */
export interface DrawFinancialInput {
  /** Tổng doanh thu = Σ(entry.amount) cho tất cả entries không void (VND). */
  totalRevenue: number;
  /** Tổng tiền thưởng = Σ(entry.payout.winAmount) cho entries thắng (VND). */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý (VND). Công thức: Σ(tenantAgg[].commission). */
  totalAgentCommission: number;
}

/**
 * Kết quả tính tài chính kỳ quay Keno.
 * Ghi vào draw.financial sau khi settle hoàn tất.
 */
export interface DrawFinancialResult {
  /** Tổng doanh thu (VND). Copy từ input. */
  totalRevenue: number;
  /** Tổng tiền thưởng (VND). Copy từ input. */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý = Σ(tenantBreakdown[].commission) (VND). */
  totalAgentCommission: number;
  /**
   * Phần công ty thu (VND) = totalRevenue - totalPrizes - totalAgentCommission.
   *
   * Keno KHÔNG có Jackpot tích luỹ → sau khi trả giải thưởng và hoa hồng,
   * toàn bộ phần còn lại thuộc về công ty.
   * Có thể âm nếu tổng giải thưởng vượt doanh thu.
   */
  companyTake: number;
}

/**
 * Tính tài chính tổng hợp cho 1 kỳ quay Keno.
 *
 * Keno KHÔNG có Jackpot tích luỹ — sau khi trả giải và hoa hồng,
 * toàn bộ phần còn lại là phần công ty thu:
 *   companyTake = totalRevenue - totalPrizes - totalAgentCommission
 *
 * Khác biệt so với game có Jackpot (Lotto 5/35, Mega645...):
 * - Game có Jackpot: companyRate dùng để CHIA phần dư giữa công ty và quỹ Jackpot
 * - Keno: không có quỹ Jackpot → công ty thu toàn bộ phần dư
 *
 * @param input - Dữ liệu tổng hợp từ DB (revenue, prizes, commission per tenant)
 * @returns Kết quả tài chính gồm companyTake
 */
export function calculateKenoDrawFinancials(input: DrawFinancialInput): DrawFinancialResult {
  const { totalRevenue, totalPrizes, totalAgentCommission } = input;

  const companyTake = totalRevenue - totalPrizes - totalAgentCommission;

  return {
    totalRevenue,
    totalPrizes,
    totalAgentCommission,
    companyTake,
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
  maxSetsForFixed: number,
): number {
  if (winnerCount <= maxSetsForFixed) {
    return fixedPrize;
  }

  return Math.floor(maxPerDraw / winnerCount);
}

// ─────────────────────────────────────────────
// Default Config Values
// ─────────────────────────────────────────────

/**
 * Cấu hình mặc định Keno theo quy tắc Vietlott.
 *
 * Dùng khi chưa có GlobalConfig trong DB, hoặc làm seed data ban đầu.
 * Đơn vị tiền: VND. Đơn vị tỷ lệ: 0–1.
 */
export const DEFAULT_KENO_CONFIG: Pick<
  GlobalConfigDoc,
  "rates" | "basicPrizes" | "bigSmallPrizes" | "evenOddPrizes" | "payoutCaps" | "play"
> = {
  /** Tỷ lệ tài chính: hoa hồng đại lý mặc định 20%. Keno không cần companyRate (xem financials.ts). */
  rates: {
    defaultCommissionRate: 0.2,
  },
  /**
   * Bảng giải thưởng cơ bản theo loại chơi (pick1 → pick10).
   * Key = số trùng, Value = giải thưởng (VND) cho mỗi 10.000đ đặt cược.
   * Key = 0 nghĩa là trùng 0 số (giải an ủi cho pick8, pick9, pick10).
   */
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
  /** Giải thưởng Lớn/Nhỏ — cược tổng 20 số rơi vào nửa lớn/nhỏ (VND). */
  bigSmallPrizes: {
    big13Plus: 26_000,
    big1112: 10_000,
    draw: 26_000,
    small1112: 10_000,
    small13Plus: 26_000,
  },
  /** Giải thưởng Chẵn/Lẻ — cược tổng 20 số chẵn/lẻ (VND). */
  evenOddPrizes: {
    even15Plus: 200_000,
    even1314: 40_000,
    even1112: 20_000,
    draw: 20_000,
    odd1112: 20_000,
    odd1314: 40_000,
    odd15Plus: 200_000,
  },
  /**
   * Giới hạn trả thưởng mỗi kỳ cho bậc 8, 9, 10.
   * - MaxPerDraw: tổng giải tối đa cho kỳ (VND) — 10 tỷ
   * - MaxSetsForFixed: số bộ tối đa được trả giải cố định, vượt quá thì chia đều
   */
  payoutCaps: {
    pick8MaxPerDraw: 10_000_000_000,
    pick8MaxSetsForFixed: 50,
    pick9MaxPerDraw: 10_000_000_000,
    pick9MaxSetsForFixed: 12,
    pick10MaxPerDraw: 10_000_000_000,
    pick10MaxSetsForFixed: 5,
  },
  /** Cấu hình gameplay: giá cược, giới hạn, lịch quay. */
  play: {
    unitPrice: 10_000,
    minBetCount: 1,
    maxBetCount: 10,
    maxBasicBoardsPerTicket: 2,
    maxDrawCount: 20,
    salesCloseBeforeSeconds: 60,
    drawIntervalMinutes: 8,
    firstDrawTime: "06:00",
    lastDrawTime: "21:52",
    timezone: "Asia/Ho_Chi_Minh",
  },
};

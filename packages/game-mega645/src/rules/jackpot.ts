/**
 * Mega 6/45 – Jackpot Accumulation
 *
 * Theo luật Vietlott Mega 6/45:
 * - Jackpot được tích luỹ (roll-over) vô hạn cho đến khi có người trúng 6/6 số.
 * - Khi không có winner → closingJackpot = openingJackpot + contribution (tích luỹ sang kỳ sau).
 * - Khi có winner → toàn bộ Jackpot được trao, chia đều nếu nhiều người trúng.
 * - KHÔNG có cơ chế "Split Cycle" — Jackpot KHÔNG bao giờ chia cho hạng Nhất/Nhì/Ba.
 *
 * Công thức tích luỹ Jackpot mỗi kỳ quay:
 *   JackpotContribution = Revenue - FixedPrizes - AgentCommission - CompanyTake
 */

import { Mega645OpsAlertType } from "../entities/ops-alert";
import type { FinancialRates, JackpotConfig, Mega645OpsConfig, PlayRules, PrizeAmounts } from "../entities/types";

// ─────────────────────────────────────────────
// Draw Financial Calculation
// ─────────────────────────────────────────────

/** Đầu vào để tính toán tài chính 1 kỳ quay. */
export interface DrawFinancialInput {
  /** Tổng doanh thu bán vé kỳ quay (VND). Công thức: Σ(entry.amount). */
  totalRevenue: number;
  /** Tổng giải thưởng cố định đã trả (VND). Bao gồm tier1 + tier2 + tier3. */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). Công thức: Σ(tenantAgg[].commission). */
  totalAgentCommission: number;
  /** Tỷ lệ thu nhập công ty. Ví dụ: 0.15 = 15%. */
  companyRate: number;
}

/** Kết quả tính toán tài chính 1 kỳ quay. */
export interface DrawFinancialResult {
  /** Tổng doanh thu bán vé (VND). */
  totalRevenue: number;
  /** Tổng giải thưởng cố định (VND). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). Công thức: Σ(tenantBreakdown[].commission). */
  totalAgentCommission: number;
  /**
   * Thu nhập công ty lý thuyết (VND).
   * Công thức: round(totalRevenue × companyRate).
   */
  companyTake: number;
  /**
   * Thu nhập công ty thực tế (VND).
   * Công thức: min(companyTake, max(totalRevenue - totalFixedPrizes - totalAgentCommission, 0)).
   * Bảo đảm không âm và không vượt quá phần còn lại sau giải thưởng + hoa hồng.
   */
  actualCompanyTake: number;
  /**
   * Phần đóng góp vào quỹ Jackpot (VND).
   * Công thức: max(totalRevenue - totalFixedPrizes - totalAgentCommission - actualCompanyTake, 0).
   */
  jackpotContribution: number;
}

/**
 * Tính tài chính tổng hợp cho 1 kỳ quay Mega 6/45.
 *
 * Mega 6/45 có 1 Jackpot tích luỹ:
 *   jackpotContribution = max(revenue - fixedPrizes - commission - actualCompanyTake, 0)
 *
 * @param input - Dữ liệu tổng hợp từ DB
 * @returns Kết quả tài chính gồm jackpotContribution, actualCompanyTake, tenant breakdown
 */
export function calculateDrawFinancials(input: DrawFinancialInput): DrawFinancialResult {
  const { totalRevenue, totalFixedPrizes, totalAgentCommission, companyRate } = input;

  // Thu nhập công ty lý thuyết (VND).
  // Công thức: companyTake = round(totalRevenue × companyRate).
  // round() để tránh số lẻ VND.
  const companyTake = Math.round(totalRevenue * companyRate);

  // Phần còn lại sau khi trả giải cố định và hoa hồng đại lý.
  // Công thức: remainAfterPrizes = totalRevenue - totalFixedPrizes - totalAgentCommission.
  // Có thể âm nếu doanh thu thấp hơn tổng giải + commission (edge case kỳ quay ít người chơi).
  const remainAfterPrizes = totalRevenue - totalFixedPrizes - totalAgentCommission;

  // Thu nhập công ty thực tế (VND) — không được vượt phần còn lại và không âm.
  // Công thức: actualCompanyTake = min(companyTake, max(remainAfterPrizes, 0)).
  // max(..., 0): nếu remainAfterPrizes âm → công ty không thu được gì.
  // min(companyTake, ...): công ty chỉ thu tối đa phần lý thuyết.
  const actualCompanyTake = Math.min(companyTake, Math.max(remainAfterPrizes, 0));

  // Phần đóng góp vào quỹ Jackpot (VND).
  // Công thức: jackpotContribution = max(remainAfterPrizes - actualCompanyTake, 0).
  // Là phần dư cuối cùng sau giải + commission + phần công ty.
  // Không thể âm — nếu không còn dư thì contribution = 0.
  const jackpotContribution = Math.max(remainAfterPrizes - actualCompanyTake, 0);

  return {
    totalRevenue,
    totalFixedPrizes,
    totalAgentCommission,
    companyTake,
    actualCompanyTake,
    jackpotContribution,
  };
}

// ─────────────────────────────────────────────
// Default Config Values
// ─────────────────────────────────────────────

/**
 * Cấu hình mặc định theo luật Vietlott Mega 6/45.
 * Dùng để khởi tạo GlobalConfig khi tạo game lần đầu.
 * Có thể được override qua backoffice (UpdateGameConfig).
 */
export const DEFAULT_MEGA645_CONFIG: {
  jackpot: JackpotConfig;
  rates: FinancialRates;
  defaultPrizes: PrizeAmounts;
  play: PlayRules;
  ops: Mega645OpsConfig;
} = {
  jackpot: {
    /** Jackpot khởi điểm tối thiểu theo quy định Vietlott: 12 tỷ VND. */
    seedAmount: 12_000_000_000,
  },
  rates: {
    /** Hoa hồng đại lý mặc định: 20% doanh thu. */
    defaultCommissionRate: 0.2,
    /** Tỷ lệ công ty thu: 15% tổng doanh thu. */
    companyRate: 0.15,
  },
  defaultPrizes: {
    /** Giải Nhất (5/6): 10.000.000 VND. */
    tier1: 10_000_000,
    /** Giải Nhì (4/6): 300.000 VND. */
    tier2: 300_000,
    /** Giải Ba (3/6): 30.000 VND. */
    tier3: 30_000,
  },
  play: {
    /** Đơn giá 1 line: 10.000 VND (theo quy định Vietlott). */
    unitPrice: 10_000,
    /** Số lần cược tối thiểu per board. */
    minBetCount: 1,
    /** Số lần cược tối đa per board. */
    maxBetCount: 10,
    /** Tối đa 6 boards/vé (A-F). */
    maxBoardsPerTicket: 6,
    /** Tối đa tham gia 6 kỳ quay liên tiếp với 1 vé. */
    maxDrawCount: 6,
    /** Đóng bán trước 5 phút trước giờ quay (18:00). */
    salesCloseBeforeMinutes: 5,
    /** Quay 3 lần/tuần. */
    drawsPerWeek: 3,
    /** Ngày quay: 0=Chủ nhật, 3=Thứ 4, 5=Thứ 6. */
    drawDaysOfWeek: [0, 3, 5],
    /** Giờ quay: 18:00. */
    drawTime: "18:00",
  },
  /**
   * Cấu hình vận hành mặc định (analysis §3.8). Ngưỡng alert + nhịp/top-K stats.
   * Staff chỉnh trên tab "Vận hành"; đổi có hiệu lực trong ~1 chu kỳ worker.
   */
  ops: {
    alerts: {
      largeBetAmount: 30_000_000,
      fixedExposureWarnAmount: 500_000_000,
      comboAccountsWarn: 5,
      baoHighStakeAmount: 30_000_000,
      enabled: {
        [Mega645OpsAlertType.LargeBet]: true,
        [Mega645OpsAlertType.ExposureThreshold]: true,
        [Mega645OpsAlertType.ComboConcentration]: true,
        [Mega645OpsAlertType.BaoHighStake]: true,
        // Để dành — không bắn ở P0.
        [Mega645OpsAlertType.RevenueAnomaly]: false,
        [Mega645OpsAlertType.SettleStuck]: false,
      },
    },
    stats: {
      tickSeconds: 10,
      topPotentialK: 50,
      topAccountsK: 50,
      topCombosK: 100,
    },
  },
};

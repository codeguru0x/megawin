/**
 * Power 6/55 – Jackpot Accumulation & Overflow
 *
 * Power 6/55 có 2 jackpot tích luỹ chạy SONG SONG:
 *   - Jackpot 1: tích luỹ, seed mặc định 30 tỷ (trùng 6/6)
 *   - Jackpot 2: tích luỹ, seed mặc định 3 tỷ (trùng 5/6 + bonus)
 *
 * Theo luật Vietlott gốc, Power 6/55 KHÔNG CÓ cơ chế "Split Cycle".
 * Jackpot tích lũy không giới hạn cho đến khi có winner.
 *
 * Công thức tích luỹ:
 *   Tích luỹ = Revenue - FixedPrizes - AgentCommission - CompanyTake
 *   JP1 nhận jp1ContributionRatio × tích luỹ (mặc định 90%)
 *   JP2 nhận jp2ContributionRatio × tích luỹ (mặc định 10%)
 *
 * Overflow: khi JP1 vượt jp1OverflowThreshold (mặc định 300 tỷ)
 *   → phần vượt chuyển sang JP2 trong kỳ settle đó.
 *
 * Lưu ý: tất cả giá trị ngưỡng (seedAmount, overflowThreshold, ratios)
 *   là mặc định tham khảo — đọc từ GlobalConfig, operator có thể thay đổi.
 */

import type { JackpotConfig, FinancialRates, PrizeAmounts, PlayRules } from "../entities/types";

// ─── Draw Financial Calculation ───

/**
 * Dữ liệu đầu vào để tính tài chính kỳ quay.
 *
 * Công thức:
 *   totalAgentCommission = Σ(tenantRevenues[].commission)
 *   companyTake = totalRevenue × companyRate
 *   actualCompanyTake = min(companyTake, max(totalRevenue - totalFixedPrizes - totalAgentCommission, 0))
 *   totalJackpotContribution = max(totalRevenue - totalFixedPrizes - totalAgentCommission - actualCompanyTake, 0)
 *   JP1 contribution = totalJackpotContribution × jp1Ratio
 *   JP2 contribution = totalJackpotContribution × jp2Ratio + jp1Overflow (nếu có)
 */
export interface DrawFinancialInput {
  /** Tổng doanh thu bán vé (100% tiền cược). Công thức: Σ(entry.stakeAmount) cho tất cả entries trong kỳ. */
  totalRevenue: number;
  /** Tổng tiền giải cố định phải trả (Nhất 40tr + Nhì 500k + Ba 50k × số lần trúng). */
  totalFixedPrizes: number;
  /** Chi tiết doanh thu và hoa hồng theo từng tenant/đại lý. */
  tenantRevenues: Array<{
    /** ID tenant/đại lý. */
    tenantId: string;
    /** Doanh thu từ tenant này. Công thức: Σ(entry.stakeAmount) cho entries của tenant. */
    revenue: number;
    /** Hoa hồng tenant nhận. Công thức: revenue × commissionRate. */
    commission: number;
  }>;
  /** Tỷ lệ công ty thu về (mặc định 0.15 = 15% doanh thu). */
  companyRate: number;
  /** Tỷ lệ JP1 nhận từ tổng tích luỹ (mặc định 0.9 = 90%). */
  jp1Ratio: number;
  /** Tỷ lệ JP2 nhận từ tổng tích luỹ (mặc định 0.1 = 10%). */
  jp2Ratio: number;
  /** Ngưỡng tối đa JP1 (VNĐ). Phần vượt chuyển sang JP2. Mặc định 300 tỷ. */
  jp1OverflowThreshold: number;
  /** Giá trị JP1 đầu kỳ hiện tại – dùng để tính overflow khi cộng contribution. */
  currentJp1Opening: number;
}

/**
 * Kết quả tính tài chính kỳ quay.
 * Ghi vào DrawFinancial sau khi settle xong.
 */
export interface DrawFinancialResult {
  /** Tổng doanh thu bán vé (100% tiền cược). */
  totalRevenue: number;
  /** Tổng tiền giải cố định phải trả (Nhất + Nhì + Ba). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý. Công thức: Σ(tenantBreakdown[].commission). */
  totalAgentCommission: number;
  /** Công ty thu về dự kiến. Công thức: round(totalRevenue × companyRate). */
  companyTake: number;
  /** Công ty thu về thực tế. Công thức: min(companyTake, max(totalRevenue - totalFixedPrizes - totalAgentCommission, 0)). */
  actualCompanyTake: number;
  /** Tiền tích luỹ cộng vào JP1 (sau overflow). Công thức: totalJackpotContribution × jp1Ratio - jp1Overflow. */
  jackpot1Contribution: number;
  /** Tiền tích luỹ cộng vào JP2 (bao gồm overflow). Công thức: totalJackpotContribution × jp2Ratio + jp1Overflow. */
  jackpot2Contribution: number;
  /** Phần JP1 vượt ngưỡng chuyển sang JP2. Công thức: max(currentJp1Opening + rawJp1 - jp1OverflowThreshold, 0). */
  jp1Overflow: number;
  /** Tổng tiền tích luỹ vào jackpot pool. Công thức: max(totalRevenue - totalFixedPrizes - totalAgentCommission - actualCompanyTake, 0). */
  totalJackpotContribution: number;
}

/**
 * Tính tài chính tổng hợp cho 1 kỳ quay Power 6/55.
 *
 * Power 6/55 có dual jackpot (JP1 + JP2):
 *   totalJackpotContribution = max(revenue - fixedPrizes - commission - actualCompanyTake, 0)
 *   JP1 contribution = totalJackpotContribution × jp1Ratio (90%)
 *   JP2 contribution = totalJackpotContribution × jp2Ratio (10%) + jp1Overflow
 *
 * @param input - Dữ liệu tổng hợp từ DB + config jackpot
 * @returns Kết quả tài chính gồm jp1/jp2 contribution, overflow, tenant breakdown
 */
export function calculateDrawFinancials(input: DrawFinancialInput): DrawFinancialResult {
  const {
    totalRevenue,
    totalFixedPrizes,
    tenantRevenues,
    companyRate,
    jp1Ratio,
    jp2Ratio,
    jp1OverflowThreshold,
    currentJp1Opening,
  } = input;

  const totalAgentCommission = tenantRevenues.reduce((sum, t) => sum + t.commission, 0);

  const companyTake = Math.round(totalRevenue * companyRate);
  const remainAfterPrizes = totalRevenue - totalFixedPrizes - totalAgentCommission;
  const actualCompanyTake = Math.min(companyTake, Math.max(remainAfterPrizes, 0));
  const totalJackpotContribution = Math.max(remainAfterPrizes - actualCompanyTake, 0);

  // Phân bổ tích luỹ: JP1 = 90%, JP2 = 10%
  let rawJp1Contribution = Math.round(totalJackpotContribution * jp1Ratio);
  let rawJp2Contribution = totalJackpotContribution - rawJp1Contribution;

  // Overflow: nếu JP1 sau khi cộng vượt ngưỡng → phần vượt chuyển sang JP2
  let jp1Overflow = 0;
  const projectedJp1 = currentJp1Opening + rawJp1Contribution;
  if (projectedJp1 > jp1OverflowThreshold && jp1OverflowThreshold > 0) {
    jp1Overflow = projectedJp1 - jp1OverflowThreshold;
    rawJp1Contribution -= jp1Overflow;
    rawJp2Contribution += jp1Overflow;
  }

  return {
    totalRevenue,
    totalFixedPrizes,
    totalAgentCommission,
    companyTake,
    actualCompanyTake,
    jackpot1Contribution: rawJp1Contribution,
    jackpot2Contribution: rawJp2Contribution,
    jp1Overflow,
    totalJackpotContribution,
  };
}

// ─── Default Config Values ───

/**
 * Giá trị config mặc định cho Power 6/55 (theo thể lệ Vietlott).
 * Dùng khi tạo GlobalConfig lần đầu.
 *
 * LƯU Ý: Đây là giá trị THAM KHẢO MẶC ĐỊNH. Giá trị thực tế được operator
 * cấu hình trong GlobalConfig và có thể thay đổi bởi staff qua backoffice UI.
 * Code phải luôn đọc từ GlobalConfig, không hardcode các giá trị này.
 */
export const DEFAULT_POWER655_CONFIG: {
  jackpot: JackpotConfig;
  rates: FinancialRates;
  defaultPrizes: PrizeAmounts;
  play: PlayRules;
} = {
  jackpot: {
    jackpot1: { seedAmount: 30_000_000_000 }, // 30 tỷ (mặc định tham khảo)
    jackpot2: { seedAmount: 3_000_000_000 }, // 3 tỷ (mặc định tham khảo)
    jp1ContributionRatio: 0.9, // JP1 nhận 90% tích luỹ
    jp2ContributionRatio: 0.1, // JP2 nhận 10% tích luỹ
    jp1OverflowThreshold: 300_000_000_000, // 300 tỷ → phần vượt chuyển JP2 (mặc định tham khảo)
  },
  rates: {
    defaultCommissionRate: 0.2, // Hoa hồng đại lý 20%
    companyRate: 0.15, // Công ty thu về 15%
  },
  defaultPrizes: {
    tier1: 40_000_000, // Giải Nhất: 40 triệu
    tier2: 500_000, // Giải Nhì: 500k
    tier3: 50_000, // Giải Ba: 50k
  },
  play: {
    unitPrice: 10_000,
    maxBoardsPerTicket: 5,
    maxDrawCount: 6,
    salesCloseBeforeMinutes: 15, // 15 phút trước giờ quay (theo thể lệ)
    drawsPerDay: 1,
    drawTimes: ["18:00"],
    drawDaysOfWeek: [2, 4, 6], // Thứ 3, 5, 7
  },
};

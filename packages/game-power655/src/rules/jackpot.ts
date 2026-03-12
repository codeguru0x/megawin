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
 *   JP1 contribution = totalJackpotContribution × jp1Ratio  [- jp1Overflow nếu có JP2 winner]
 *   JP2 contribution = totalJackpotContribution × jp2Ratio  [+ jp1Overflow nếu có JP2 winner]
 *
 * Overflow rule (theo thể lệ Vietlott):
 *   Chỉ kích hoạt khi ĐỦ 3 điều kiện:
 *     1. JP1 vượt jp1OverflowThreshold
 *     2. KHÔNG CÓ JP1 winner
 *     3. CÓ JP2 winner (overflow cần người nhận)
 *   Nếu không ai trúng cả JP1 lẫn JP2 → JP1 tiếp tục vượt threshold,
 *     KHÔNG bị cap. Theo luật: "tiếp tục tăng lên cho kỳ QSMT tiếp theo".
 *   Nếu CÓ JP1 winner → overflow KHÔNG kích hoạt; JP1 winner nhận toàn bộ projectedJp1.
 */
export interface DrawFinancialInput {
  /** Tổng doanh thu bán vé (100% tiền cược). Công thức: Σ(entry.stakeAmount) cho tất cả entries trong kỳ. */
  totalRevenue: number;
  /** Tổng tiền giải cố định phải trả (Nhất 40tr + Nhì 500k + Ba 50k × số lần trúng). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý. Công thức: Σ(tenantAgg[].commission). */
  totalAgentCommission: number;
  /** Tỷ lệ công ty thu về (mặc định 0.15 = 15% doanh thu). */
  companyRate: number;
  /** Tỷ lệ JP1 nhận từ tổng tích luỹ (mặc định 0.9 = 90%). */
  jp1Ratio: number;
  /** Tỷ lệ JP2 nhận từ tổng tích luỹ (mặc định 0.1 = 10%). */
  jp2Ratio: number;
  /** Ngưỡng tối đa JP1 (VNĐ). Chỉ áp dụng khi không có JP1 winner. Mặc định 300 tỷ. */
  jp1OverflowThreshold: number;
  /** Giá trị JP1 đầu kỳ hiện tại – dùng để tính overflow khi cộng contribution. */
  jp1CurrentAmount: number;
  /**
   * Có người trúng JP1 (6/6) trong kỳ này không.
   * Khi true → overflow mechanism KHÔNG kích hoạt dù JP1 vượt threshold;
   * JP1 winner nhận toàn bộ pool (jp1CurrentAmount + rawJp1Contribution).
   */
  hasJackpot1Winner: boolean;
  /**
   * Có người trúng JP2 (5/6 + bonus) trong kỳ này không.
   * Là 1 trong 3 điều kiện kích hoạt overflow (cùng với !hasJackpot1Winner và JP1 > threshold).
   * Nếu false → overflow KHÔNG kích hoạt dù JP1 vượt threshold.
   * JP1 tiếp tục tăng bình thường (theo luật Vietlott: "tiếp tục tăng lên").
   */
  hasJackpot2Winner: boolean;
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
  /** Tỷ lệ thu nhập công ty theo config (ví dụ: 0.15 = 15%). Snapshot từ config lúc settle. */
  companyTakeRate: number;
  /** Công ty thu về thực tế. Công thức: min(companyTake, max(totalRevenue - totalFixedPrizes - totalAgentCommission, 0)). */
  actualCompanyTake: number;
  /**
   * Tiền tích luỹ cộng vào JP1 kỳ này (VND).
   * = round(totalJackpotContribution × jp1Ratio) - jp1Overflow (nếu overflow kích hoạt).
   * Nếu có JP1 winner → overflow KHÔNG kích hoạt; = round(total × jp1Ratio) đầy đủ.
   */
  jackpot1Contribution: number;
  /**
   * Tiền tích luỹ cộng vào JP2 kỳ này (VND).
   * = totalJackpotContribution - jackpot1Contribution.
   * + jp1Overflow nếu overflow kích hoạt VÀ có JP2 winner (overflow chuyển sang JP2).
   * KHÔNG cộng jp1Overflow nếu overflow kích hoạt nhưng không có JP2 winner.
   */
  jackpot2Contribution: number;
  /**
   * Lượng tiền vượt ngưỡng JP1 (VND) kỳ này.
   * = max(0, jp1CurrentAmount + rawJp1 - jp1OverflowThreshold).
   * Chỉ > 0 khi overflow kích hoạt: !hasJackpot1Winner && hasJackpot2Winner && JP1 > threshold.
   * Khi > 0: đã được cộng vào jackpot2Contribution (trao cho JP2 winner kỳ này).
   * = 0 nếu: có JP1 winner, hoặc không có JP2 winner, hoặc JP1 ≤ threshold.
   */
  jp1Overflow: number;
  /** Tổng tiền tích luỹ vào jackpot pool. Công thức: max(totalRevenue - totalFixedPrizes - totalAgentCommission - actualCompanyTake, 0). */
  totalJackpotContribution: number;
}

/**
 * Tính tài chính tổng hợp cho 1 kỳ quay Power 6/55.
 *
 * Pipeline tính toán (theo thứ tự phụ thuộc):
 *   1. companyTake = round(totalRevenue × companyRate)
 *   2. remainAfterPrizes = totalRevenue - totalFixedPrizes - totalAgentCommission
 *   3. actualCompanyTake = min(companyTake, max(remainAfterPrizes, 0))
 *      → Giới hạn để tránh companyTake âm khi giải thưởng > doanh thu.
 *   4. totalJackpotContribution = max(remainAfterPrizes - actualCompanyTake, 0)
 *   5. rawJp1 = round(totalJackpotContribution × jp1Ratio)
 *      rawJp2 = totalJackpotContribution - rawJp1  (lấy phần còn lại, tránh lỗi làm tròn)
 *   6. Overflow (conditional theo thể lệ Vietlott):
 *      Khi (jp1CurrentAmount + rawJp1) > jp1OverflowThreshold
 *        VÀ KHÔNG có JP1 winner VÀ CÓ JP2 winner:
 *        → jp1Overflow chuyển sang JP2 (trao cho JP2 winner kỳ này)
 *        → JP1 cap tại threshold
 *      Nếu không ai trúng cả JP1 lẫn JP2 → JP1 tiếp tục vượt threshold bình thường,
 *        KHÔNG bị cap (theo luật: "tiếp tục tăng lên cho kỳ QSMT tiếp theo").
 *      Nếu CÓ JP1 winner → overflow KHÔNG kích hoạt; JP1 winner nhận đủ projectedJp1.
 *
 * @param input - Dữ liệu tổng hợp từ DB + config jackpot của kỳ quay
 * @returns Kết quả tài chính kỳ quay, bao gồm jp1/jp2 contribution và overflow
 */
export function calculateDrawFinancials(input: DrawFinancialInput): DrawFinancialResult {
  const {
    totalRevenue,
    totalFixedPrizes,
    totalAgentCommission,
    companyRate,
    jp1Ratio,
    jp1OverflowThreshold,
    jp1CurrentAmount,
    hasJackpot1Winner,
    hasJackpot2Winner,
  } = input;

  // ── Bước 1: Tính phần công ty thu về (dự kiến) ──────────────────────────
  // companyTake là mức dự kiến tính theo tỷ lệ; có thể không đủ nếu doanh thu
  // thấp hơn tổng giải + hoa hồng (round để tránh lẻ đồng).
  const companyTake = Math.round(totalRevenue * companyRate);

  // ── Bước 2: Phần còn lại sau khi trừ giải thưởng và hoa hồng ────────────
  // remainAfterPrizes có thể âm nếu kỳ có nhiều người trúng giải cao hơn doanh thu.
  const remainAfterPrizes = totalRevenue - totalFixedPrizes - totalAgentCommission;

  // ── Bước 3: Công ty thực thu (không được lấy quá số còn lại) ────────────
  // Nếu remainAfterPrizes âm, công ty không thu gì (0), chứ không thu âm.
  // Công thức: min(companyTake, max(remainAfterPrizes, 0))
  const actualCompanyTake = Math.min(companyTake, Math.max(remainAfterPrizes, 0));

  // ── Bước 4: Tổng tích luỹ vào jackpot pool ──────────────────────────────
  // Phần còn lại sau khi trừ cả companyTake mới được tích luỹ vào JP.
  // Floor về 0 để tránh contribution âm khi doanh thu quá thấp.
  const totalJackpotContribution = Math.max(remainAfterPrizes - actualCompanyTake, 0);

  // ── Bước 5: Phân bổ tích luỹ theo tỷ lệ JP1/JP2 ────────────────────────
  // JP1 lấy jp1Ratio (90%), JP2 lấy phần còn lại (10%) — không dùng jp2Ratio × total
  // vì sẽ tạo ra sai số làm tròn; rawJp1 + rawJp2 = totalJackpotContribution chính xác.
  let rawJp1Contribution = Math.round(totalJackpotContribution * jp1Ratio);
  let rawJp2Contribution = totalJackpotContribution - rawJp1Contribution;

  // ── Bước 6: Xử lý overflow JP1 (conditional — theo thể lệ Vietlott) ─────
  // Điều kiện kích hoạt đầy đủ (cả 4 phải đúng):
  //   1. Không có JP1 winner kỳ này (nếu có → winner nhận toàn bộ projectedJp1, không cap)
  //   2. CÓ JP2 winner kỳ này (overflow chỉ xảy ra khi có người nhận phần vượt)
  //   3. JP1 sau khi cộng contribution vượt ngưỡng jp1OverflowThreshold
  //   4. jp1OverflowThreshold > 0 (guard để skip khi operator tắt tính năng overflow)
  //
  // Theo thể lệ Vietlott:
  //   - Không ai trúng cả JP1 lẫn JP2 → JP1 và JP2 "tiếp tục tăng lên", KHÔNG bị cap.
  //     JP1 có thể vượt 300 tỷ mà không bị trừ overflow.
  //   - Chỉ khi có JP2 winner (và không có JP1 winner): phần vượt chuyển sang JP2,
  //     JP1 được cap tại threshold (300 tỷ).
  //
  // Khi overflow kích hoạt:
  //   jp1Overflow = projectedJp1 - threshold → chuyển sang JP2 (trao cho JP2 winner).
  //   rawJp1Contribution -= jp1Overflow → JP1 cap tại threshold.
  //   rawJp2Contribution += jp1Overflow → JP2 winner nhận thêm phần overflow.
  let jp1Overflow = 0;
  const projectedJp1 = jp1CurrentAmount + rawJp1Contribution;
  if (
    !hasJackpot1Winner &&
    hasJackpot2Winner &&
    projectedJp1 > jp1OverflowThreshold &&
    jp1OverflowThreshold > 0
  ) {
    // Tính tiền vượt ngưỡng = tổng JP1 sau contribution - threshold
    jp1Overflow = projectedJp1 - jp1OverflowThreshold;
    // JP1 cap tại threshold: trừ overflow khỏi contribution
    rawJp1Contribution -= jp1Overflow;
    // Overflow chuyển sang JP2 để trao cho JP2 winner kỳ này.
    rawJp2Contribution += jp1Overflow;
  }
  // Nếu có JP1 winner: overflow không kích hoạt.
  // jackpot1Contribution = rawJp1Contribution (không bị trừ) → JP1 winner nhận đủ projectedJp1.
  //
  // Nếu không ai trúng cả JP1 lẫn JP2: overflow cũng không kích hoạt.
  // JP1 tiếp tục vượt threshold bình thường — theo luật Vietlott "tiếp tục tăng lên".
  // jackpot1Contribution = rawJp1Contribution (đầy đủ, không bị cap).

  return {
    totalRevenue,
    totalFixedPrizes,
    totalAgentCommission,
    companyTake,
    companyTakeRate: companyRate,
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

/**
 * Power 6/55 – Unit test: `calculateDrawFinancials`
 *
 * PURE — không DB, không cần quy tắc test staging chung.
 *
 * Trọng tâm: dual jackpot (JP1/JP2) contribution split + overflow conditional
 * theo thể lệ Vietlott (chỉ kích hoạt khi CÓ JP2 winner và KHÔNG có JP1 winner).
 */

import { describe, it, expect } from "vitest";
import { calculateDrawFinancials, type DrawFinancialInput } from "../../src/rules/jackpot";

const baseInput: DrawFinancialInput = {
  totalRevenue: 1_000_000_000,
  totalFixedPrizes: 100_000_000,
  totalAgentCommission: 200_000_000,
  companyRate: 0.15,
  jp1Ratio: 0.9,
  jp2Ratio: 0.1,
  jp1OverflowThreshold: 300_000_000_000,
  jp1CurrentAmount: 0,
  hasJackpot1Winner: false,
  hasJackpot2Winner: false,
};

describe("calculateDrawFinancials", () => {
  it("Đúng logic — không overflow: JP1/JP2 chia đúng tỷ lệ 90/10, JP1+JP2 = totalJackpotContribution", () => {
    const result = calculateDrawFinancials(baseInput);

    const remainAfterPrizes =
      baseInput.totalRevenue - baseInput.totalFixedPrizes - baseInput.totalAgentCommission;
    const expectedCompanyTake = Math.round(baseInput.totalRevenue * baseInput.companyRate);
    const expectedActualCompanyTake = Math.min(expectedCompanyTake, Math.max(remainAfterPrizes, 0));
    const expectedTotalContribution = Math.max(remainAfterPrizes - expectedActualCompanyTake, 0);

    expect(result.totalJackpotContribution).toBe(expectedTotalContribution);
    expect(result.jackpot1Contribution + result.jackpot2Contribution).toBe(expectedTotalContribution);
    expect(result.jp1Overflow).toBe(0);
  });

  it("Đúng logic — remainAfterPrizes âm (giải thưởng > doanh thu): companyTake = 0, contribution = 0", () => {
    const input: DrawFinancialInput = {
      ...baseInput,
      totalRevenue: 100_000_000,
      totalFixedPrizes: 200_000_000,
      totalAgentCommission: 50_000_000,
    };
    const result = calculateDrawFinancials(input);

    expect(result.actualCompanyTake).toBe(0);
    expect(result.totalJackpotContribution).toBe(0);
    expect(result.jackpot1Contribution).toBe(0);
    expect(result.jackpot2Contribution).toBe(0);
  });

  it("Đúng logic — overflow kích hoạt: JP1 vượt threshold + CÓ JP2 winner + KHÔNG có JP1 winner → cap JP1, chuyển phần vượt sang JP2", () => {
    const input: DrawFinancialInput = {
      ...baseInput,
      jp1CurrentAmount: 299_950_000_000, // gần threshold 300 tỷ
      hasJackpot1Winner: false,
      hasJackpot2Winner: true,
    };
    const result = calculateDrawFinancials(input);

    const remainAfterPrizes =
      input.totalRevenue - input.totalFixedPrizes - input.totalAgentCommission;
    const companyTake = Math.round(input.totalRevenue * input.companyRate);
    const actualCompanyTake = Math.min(companyTake, Math.max(remainAfterPrizes, 0));
    const totalJackpotContribution = Math.max(remainAfterPrizes - actualCompanyTake, 0);
    const rawJp1 = Math.round(totalJackpotContribution * input.jp1Ratio);
    const projectedJp1 = input.jp1CurrentAmount + rawJp1;
    const expectedOverflow = projectedJp1 - input.jp1OverflowThreshold;

    expect(result.jp1Overflow).toBe(expectedOverflow);
    expect(result.jp1Overflow).toBeGreaterThan(0);
    // JP1 sau contribution phải cap đúng tại threshold (jp1CurrentAmount + jackpot1Contribution).
    expect(input.jp1CurrentAmount + result.jackpot1Contribution).toBe(input.jp1OverflowThreshold);
  });

  it("Logic ngược — vượt threshold nhưng KHÔNG có JP2 winner → overflow KHÔNG kích hoạt, JP1 tiếp tục tăng tự do", () => {
    const input: DrawFinancialInput = {
      ...baseInput,
      jp1CurrentAmount: 299_950_000_000,
      hasJackpot1Winner: false,
      hasJackpot2Winner: false, // không ai trúng JP2 → không có người nhận overflow
    };
    const result = calculateDrawFinancials(input);

    expect(result.jp1Overflow).toBe(0);
    // JP1 contribution đầy đủ, không bị cap — có thể vượt threshold.
    expect(input.jp1CurrentAmount + result.jackpot1Contribution).toBeGreaterThan(
      input.jp1OverflowThreshold,
    );
  });

  it("Logic ngược — vượt threshold nhưng CÓ JP1 winner → overflow KHÔNG kích hoạt, JP1 winner nhận đủ", () => {
    const input: DrawFinancialInput = {
      ...baseInput,
      jp1CurrentAmount: 299_950_000_000,
      hasJackpot1Winner: true,
      hasJackpot2Winner: true,
    };
    const result = calculateDrawFinancials(input);

    expect(result.jp1Overflow).toBe(0);
    expect(input.jp1CurrentAmount + result.jackpot1Contribution).toBeGreaterThan(
      input.jp1OverflowThreshold,
    );
  });

  it("Logic ngược — jp1OverflowThreshold = 0 (operator tắt overflow) → không kích hoạt dù vượt ngưỡng cũ", () => {
    const input: DrawFinancialInput = {
      ...baseInput,
      jp1CurrentAmount: 500_000_000_000,
      jp1OverflowThreshold: 0,
      hasJackpot1Winner: false,
      hasJackpot2Winner: true,
    };
    const result = calculateDrawFinancials(input);

    expect(result.jp1Overflow).toBe(0);
  });

  it("Logic ngược — input KHÔNG bị mutate", () => {
    const input: DrawFinancialInput = { ...baseInput };
    const snapshot = { ...input };

    calculateDrawFinancials(input);

    expect(input).toEqual(snapshot);
  });
});

import { POWER655_MAX_BOARDS } from "@megawin/game-power655/rules";
import { z } from "zod";

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const rate = z.number().min(0).max(1);

const jackpot1Schema = z.object({
  seedAmount: nonNegativeInt,
});

const jackpot2Schema = z.object({
  seedAmount: nonNegativeInt,
});

// jp1/jp2 contribution ratio: mỗi field trong khoảng [0.01, 0.99] (1%–99%)
const contributionRate = z.number().min(0.01).max(0.99);

const jackpotSchema = z
  .object({
    jackpot1: jackpot1Schema.optional(),
    jackpot2: jackpot2Schema.optional(),
    jp1ContributionRatio: contributionRate.optional(),
    jp2ContributionRatio: contributionRate.optional(),
    jp1OverflowThreshold: nonNegativeInt,
  })
  .partial()
  .refine(
    (v) => {
      // Chỉ validate khi cả 2 ratio đều có mặt trong payload
      if (v.jp1ContributionRatio !== undefined && v.jp2ContributionRatio !== undefined) {
        // Làm tròn 4 chữ số thập phân để tránh lỗi float point (e.g. 0.9 + 0.1 = 0.9999...)
        const sum = Math.round((v.jp1ContributionRatio + v.jp2ContributionRatio) * 10000) / 10000;
        return sum === 1;
      }
      return true;
    },
    { message: "Tổng jp1ContributionRatio + jp2ContributionRatio phải bằng 100%." },
  )
  .refine(
    (v) => {
      // Chỉ validate khi cả 2 seedAmount đều có mặt
      if (v.jackpot1?.seedAmount !== undefined && v.jackpot2?.seedAmount !== undefined) {
        return v.jackpot2.seedAmount <= v.jackpot1.seedAmount;
      }
      return true;
    },
    { message: "Giá trị khởi điểm JP2 phải ≤ JP1." },
  )
  .refine(
    (v) => {
      // Chỉ validate khi cả overflowThreshold và jp1SeedAmount đều có mặt
      if (v.jp1OverflowThreshold !== undefined && v.jackpot1?.seedAmount !== undefined) {
        return v.jp1OverflowThreshold > v.jackpot1.seedAmount;
      }
      return true;
    },
    { message: "Ngưỡng tràn JP1 phải lớn hơn giá trị khởi điểm JP1." },
  );

const ratesSchema = z
  .object({
    defaultCommissionRate: rate,
    companyRate: rate,
  })
  .partial();

const prizesSchema = z
  .object({
    tier1: positiveInt,
    tier2: positiveInt,
    tier3: positiveInt,
  })
  .partial();

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const playSchema = z
  .object({
    unitPrice: positiveInt,
    minBetCount: positiveInt,
    maxBetCount: positiveInt,
    maxBoardsPerTicket: positiveInt.max(POWER655_MAX_BOARDS, `Số board tối đa không được vượt ${POWER655_MAX_BOARDS}.`),
    maxDrawCount: positiveInt,
    salesCloseBeforeMinutes: positiveInt,
    drawsPerDay: positiveInt,
    drawTimes: z.array(z.string().regex(timePattern, "Giờ phải có format HH:mm")).min(1),
    drawDaysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  })
  .partial();

export const updateGameConfigSchema = z
  .object({
    jackpot: jackpotSchema.optional(),
    rates: ratesSchema.optional(),
    defaultPrizes: prizesSchema.optional(),
    play: playSchema.optional(),
  })
  .refine((data) => data.jackpot || data.rates || data.defaultPrizes || data.play, {
    message: "Phải cung cấp ít nhất một section để cập nhật.",
  });

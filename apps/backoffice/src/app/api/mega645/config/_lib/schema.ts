import { z } from "zod";

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const rate = z.number().min(0).max(1);

const splitRatiosSchema = z.object({
  tier1: positiveInt,
  tier2: positiveInt,
  tier3: positiveInt,
});

const jackpotSchema = z
  .object({
    seedAmount: nonNegativeInt,
    splitThreshold: nonNegativeInt,
    splitRatios: splitRatiosSchema,
  })
  .partial();

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
    maxBoardsPerTicket: positiveInt,
    maxDrawCount: positiveInt,
    salesCloseBeforeMinutes: positiveInt,
    drawsPerWeek: positiveInt,
    drawDaysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
    drawTime: z.string().regex(timePattern, "Giờ phải có format HH:mm"),
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

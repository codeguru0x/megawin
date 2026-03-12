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

const jackpotSchema = z.object({
  jackpot1: jackpot1Schema.optional(),
  jackpot2: jackpot2Schema.optional(),
  jp1ContributionRatio: rate,
  jp2ContributionRatio: rate,
  jp1OverflowThreshold: nonNegativeInt,
}).partial();

const ratesSchema = z.object({
  defaultCommissionRate: rate,
  companyRate: rate,
}).partial();

const prizesSchema = z.object({
  tier1: positiveInt,
  tier2: positiveInt,
  tier3: positiveInt,
}).partial();

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const playSchema = z.object({
  unitPrice: positiveInt,
  maxBoardsPerTicket: positiveInt,
  maxDrawCount: positiveInt,
  salesCloseBeforeMinutes: positiveInt,
  drawsPerDay: positiveInt,
  drawTimes: z.array(z.string().regex(timePattern, "Giờ phải có format HH:mm")).min(1),
  drawDaysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
}).partial();

export const updateGameConfigSchema = z
  .object({
    jackpot: jackpotSchema.optional(),
    rates: ratesSchema.optional(),
    defaultPrizes: prizesSchema.optional(),
    play: playSchema.optional(),
  })
  .refine(
    (data) => data.jackpot || data.rates || data.defaultPrizes || data.play,
    { message: "Phải cung cấp ít nhất một section để cập nhật." },
  );

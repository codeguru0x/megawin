import { z } from "zod";

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const rate = z.number().min(0).max(1);
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

// ─────── Rates ───────

const ratesSchema = z
  .object({
    commissionRate: rate,
    companyRate: rate,
  })
  .partial();

// ─────── Single Number Prizes (match 1/2/3 dice) ───────

const singleNumPrizesSchema = z
  .object({
    match1: nonNegativeInt,
    match2: nonNegativeInt,
    match3: nonNegativeInt,
  })
  .partial();

// ─────── Double Match Prizes ───────

const doubleMatchPrizesSchema = z
  .object({
    win: nonNegativeInt,
  })
  .partial();

// ─────── Triple Match Prizes ───────

const tripleMatchPrizesSchema = z
  .object({
    specific: nonNegativeInt,
    any: nonNegativeInt,
  })
  .partial();

// ─────── Sum Total Prizes (sum 3-18 → multiplier) ───────

const sumTotalPrizesSchema = z.record(
  z.coerce.number().int().min(3).max(18),
  nonNegativeInt
);

// ─────── Big/Small/Draw Prizes ───────

const bigSmallDrawPrizesSchema = z
  .object({
    big: nonNegativeInt,
    draw: nonNegativeInt,
    small: nonNegativeInt,
  })
  .partial();

// ─────── Play Rules ───────

const playSchema = z
  .object({
    unitPrice: positiveInt,
    maxBasicBoardsPerTicket: positiveInt,
    maxDrawCount: positiveInt,
    salesCloseBeforeSeconds: positiveInt,
    drawIntervalMinutes: positiveInt,
    firstDrawTime: z.string().regex(timePattern, "Giờ phải có format HH:mm"),
    lastDrawTime: z.string().regex(timePattern, "Giờ phải có format HH:mm"),
    timezone: z.string().min(1),
  })
  .partial();

// ─────── Root schema ───────

export const updateBingo18GameConfigSchema = z
  .object({
    rates: ratesSchema.optional(),
    singleNumPrizes: singleNumPrizesSchema.optional(),
    doubleMatchPrizes: doubleMatchPrizesSchema.optional(),
    tripleMatchPrizes: tripleMatchPrizesSchema.optional(),
    sumTotalPrizes: sumTotalPrizesSchema.optional(),
    bigSmallDrawPrizes: bigSmallDrawPrizesSchema.optional(),
    play: playSchema.optional(),
  })
  .refine(
    (data) =>
      data.rates ||
      data.singleNumPrizes ||
      data.doubleMatchPrizes ||
      data.tripleMatchPrizes ||
      data.sumTotalPrizes ||
      data.bigSmallDrawPrizes ||
      data.play,
    { message: "Phải cung cấp ít nhất một section để cập nhật." }
  );

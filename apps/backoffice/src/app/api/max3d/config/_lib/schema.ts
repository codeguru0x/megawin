import { MAX3D_MAX_BOARDS } from "@megawin/game-max3d/rules";
import { z } from "zod";

const positiveInt = z.number().int().positive();
const rate = z.number().min(0).max(1);

const ratesSchema = z
  .object({
    defaultCommissionRate: rate,
  })
  .partial();

const basicPrizesSchema = z
  .object({
    special: positiveInt,
    first: positiveInt,
    second: positiveInt,
    third: positiveInt,
  })
  .partial();

const comboPrizesSchema = z
  .object({
    combo3: basicPrizesSchema.optional(),
    combo6: basicPrizesSchema.optional(),
  })
  .partial();

const plusPrizesSchema = z
  .object({
    special: positiveInt,
    first: positiveInt,
    second: positiveInt,
    third: positiveInt,
    fourth: positiveInt,
    fifth: positiveInt,
    sixth: positiveInt,
  })
  .partial();

const defaultPrizesSchema = z
  .object({
    basic: basicPrizesSchema.optional(),
    combo: comboPrizesSchema.optional(),
    plus: plusPrizesSchema.optional(),
  })
  .partial();

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const playSchema = z
  .object({
    unitPrice: positiveInt,
    minBetCount: positiveInt,
    maxBetCount: positiveInt,
    maxBoardsPerTicket: positiveInt.max(MAX3D_MAX_BOARDS, `Số board tối đa không được vượt ${MAX3D_MAX_BOARDS}.`),
    maxDrawCount: positiveInt,
    salesCloseBeforeMinutes: positiveInt,
    drawsPerDay: positiveInt,
    drawTimes: z.array(z.string().regex(timePattern, "Giờ phải có format HH:mm")).min(1),
    drawDaysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Phải chọn ít nhất 1 ngày quay.").max(7),
  })
  .partial();

export const updateGameConfigSchema = z
  .object({
    rates: ratesSchema.optional(),
    defaultPrizes: defaultPrizesSchema.optional(),
    play: playSchema.optional(),
  })
  .refine((data) => data.rates || data.defaultPrizes || data.play, {
    message: "Phải cung cấp ít nhất một section để cập nhật.",
  });

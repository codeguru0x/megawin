import { BINGO18_MAX_BOARDS } from "@megawin/game-bingo18/rules";
import { Bingo18OpsAlertType } from "@megawin/game-bingo18/entities";
import { z } from "zod";

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const rate = z.number().min(0).max(1);
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

// ─────── Rates ───────

const ratesSchema = z
  .object({
    defaultCommissionRate: rate,
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

const sumTotalPrizesSchema = z.record(z.coerce.number().int().min(3).max(18), nonNegativeInt);

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
    minBetCount: positiveInt,
    maxBetCount: positiveInt,
    maxBasicBoardsPerTicket: positiveInt.max(
      BINGO18_MAX_BOARDS,
      `Số board tối đa không được vượt ${BINGO18_MAX_BOARDS}.`,
    ),
    maxDrawCount: positiveInt,
    salesCloseBeforeSeconds: positiveInt,
    drawIntervalMinutes: positiveInt,
    firstDrawTime: z.string().regex(timePattern, "Giờ phải có format HH:mm"),
    lastDrawTime: z.string().regex(timePattern, "Giờ phải có format HH:mm"),
    timezone: z.string().min(1),
  })
  .partial();

// ─────── Operations & Risk Control (analysis bingo18-ops §3.6) ───────

/** Bật/tắt từng loại alert — khoá theo `Bingo18OpsAlertType` (derive const-as-const §5.3). */
const alertEnabledSchema = z
  .object(
    Object.fromEntries(Object.values(Bingo18OpsAlertType).map((t) => [t, z.boolean()])) as Record<
      Bingo18OpsAlertType,
      z.ZodBoolean
    >,
  )
  .partial();

const opsAlertsSchema = z
  .object({
    largeBetAmount: positiveInt,
    // Ngưỡng % doanh thu kỳ (100–1000%) — mẫu số exposure (không có cap kỳ, chốt §7 Q2).
    exposureWarnRevenuePct: z.number().int().min(100).max(1000),
    exposureWarnMinAmount: positiveInt,
    sidebetSkewPct: z.number().int().min(50).max(95),
    bucketConcentrationAmount: positiveInt,
    enabled: alertEnabledSchema,
  })
  .partial();

// KHÔNG có topCombosK — Bingo 18 dùng OpsStatsConfigBase (chốt §7 Q3, không field thừa).
const opsStatsSchema = z
  .object({
    tickSeconds: z.number().int().min(5).max(60),
    topPotentialK: z.number().int().min(20).max(100),
    topAccountsK: z.number().int().min(20).max(100),
  })
  .partial();

const opsSchema = z
  .object({
    alerts: opsAlertsSchema,
    stats: opsStatsSchema,
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
    ops: opsSchema.optional(),
  })
  .refine(
    (data) =>
      data.rates ||
      data.singleNumPrizes ||
      data.doubleMatchPrizes ||
      data.tripleMatchPrizes ||
      data.sumTotalPrizes ||
      data.bigSmallDrawPrizes ||
      data.play ||
      data.ops,
    { message: "Phải cung cấp ít nhất một section để cập nhật." },
  );

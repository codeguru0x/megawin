import { KenoOpsAlertType } from "@megawin/game-keno/entities";
import { KENO_MAX_BOARDS } from "@megawin/game-keno/rules";
import { HHMM_PATTERN } from "@megawin/shared/utils";
import { z } from "zod";

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const rate = z.number().min(0).max(1);

// ─────── Rates ───────

const ratesSchema = z
  .object({
    defaultCommissionRate: rate,
  })
  .partial();

// ─────── Basic Prizes (pick1-pick10) ───────

const matchPrizesSchema = z.record(z.coerce.number().int().nonnegative(), nonNegativeInt);

const basicPrizesSchema = z
  .record(z.string().regex(/^pick([1-9]|10)$/, 'Key phải là "pick1" đến "pick10"'), matchPrizesSchema)
  .refine((data) => Object.keys(data).length > 0, {
    message: "Phải có ít nhất 1 bậc chơi.",
  });

// ─────── Side Bet Prizes ───────

const bigSmallPrizesSchema = z
  .object({
    big13Plus: nonNegativeInt,
    big1112: nonNegativeInt,
    draw: nonNegativeInt,
    small1112: nonNegativeInt,
    small13Plus: nonNegativeInt,
  })
  .partial();

const evenOddPrizesSchema = z
  .object({
    even15Plus: nonNegativeInt,
    even1314: nonNegativeInt,
    even1112: nonNegativeInt,
    draw: nonNegativeInt,
    odd1112: nonNegativeInt,
    odd1314: nonNegativeInt,
    odd15Plus: nonNegativeInt,
  })
  .partial();

// ─────── Payout Caps ───────

const payoutCapsSchema = z
  .object({
    pick8MaxPerDraw: positiveInt,
    pick8MaxSetsForFixed: positiveInt,
    pick9MaxPerDraw: positiveInt,
    pick9MaxSetsForFixed: positiveInt,
    pick10MaxPerDraw: positiveInt,
    pick10MaxSetsForFixed: positiveInt,
  })
  .partial();

// ─────── Play Rules ───────

const playSchema = z
  .object({
    unitPrice: positiveInt,
    minBetCount: z.number().int().min(1, "Tối thiểu 1"),
    maxBetCount: z.number().int().min(1, "Tối thiểu 1"),
    maxBasicBoardsPerTicket: positiveInt.max(KENO_MAX_BOARDS, `Số board tối đa không được vượt ${KENO_MAX_BOARDS}.`),
    maxDrawCount: positiveInt,
    salesCloseBeforeSeconds: positiveInt,
    drawIntervalMinutes: positiveInt,
    firstDrawTime: z.string().regex(HHMM_PATTERN, "Giờ phải có format HH:mm"),
    lastDrawTime: z.string().regex(HHMM_PATTERN, "Giờ phải có format HH:mm"),
    timezone: z.string().min(1),
  })
  .partial()
  .refine(
    (data) => {
      if (data.minBetCount !== undefined && data.maxBetCount !== undefined) {
        return data.maxBetCount >= data.minBetCount;
      }
      return true;
    },
    { message: "maxBetCount phải ≥ minBetCount", path: ["maxBetCount"] },
  );

// ─────── Operations & Risk Control (§3.9) ───────

const pct = z.number().int().min(0).max(100);

/** Bật/tắt từng loại alert — khoá theo `KenoOpsAlertType`. */
const alertEnabledSchema = z
  .object(
    Object.fromEntries(Object.values(KenoOpsAlertType).map((t) => [t, z.boolean()])) as Record<
      KenoOpsAlertType,
      z.ZodBoolean
    >,
  )
  .partial();

const opsAlertsSchema = z
  .object({
    largeBetAmount: positiveInt,
    exposureWarnPct: pct,
    sidebetSkewPct: pct,
    comboSetsWarn: z
      .object({
        pick8: positiveInt,
        pick9: positiveInt,
        pick10: positiveInt,
      })
      .partial(),
    comboAccountsWarn: positiveInt,
    enabled: alertEnabledSchema,
  })
  .partial();

const opsStatsSchema = z
  .object({
    tickSeconds: z.number().int().min(5).max(60),
    topCombosK: z.number().int().min(20).max(200),
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

export const updateKenoGameConfigSchema = z
  .object({
    rates: ratesSchema.optional(),
    basicPrizes: basicPrizesSchema.optional(),
    bigSmallPrizes: bigSmallPrizesSchema.optional(),
    evenOddPrizes: evenOddPrizesSchema.optional(),
    payoutCaps: payoutCapsSchema.optional(),
    play: playSchema.optional(),
    ops: opsSchema.optional(),
  })
  .refine(
    (data) =>
      data.rates ||
      data.basicPrizes ||
      data.bigSmallPrizes ||
      data.evenOddPrizes ||
      data.payoutCaps ||
      data.play ||
      data.ops,
    { message: "Phải cung cấp ít nhất một section để cập nhật." },
  );

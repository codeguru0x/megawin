import { Max3dproOpsAlertType } from "@megawin/game-max3dpro/entities";
import { MAX3DPRO_MAX_BOARDS } from "@megawin/game-max3dpro/rules";
import { z } from "zod";

const positiveInt = z.number().int().positive();
const rate = z.number().min(0).max(1);

const ratesSchema = z
  .object({
    defaultCommissionRate: rate,
  })
  .partial();

const standardPrizesSchema = z
  .object({
    special: positiveInt,
    specialSub: positiveInt,
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
    standard: standardPrizesSchema.optional(),
  })
  .partial();

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const playSchema = z
  .object({
    unitPrice: positiveInt,
    minBetCount: positiveInt,
    maxBetCount: positiveInt,
    maxBoardsPerTicket: positiveInt.max(MAX3DPRO_MAX_BOARDS, `Số board tối đa không được vượt ${MAX3DPRO_MAX_BOARDS}.`),
    maxDrawCount: positiveInt,
    salesCloseBeforeMinutes: positiveInt,
    drawsPerDay: positiveInt,
    drawTimes: z.array(z.string().regex(timePattern, "Giờ phải có format HH:mm")).min(1),
    drawDaysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Phải chọn ít nhất 1 ngày quay.").max(7),
  })
  .partial();

// ─────── Operations & Risk Control (analysis max3dpro-ops §3.6) ───────

/** Bật/tắt từng loại alert — khoá theo `Max3dproOpsAlertType` (derive const-as-const §5.3). */
const alertEnabledSchema = z
  .object(
    Object.fromEntries(Object.values(Max3dproOpsAlertType).map((t) => [t, z.boolean()])) as Record<
      Max3dproOpsAlertType,
      z.ZodBoolean
    >,
  )
  .partial();

// Ngưỡng TUYỆT ĐỐI VND (không cap kỳ / revenue bán-nhiều-ngày làm mẫu số — chốt §7 Q2).
const opsAlertsSchema = z
  .object({
    largeBetAmount: positiveInt,
    exposureWarnAmount: positiveInt,
    pairLiabilityWarnAmount: positiveInt,
    comboAccountsWarn: z.number().int().min(2).max(50),
    enabled: alertEnabledSchema,
  })
  .partial();

// CÓ topCombosK — Max 3D Pro dùng OpsStatsConfig đầy đủ (cắt topPairs ordered).
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

export const updateGameConfigSchema = z
  .object({
    rates: ratesSchema.optional(),
    defaultPrizes: defaultPrizesSchema.optional(),
    play: playSchema.optional(),
    ops: opsSchema.optional(),
  })
  .refine((data) => data.rates || data.defaultPrizes || data.play || data.ops, {
    message: "Phải cung cấp ít nhất một section để cập nhật.",
  });

import { Lotto535OpsAlertType } from "@megawin/game-lotto535/entities";
import { LOTTO535_MAX_BOARDS } from "@megawin/game-lotto535/rules";
import { HHMM_PATTERN } from "@megawin/shared/utils";
import { z } from "zod";

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const rate = z.number().min(0).max(1);

const splitRatiosSchema = z.object({
  tier1: positiveInt,
  tier2: positiveInt,
  tier3: positiveInt,
  tier4: positiveInt,
  tier5: positiveInt,
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
    tier4: positiveInt,
    tier5: positiveInt,
    consolation: positiveInt,
  })
  .partial();

const playSchema = z
  .object({
    unitPrice: positiveInt,
    minBetCount: positiveInt,
    maxBetCount: positiveInt,
    maxBoardsPerTicket: positiveInt.max(LOTTO535_MAX_BOARDS, `Số board tối đa không được vượt ${LOTTO535_MAX_BOARDS}.`),
    maxDrawCount: positiveInt,
    salesCloseBeforeMinutes: positiveInt,
    drawsPerDay: positiveInt,
    drawTimes: z.array(z.string().regex(HHMM_PATTERN, "Giờ phải có format HH:mm")).min(1),
  })
  .partial()
  // Partial update có thể gửi 1 trong 2 field → chỉ kiểm tra khi CẢ HAI cùng có mặt.
  // Thiếu refine này thì API nhận maxBetCount < minBetCount, tạo khoảng hợp lệ rỗng.
  .refine(
    (data) => {
      if (data.minBetCount !== undefined && data.maxBetCount !== undefined) {
        return data.maxBetCount >= data.minBetCount;
      }
      return true;
    },
    { message: "maxBetCount phải ≥ minBetCount.", path: ["maxBetCount"] },
  );

// ─────── Operations & Risk Control (analysis §3.8 / §5.3 p0-03) ───────

/** Bật/tắt từng loại alert — khoá theo `Lotto535OpsAlertType`. Chỉ 5 alert P0 có toggle;
 * `revenue_anomaly`/`settle_stuck` để dành nhưng vẫn nhận key (schema chấp nhận, UI chưa hiện). */
const alertEnabledSchema = z
  .object(
    Object.fromEntries(Object.values(Lotto535OpsAlertType).map((t) => [t, z.boolean()])) as Record<
      Lotto535OpsAlertType,
      z.ZodBoolean
    >,
  )
  .partial();

const opsAlertsSchema = z
  .object({
    largeBetAmount: positiveInt,
    fixedExposureWarnAmount: positiveInt,
    comboAccountsWarn: z.number().int().min(2),
    coverHighStakeAmount: positiveInt,
    // Tỷ trọng dồn 1 số ĐB — THẬP PHÂN [0,1] (R3 p0-01), KHÔNG positive().int().
    specialSkewRatio: rate,
    specialSkewMinAmount: positiveInt,
    enabled: alertEnabledSchema,
  })
  .partial();

const opsStatsSchema = z
  .object({
    tickSeconds: z.number().int().min(5).max(60),
    topPotentialK: z.number().int().min(20).max(100),
    topAccountsK: z.number().int().min(20).max(100),
    topCombosK: z.number().int().min(20).max(200),
  })
  .partial();

const opsSchema = z
  .object({
    alerts: opsAlertsSchema,
    stats: opsStatsSchema,
  })
  .partial();

// ─────── Root schema ───────

export const updateGameConfigSchema = z
  .object({
    jackpot: jackpotSchema.optional(),
    rates: ratesSchema.optional(),
    defaultPrizes: prizesSchema.optional(),
    play: playSchema.optional(),
    ops: opsSchema.optional(),
  })
  .refine((data) => data.jackpot || data.rates || data.defaultPrizes || data.play || data.ops, {
    message: "Phải cung cấp ít nhất một section để cập nhật.",
  });

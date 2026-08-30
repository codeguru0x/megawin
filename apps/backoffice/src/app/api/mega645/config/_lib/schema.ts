import { Mega645OpsAlertType } from "@megawin/game-mega645/entities";
import { MEGA645_MAX_BOARDS } from "@megawin/game-mega645/rules";
import { HHMM_PATTERN, YMD_PATTERN } from "@megawin/shared/utils";
import { z } from "zod";

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const rate = z.number().min(0).max(1);

const jackpotSchema = z
  .object({
    seedAmount: nonNegativeInt,
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

const playSchema = z
  .object({
    unitPrice: positiveInt,
    minBetCount: positiveInt,
    maxBetCount: positiveInt,
    maxBoardsPerTicket: positiveInt.max(MEGA645_MAX_BOARDS, `Số board tối đa không được vượt ${MEGA645_MAX_BOARDS}.`),
    maxDrawCount: positiveInt,
    salesCloseBeforeMinutes: nonNegativeInt,
    drawsPerWeek: positiveInt,
    drawDaysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
    drawTime: z.string().regex(HHMM_PATTERN, "Giờ phải có format HH:mm"),
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

/** Bật/tắt từng loại alert — khoá theo `Mega645OpsAlertType`. Chỉ 4 alert P0 có toggle
 * ở UI; `revenue_anomaly`/`settle_stuck` để dành nhưng vẫn nhận key (schema chấp nhận). */
const alertEnabledSchema = z
  .object(
    Object.fromEntries(Object.values(Mega645OpsAlertType).map((t) => [t, z.boolean()])) as Record<
      Mega645OpsAlertType,
      z.ZodBoolean
    >,
  )
  .partial();

const opsAlertsSchema = z
  .object({
    largeBetAmount: positiveInt,
    fixedExposureWarnAmount: positiveInt,
    comboAccountsWarn: z.number().int().min(2),
    baoHighStakeAmount: positiveInt,
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

// ─────── Vietlott Period Anchor ───────

/**
 * Neo suy mã kỳ Vietlott cho dialog công bố kết quả.
 *
 * Zod ở đây CHỈ validate format (`YYYY-MM-DD`, `HH:mm`, chuỗi số giữ zero-pad) — KHÔNG
 * refine khớp lịch quay (`drawDaysOfWeek`/`drawTime`) ở tầng route, vì lịch đó phải lấy từ
 * `GlobalConfigDoc` THẬT trong DB (xem `vietlott-period-suggestion/p0-shared.plan.md` §P0.0.1).
 * Việc khớp lịch được kiểm ở use-case `update-game-config.ts` — nơi có config hiện hành từ DB.
 */
const vietlottSchema = z
  .object({
    anchorDrawDate: z.string().regex(YMD_PATTERN, "Ngày phải có format YYYY-MM-DD"),
    anchorDrawTime: z.string().regex(HHMM_PATTERN, "Giờ phải có format HH:mm"),
    anchorPeriod: z.string().regex(/^\d+$/, "Mã kỳ phải là chuỗi số"),
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
    vietlott: vietlottSchema.optional(),
  })
  .refine((data) => data.jackpot || data.rates || data.defaultPrizes || data.play || data.ops || data.vietlott, {
    message: "Phải cung cấp ít nhất một section để cập nhật.",
  });

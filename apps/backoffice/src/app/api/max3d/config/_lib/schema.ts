import { Max3dOpsAlertType } from "@megawin/game-max3d/entities";
import { MAX3D_MAX_BOARDS } from "@megawin/game-max3d/rules";
import { HHMM_PATTERN, YMD_PATTERN } from "@megawin/shared/utils";
import { z } from "zod";

const positiveInt = z.number().int().positive();
/**
 * Số nguyên ≥ 0 — dùng cho field mà 0 là giá trị nghiệp vụ HỢP LỆ, không phải "chưa cấu hình".
 * VD `salesCloseBeforeMinutes = 0` = đóng bán ĐÚNG giờ quay (không có buffer).
 */
const nonNegativeInt = z.number().int().nonnegative();
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

const playSchema = z
  .object({
    unitPrice: positiveInt,
    minBetCount: positiveInt,
    maxBetCount: positiveInt,
    maxBoardsPerTicket: positiveInt.max(MAX3D_MAX_BOARDS, `Số board tối đa không được vượt ${MAX3D_MAX_BOARDS}.`),
    maxDrawCount: positiveInt,
    salesCloseBeforeMinutes: nonNegativeInt,
    drawsPerDay: positiveInt,
    drawTimes: z.array(z.string().regex(HHMM_PATTERN, "Giờ phải có format HH:mm")).min(1),
    drawDaysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Phải chọn ít nhất 1 ngày quay.").max(7),
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

// ─────── Operations & Risk Control (analysis max3d-ops §3.6) ───────

/** Bật/tắt từng loại alert — khoá theo `Max3dOpsAlertType` (derive const-as-const §5.3). */
const alertEnabledSchema = z
  .object(
    Object.fromEntries(Object.values(Max3dOpsAlertType).map((t) => [t, z.boolean()])) as Record<
      Max3dOpsAlertType,
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

// CÓ topCombosK — Max 3D dùng OpsStatsConfig đầy đủ (cắt topPairs).
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

// ─────── Vietlott Period Suggestion ───────

const vietlottSchema = z
  .object({
    anchorDrawDate: z.string().regex(YMD_PATTERN, "Ngày phải có format YYYY-MM-DD"),
    anchorDrawTime: z.string().regex(HHMM_PATTERN, "Giờ phải có format HH:mm"),
    anchorPeriod: z.string().regex(/^\d+$/, "Mã kỳ phải là chuỗi số"),
  })
  .partial();

export const updateGameConfigSchema = z
  .object({
    rates: ratesSchema.optional(),
    defaultPrizes: defaultPrizesSchema.optional(),
    play: playSchema.optional(),
    ops: opsSchema.optional(),
    vietlott: vietlottSchema.optional(),
  })
  .refine((data) => data.rates || data.defaultPrizes || data.play || data.ops || data.vietlott, {
    message: "Phải cung cấp ít nhất một section để cập nhật.",
  });

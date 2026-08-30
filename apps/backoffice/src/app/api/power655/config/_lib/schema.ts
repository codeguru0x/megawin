import { Power655OpsAlertType } from "@megawin/game-power655/entities";
import { POWER655_MAX_BOARDS } from "@megawin/game-power655/rules";
import { HHMM_PATTERN, YMD_PATTERN } from "@megawin/shared/utils";
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

// jp1/jp2 contribution ratio: mỗi field trong khoảng [0.01, 0.99] (1%–99%)
const contributionRate = z.number().min(0.01).max(0.99);

const jackpotSchema = z
  .object({
    jackpot1: jackpot1Schema.optional(),
    jackpot2: jackpot2Schema.optional(),
    jp1ContributionRatio: contributionRate.optional(),
    jp2ContributionRatio: contributionRate.optional(),
    jp1OverflowThreshold: nonNegativeInt,
  })
  .partial()
  .refine(
    (v) => {
      // Chỉ validate khi cả 2 ratio đều có mặt trong payload
      if (v.jp1ContributionRatio !== undefined && v.jp2ContributionRatio !== undefined) {
        // Làm tròn 4 chữ số thập phân để tránh lỗi float point (e.g. 0.9 + 0.1 = 0.9999...)
        const sum = Math.round((v.jp1ContributionRatio + v.jp2ContributionRatio) * 10000) / 10000;
        return sum === 1;
      }
      return true;
    },
    { message: "Tổng jp1ContributionRatio + jp2ContributionRatio phải bằng 100%." },
  )
  .refine(
    (v) => {
      // Chỉ validate khi cả 2 seedAmount đều có mặt
      if (v.jackpot1?.seedAmount !== undefined && v.jackpot2?.seedAmount !== undefined) {
        return v.jackpot2.seedAmount <= v.jackpot1.seedAmount;
      }
      return true;
    },
    { message: "Giá trị khởi điểm JP2 phải ≤ JP1." },
  )
  .refine(
    (v) => {
      // Chỉ validate khi cả overflowThreshold và jp1SeedAmount đều có mặt
      if (v.jp1OverflowThreshold !== undefined && v.jackpot1?.seedAmount !== undefined) {
        return v.jp1OverflowThreshold > v.jackpot1.seedAmount;
      }
      return true;
    },
    { message: "Ngưỡng tràn JP1 phải lớn hơn giá trị khởi điểm JP1." },
  );

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
    maxBoardsPerTicket: positiveInt.max(POWER655_MAX_BOARDS, `Số board tối đa không được vượt ${POWER655_MAX_BOARDS}.`),
    maxDrawCount: positiveInt,
    salesCloseBeforeMinutes: nonNegativeInt,
    drawsPerDay: positiveInt,
    drawTimes: z.array(z.string().regex(HHMM_PATTERN, "Giờ phải có format HH:mm")).min(1),
    drawDaysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
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

/** Bật/tắt từng loại alert — khoá theo `Power655OpsAlertType`. Chỉ 4 alert P0 có toggle;
 * `revenue_anomaly`/`settle_stuck` để dành nhưng vẫn nhận key (schema chấp nhận, UI chưa hiện). */
const alertEnabledSchema = z
  .object(
    Object.fromEntries(Object.values(Power655OpsAlertType).map((t) => [t, z.boolean()])) as Record<
      Power655OpsAlertType,
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
 * refine khớp lịch quay (`drawDaysOfWeek`/`drawTimes`) ở tầng route, vì lịch đó phải lấy từ
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

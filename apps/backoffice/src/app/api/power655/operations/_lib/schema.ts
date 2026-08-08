import { z } from "zod";
import { OpsAlertStatus, PlayType } from "@megawin/game-power655/entities";
import { getRequiredMainCount } from "@megawin/game-power655/rules";
import { power655DrawIdSchema, power655MainNumberSchema } from "@megawin/game-power655/schemas";

/** Tuple giá trị status alert từ const-as-const (§5.3) — KHÔNG string literal trần. */
const OPS_ALERT_STATUS_VALUES = Object.values(OpsAlertStatus) as [OpsAlertStatus, ...OpsAlertStatus[]];

/** Tuple mọi playType hợp lệ — derive từ `PlayType` (§5.3), KHÔNG bảng cố định như Keno. */
const POWER655_PLAY_TYPE_VALUES = Object.values(PlayType) as [PlayType, ...PlayType[]];

/**
 * Schema snapshot vận hành — cần drawId bắt buộc. Gộp mọi số liệu 1 kỳ (timer 1 duy nhất
 * dùng chung cho cả snapshot và live feed — analysis §5.2, D2).
 */
export const snapshotQuerySchema = z.object({
  drawId: power655DrawIdSchema,
});

/**
 * Schema list alert 1 kỳ (staff panel). `grouped` mặc định `true` (gộp theo type cho gọn),
 * `grouped=false` để drill-down raw. `status` lọc theo lifecycle alert.
 */
export const listAlertsQuerySchema = z.object({
  drawId: power655DrawIdSchema,
  status: z.enum(OPS_ALERT_STATUS_VALUES).optional(),
  grouped: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
});

/**
 * Schema combo-lookup (staff) — tra 1 board theo playType trong 1 kỳ.
 *
 * `numbers` nhận CSV ("01,05,...") → mảng "01".."55" distinct (dùng chung
 * `power655MainNumberSchema` — KHÔNG lặp lại regex). Số lượng số hợp lệ PHỤ
 * THUỘC playType (5=bao5, 6=standard, 7-15=baoN, 18=bao18) — KHÁC Keno chỉ 3 giá trị cố
 * định (8/9/10). `.refine` cross-field ở CUỐI đối chiếu `numbers.length` với
 * `getRequiredMainCount(playType)` — CHỐT CHẶN CUỐI khi UI tự suy playType sai (analysis
 * §3.10(7)); use-case KHÔNG validate lại (rule §8 code-quality).
 */
export const comboLookupQuerySchema = z
  .object({
    drawId: power655DrawIdSchema,
    playType: z.enum(POWER655_PLAY_TYPE_VALUES, {
      message: "playType không hợp lệ.",
    }),
    numbers: z
      .string()
      .min(1, "numbers là bắt buộc.")
      .transform((s) => s.split(",").map((n) => n.trim()))
      .pipe(
        z
          .array(power655MainNumberSchema)
          .min(5, "Cần 5, 6, 7-15 hoặc 18 số tuỳ playType.")
          .max(18, "Cần 5, 6, 7-15 hoặc 18 số tuỳ playType.")
          .refine((arr) => new Set(arr).size === arr.length, "Số bị trùng."),
      ),
  })
  .refine((data) => data.numbers.length === getRequiredMainCount(data.playType), {
    message: "Số lượng số không khớp playType đã chọn.",
    path: ["numbers"],
  });

import { z } from "zod";
import { MEGA645_PLAY_TYPE_VALUES, OpsAlertStatus, PlayType } from "@megawin/game-mega645/entities";
import { getRequiredNumberCount } from "@megawin/game-mega645/rules";

/** Tuple giá trị status alert từ const-as-const (§5.3) — KHÔNG string literal trần. */
const OPS_ALERT_STATUS_VALUES = Object.values(OpsAlertStatus) as [
  OpsAlertStatus,
  ...OpsAlertStatus[],
];

/** Tuple mọi playType hợp lệ — derive từ `PlayType` (§5.3). */
const MEGA645_PLAY_TYPE_TUPLE = MEGA645_PLAY_TYPE_VALUES as [PlayType, ...PlayType[]];

/**
 * Schema snapshot vận hành — cần drawId bắt buộc. Gộp mọi số liệu 1 kỳ (timer chung
 * dùng cho cả snapshot và live feed — analysis §5.2).
 */
export const snapshotQuerySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
});

/**
 * Schema list alert 1 kỳ (staff panel). `grouped` mặc định `true` (gộp theo type cho gọn),
 * `grouped=false` để drill-down raw. `status` lọc theo lifecycle alert.
 */
export const listAlertsQuerySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  status: z.enum(OPS_ALERT_STATUS_VALUES).optional(),
  grouped: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
});

/**
 * Schema combo-lookup (staff) — tra 1 board theo playType trong 1 kỳ.
 *
 * `numbers` nhận CSV ("01,05,...") → mảng "01".."45" distinct. Số lượng số hợp lệ PHỤ
 * THUỘC playType (5=bao5, 6=standard, 7-15=baoN, 18=bao18). `.refine` cross-field ở CUỐI
 * đối chiếu `numbers.length` với `getRequiredNumberCount(playType)` — CHỐT CHẶN CUỐI khi
 * UI tự suy playType sai (analysis §3.10(7)); use-case KHÔNG validate lại (rule §8
 * code-quality).
 */
export const comboLookupQuerySchema = z
  .object({
    drawId: z.string().min(1, "drawId là bắt buộc."),
    playType: z.enum(MEGA645_PLAY_TYPE_TUPLE, {
      message: "playType không hợp lệ.",
    }),
    numbers: z
      .string()
      .min(1, "numbers là bắt buộc.")
      .transform((s) => s.split(",").map((n) => n.trim()))
      .pipe(
        z
          .array(z.string().regex(/^(0[1-9]|[1-3][0-9]|4[0-5])$/, "Số phải là '01'..'45'."))
          .min(5, "Cần 5, 6, 7-15 hoặc 18 số tuỳ playType.")
          .max(18, "Cần 5, 6, 7-15 hoặc 18 số tuỳ playType.")
          .refine((arr) => new Set(arr).size === arr.length, "Số bị trùng."),
      ),
  })
  .refine((data) => data.numbers.length === getRequiredNumberCount(data.playType), {
    message: "Số lượng số không khớp playType đã chọn.",
    path: ["numbers"],
  });

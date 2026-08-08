import { OpsAlertStatus, PlayType } from "@megawin/game-lotto535/entities";
import { validateSelection } from "@megawin/game-lotto535/rules";
import { z } from "zod";

/** Tuple giá trị status alert từ const-as-const (§5.3) — KHÔNG string literal trần. */
const OPS_ALERT_STATUS_VALUES = Object.values(OpsAlertStatus) as [OpsAlertStatus, ...OpsAlertStatus[]];

/** Tuple mọi playType hợp lệ — derive từ `PlayType` (§5.3). */
const LOTTO535_PLAY_TYPE_VALUES = Object.values(PlayType) as [PlayType, ...PlayType[]];

/**
 * Schema snapshot vận hành — cần drawId bắt buộc. Gộp mọi số liệu 1 kỳ (timer 1 duy nhất
 * dùng chung cho cả snapshot và live feed — analysis §5.2, mirror Power 6/55 D2).
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

const csvToArray = (s: string) => s.split(",").map((n) => n.trim());

/** Regex "01".."35" zero-padded — mirror `VALID_MAIN_NUMBER_SET` (entities/types.ts). */
const MAIN_NUMBER_REGEX = /^(0[1-9]|[12][0-9]|3[0-5])$/;
/** Regex "01".."12" zero-padded — mirror `VALID_SPECIAL_NUMBER_SET` (entities/types.ts). */
const SPECIAL_NUMBER_REGEX = /^(0[1-9]|1[0-2])$/;

/**
 * Schema combo-lookup (staff) — tra 1 board theo playType trong 1 kỳ.
 *
 * `mainNumbers`/`specialNumbers` nhận CSV riêng — Lotto 5/35 luôn có 2 chiều số (KHÁC
 * Power 6/55 chỉ 1 chiều "numbers"). `.refine` cuối gọi thẳng `validateSelection` (domain
 * rule, đã tự kiểm range/trùng/số-lượng theo từng playType) — CHỐT CHẶN CUỐI khi UI tự suy
 * playType sai (analysis §3.10(7)); use-case KHÔNG validate lại (rule §8 code-quality).
 */
export const comboLookupQuerySchema = z
  .object({
    drawId: z.string().min(1, "drawId là bắt buộc."),
    playType: z.enum(LOTTO535_PLAY_TYPE_VALUES, {
      message: "playType không hợp lệ.",
    }),
    mainNumbers: z
      .string()
      .min(1, "mainNumbers là bắt buộc.")
      .transform(csvToArray)
      .pipe(
        z
          .array(z.string().regex(MAIN_NUMBER_REGEX, "Số chính phải là '01'..'35'."))
          .min(1)
          .refine((arr) => new Set(arr).size === arr.length, "Số chính bị trùng."),
      ),
    specialNumbers: z
      .string()
      .min(1, "specialNumbers là bắt buộc.")
      .transform(csvToArray)
      .pipe(
        z
          .array(z.string().regex(SPECIAL_NUMBER_REGEX, "Số đặc biệt phải là '01'..'12'."))
          .min(1)
          .refine((arr) => new Set(arr).size === arr.length, "Số đặc biệt bị trùng."),
      ),
  })
  .refine(
    (data) =>
      validateSelection(data.playType, {
        mainNumbers: data.mainNumbers,
        specialNumbers: data.specialNumbers,
      }).valid,
    { message: "Số lượng số không khớp playType đã chọn.", path: ["mainNumbers"] },
  );

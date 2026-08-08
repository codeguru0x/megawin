import { z } from "zod";
import { OpsAlertStatus, KenoPlayType } from "@megawin/game-keno/entities";

/** Tuple giá trị status alert từ const-as-const (§5.3) — KHÔNG string literal trần. */
const OPS_ALERT_STATUS_VALUES = Object.values(OpsAlertStatus) as [OpsAlertStatus, ...OpsAlertStatus[]];

/** Kiểu chơi cappable pick8/9/10 — derive từ `KenoPlayType` (§5.3). */
const CAPPABLE_PLAY_TYPE_VALUES = [KenoPlayType.Pick8, KenoPlayType.Pick9, KenoPlayType.Pick10] as const;

/**
 * Schema cho live-entries — cần drawId bắt buộc + limit optional.
 */
export const liveEntriesQuerySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * Schema cho winning-entries — cần drawId bắt buộc + cursor pagination.
 */
export const winningEntriesQuerySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * Schema cho combo-lookup (staff) — tra 1 bộ số cappable pick8/9/10 trong 1 kỳ.
 *
 * `numbers` nhận CSV ("01,05,12,...") hoặc mảng; validate 8–10 số "01".."80" distinct.
 * Số phần tử khớp playType được check ở use-case (pick8=8, pick9=9, pick10=10).
 */
export const comboLookupQuerySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  playType: z.enum(CAPPABLE_PLAY_TYPE_VALUES, {
    message: "playType phải là pick8, pick9 hoặc pick10.",
  }),
  numbers: z
    .string()
    .min(1, "numbers là bắt buộc.")
    .transform((s) => s.split(",").map((n) => n.trim()))
    .pipe(
      z
        .array(z.string().regex(/^(0[1-9]|[1-7][0-9]|80)$/, "Số phải là '01'..'80'."))
        .min(8, "Cần 8–10 số.")
        .max(10, "Cần 8–10 số.")
        .refine((arr) => new Set(arr).size === arr.length, "Số bị trùng."),
    ),
});

/**
 * Schema snapshot vận hành — cần drawId bắt buộc. Gộp mọi số liệu 1 kỳ (timer 1 duy nhất).
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

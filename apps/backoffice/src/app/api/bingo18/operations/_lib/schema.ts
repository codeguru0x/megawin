import { z } from "zod";
import { OpsAlertStatus } from "@megawin/game-bingo18/entities";

/** Tuple giá trị status alert từ const-as-const (§5.3) — KHÔNG string literal trần. */
const OPS_ALERT_STATUS_VALUES = Object.values(OpsAlertStatus) as [OpsAlertStatus, ...OpsAlertStatus[]];

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

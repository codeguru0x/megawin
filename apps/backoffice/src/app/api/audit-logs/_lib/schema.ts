import { z } from "zod";
import {
  AuditActionLabel,
  AuditActorType,
  AuditCategory,
  AuditStatus,
  AuditTargetType,
} from "@megawin/audit/entities";
import type { AuditAction } from "@megawin/audit/entities";
import { decodeAuditCursor } from "@megawin/audit/use-cases";
import { Pagination } from "@megawin/shared/constants/pagination";
import { toVNStartOfDay, toVNEndOfDay } from "@megawin/shared/utils/date";

const actorTypeValues = Object.values(AuditActorType) as [AuditActorType, ...AuditActorType[]];
const categoryValues = Object.values(AuditCategory) as [AuditCategory, ...AuditCategory[]];
const statusValues = Object.values(AuditStatus) as [AuditStatus, ...AuditStatus[]];
const targetTypeValues = Object.values(AuditTargetType) as [AuditTargetType, ...AuditTargetType[]];
// Keys của AuditActionLabel = toàn bộ value trong AUDIT_ACTIONS (Record ép đủ).
const actionValues = Object.keys(AuditActionLabel) as [string, ...string[]];

/** Date-only format `YYYY-MM-DD` — không chứa ký tự `T`. */
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Giới hạn date range để tránh full-collection scan. */
const MAX_RANGE_DAYS = 31;
/** Retention window — TTL MongoDB purge sau 90 ngày. */
const MAX_LOOKBACK_DAYS = 90;
const MS_PER_DAY = 86_400_000;

/**
 * Parse 1 biên ngày → `Date`.
 *
 * Date-only `YYYY-MM-DD` → múi giờ VN (`start` 00:00:00, `end` 23:59:59.999).
 * ISO full (có `T`) → parse thẳng. Trả `Date` invalid nếu chuỗi sai — được
 * `.refine` bên dưới bắt lại.
 */
function parseBoundary(raw: string, kind: "start" | "end"): Date {
  if (DATE_ONLY_REGEX.test(raw)) {
    return kind === "start" ? toVNStartOfDay(raw) : toVNEndOfDay(raw);
  }
  return new Date(raw);
}

const boundarySchema = (kind: "start" | "end") =>
  z
    .string()
    .min(1)
    .transform((raw) => parseBoundary(raw, kind))
    .refine((d) => !Number.isNaN(d.getTime()), {
      message: kind === "start" ? "Ngày bắt đầu không hợp lệ" : "Ngày kết thúc không hợp lệ",
    });

/**
 * Query schema cho `GET /api/audit-logs`.
 *
 * Toàn bộ parse + validate ở đây — use-case nhận input đã sạch:
 * - `from`/`to`: `YYYY-MM-DD` (giờ VN) hoặc ISO → `Date` UTC boundary.
 * - `actor`: khớp `actorId` (chính xác) hoặc `actorName` (chứa) — repo lo `$or`.
 * - `ip`: khớp chính xác IP actor (forensic) — dùng index `{ ip: 1, ts: -1 }`.
 * - `limit`: coerce number, cap `[1, Max.Size]`, default `Default.Size`.
 * - `cursor`: opaque base64url token → decode thành `AuditLogCursor (ts, id)`.
 *   Token thiếu/hỏng → `undefined` (trang đầu). Client KHÔNG tự dựng cursor.
 *
 * `.superRefine` chặn range > 31 ngày, lookback > 90 ngày, và `from > to`.
 */
export const listAuditLogsQuerySchema = z
  .object({
    from: boundarySchema("start").optional(),
    to: boundarySchema("end").optional(),
    actor: z.string().min(1).optional(),
    actorType: z.enum(actorTypeValues).optional(),
    ip: z.string().min(1).optional(),
    tenantId: z.string().min(1).optional(),
    game: z.string().min(1).optional(),
    category: z.enum(categoryValues).optional(),
    action: z.enum(actionValues).optional(),
    targetType: z.enum(targetTypeValues).optional(),
    targetId: z.string().min(1).optional(),
    status: z.enum(statusValues).optional(),
    limit: z.coerce.number().int().min(1).max(Pagination.Max.Size).default(Pagination.Default.Size),
    // limit: z.coerce.number().int().min(1).max(Pagination.Max.Size).default(5),
    cursor: z.string().min(1).optional(),
  })
  .transform(({ cursor, action, ...rest }) => {
    // Opaque token → AuditLogCursor. Token hỏng/tampered → null = trang đầu.
    const decoded = decodeAuditCursor(cursor) ?? undefined;
    // Schema whitelist action từ AuditActionLabel → cast về AuditAction union hẹp.
    return { ...rest, action: action as AuditAction | undefined, cursor: decoded };
  })
  .superRefine((val, ctx) => {
    const { from, to } = val;
    if (from && to && from > to) {
      ctx.addIssue({ code: "custom", message: "`from` phải ≤ `to`", path: ["from"] });
    }
    if (from && to) {
      // +1ms bù `toVNEndOfDay` kết thúc 23:59:59.999 → same-day = 1 ngày, không 0.
      const rangeDays = Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
      if (rangeDays > MAX_RANGE_DAYS) {
        ctx.addIssue({
          code: "custom",
          message: `Phạm vi tối đa ${MAX_RANGE_DAYS} ngày`,
          path: ["to"],
        });
      }
    }
    if (from && Date.now() - from.getTime() > MAX_LOOKBACK_DAYS * MS_PER_DAY) {
      ctx.addIssue({
        code: "custom",
        message: `Chỉ tra cứu trong ${MAX_LOOKBACK_DAYS} ngày gần nhất`,
        path: ["from"],
      });
    }
  });

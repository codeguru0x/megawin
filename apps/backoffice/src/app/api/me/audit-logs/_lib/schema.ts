import { z } from "zod";
import { AuditStatus, SELF_ACTIVITY_ACTIONS } from "@megawin/audit/entities";
import type { AuditAction } from "@megawin/audit/entities";
import { decodeAuditCursor } from "@megawin/audit/use-cases";
import { Pagination } from "@megawin/shared/constants/pagination";
import { toVNStartOfDay, toVNEndOfDay } from "@megawin/shared/utils/date";

const statusValues = Object.values(AuditStatus) as [AuditStatus, ...AuditStatus[]];
// Action whitelist = tập security self-visible (auth/account). Client chỉ được
// lọc trong tập này; giá trị ngoài → Zod reject.
const actionValues = SELF_ACTIVITY_ACTIONS as readonly [AuditAction, ...AuditAction[]];

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
 * Query schema cho `GET /api/me/audit-logs` (self-scoped security activity).
 *
 * CHỈ gồm filter có ý nghĩa cho nhật ký bảo mật cá nhân: date range, loại action
 * (whitelist trong `SELF_ACTIVITY_ACTIONS` — auth/account), kết quả success/failure.
 *
 * KHÔNG có `actor`/`actorType`/`ip`/`tenantId`/`game`/`category`/`targetType`/
 * `targetId`: route ép self-scope theo `accountId` server-side (xem
 * {@link AuditLogFilter.selfScope}), và các chiều game/category/target không áp
 * dụng cho nhóm action security. Client KHÔNG thể mở rộng phạm vi xem log.
 *
 * `.superRefine` chặn range > 31 ngày, lookback > 90 ngày, và `from > to`.
 */
export const listMyAuditLogsQuerySchema = z
  .object({
    from: boundarySchema("start").optional(),
    to: boundarySchema("end").optional(),
    action: z.enum(actionValues).optional(),
    status: z.enum(statusValues).optional(),
    limit: z.coerce.number().int().min(1).max(Pagination.Max.Size).default(Pagination.Default.Size),
    cursor: z.string().min(1).optional(),
  })
  .transform(({ cursor, ...rest }) => {
    // Opaque token → AuditLogCursor. Token hỏng/tampered → null = trang đầu.
    const decoded = decodeAuditCursor(cursor) ?? undefined;
    return { ...rest, cursor: decoded };
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

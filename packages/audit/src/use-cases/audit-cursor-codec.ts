/**
 * Opaque cursor codec cho list audit log — thin wrapper quanh codec generic.
 *
 * Dùng {@link encodeCursor}/{@link decodeCursor} từ `@megawin/data/mongo` (base64url
 * dùng chung, DRY) và chỉ bổ sung phần **riêng của audit**:
 * - Cursor audit là compound `{ ts, id }`; `ts` truyền qua HTTP dạng ISO string,
 *   nhưng use-case cần `Date` → decode convert `string → Date`.
 * - Validate `id` phải là ObjectId hex 24 ký tự để chặn payload rác/tampered.
 *
 * Chỉ dùng ở tầng route (biên giới HTTP): schema decode input, route encode output.
 * Use-case + repo giữ nguyên `AuditLogCursor` object.
 */

import { encodeCursor, decodeCursor, isObjectId } from "@megawin/data/mongo";

import type { AuditLogCursor } from "../infras/repos";

/** Payload cursor sau serialize (ts ISO string, id ObjectId hex). */
interface CursorPayload {
  ts: string;
  id: string;
}

/** Type-guard: value là `{ ts: string; id: ObjectId hex }` hợp lệ. */
function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { ts, id } = value as Record<string, unknown>;

  return typeof ts === "string" && isObjectId(id);
}

/**
 * Encode cursor object → opaque base64url token cho FE.
 *
 * @param cursor - `{ ts: ISO string; id }` từ `AuditLogCursorPage.nextCursor`
 * @returns Token opaque base64url, hoặc `null` nếu `cursor` null
 */
export function encodeAuditCursor(cursor: { ts: string; id: string } | null): string | null {
  return encodeCursor(cursor);
}

/**
 * Decode opaque token → {@link AuditLogCursor} (`{ ts: Date, id }`) cho use-case.
 *
 * Fail-safe: token thiếu/hỏng/sai shape/`id` không phải ObjectId hex/ts invalid →
 * trả `null` (trang đầu) thay vì throw.
 *
 * @param token - Chuỗi opaque từ query param `cursor` (base64url)
 * @returns `AuditLogCursor` hợp lệ, hoặc `null`
 */
export function decodeAuditCursor(token: string | undefined | null): AuditLogCursor | null {
  const payload = decodeCursor(token, isCursorPayload);
  if (!payload) {
    return null;
  }

  const ts = new Date(payload.ts);
  if (Number.isNaN(ts.getTime())) {
    return null;
  }

  return { ts, id: payload.id };
}

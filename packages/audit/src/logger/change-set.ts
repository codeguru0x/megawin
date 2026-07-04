import { omitUndefined } from "@megawin/shared/utils";

import type { AuditChangeSet, AuditChangeValue } from "../entities";

/**
 * Helper build `changes` diff cho audit — dùng chung mọi game.
 *
 * Ép diff LUÔN **phẳng & người-đọc-hiểu** ({@link AuditChangeValue}: primitive +
 * mảng primitive). Chặn caller nhét object lồng / payload lạ / rác vào DB
 * (audit append-only, khó dọn). UI render trực tiếp, không cần đệ quy JSON.
 */

/**
 * Loại field `undefined` khỏi 1 phía diff → `AuditChangeSet` sạch.
 *
 * `AuditChangeValue` KHÔNG gồm `undefined` (không ghi field rỗng vào DB). Helper
 * nhận input optional (`{ openAt?: string }`) rồi lọc undefined trước khi ghi.
 * LUÔN trả object (kể cả `{}`) — `changes.before/after` là `AuditChangeSet`, không
 * optional-empty. Cần "rỗng → undefined" (bỏ hẳn key khỏi doc) thì dùng
 * `pruneUndefined` từ `@megawin/shared/utils`.
 *
 * Chỉ là wrapper gắn type audit quanh {@link omitUndefined} (logic lọc chung ở
 * shared) — giữ tên domain + kiểu `AuditChangeSet` cho 7 game service dùng.
 *
 * @param obj - Object có thể chứa field `undefined`.
 * @returns `AuditChangeSet` chỉ còn field có giá trị.
 */
export function dropUndefined(obj: Record<string, AuditChangeValue | undefined>): AuditChangeSet {
  return omitUndefined(obj) as AuditChangeSet;
}

/** Mảng primitive (`number[]`/`string[]`) → là {@link AuditChangeValue} hợp lệ, KHÔNG flatten tiếp. */
function isPrimitiveArray(value: unknown): value is Array<string | number | boolean | null> {
  return Array.isArray(value) && value.every((v) => v == null || typeof v !== "object");
}

/**
 * Flatten đệ quy 1 object config lồng → `AuditChangeSet` phẳng theo dot-path.
 *
 * Giữ **chính xác giá trị sâu** thay vì tóm tắt "N mục" — audit config quan trọng
 * (basicPrizes, prize table…) cần thấy đúng số nào đổi. Value luôn là
 * {@link AuditChangeValue}: primitive giữ nguyên, mảng primitive giữ nguyên,
 * object lồng đệ quy tiếp với key nối bằng `.`.
 *
 * @example
 * ```ts
 * flattenChanges({ basicPrizes: { pick8: { match5: 10, match6: 50 } } })
 * // → { "basicPrizes.pick8.match5": 10, "basicPrizes.pick8.match6": 50 }
 * ```
 *
 * @param obj - Object cần flatten (nhóm config đã đổi).
 * @param prefix - Path prefix nội bộ khi đệ quy (caller để trống).
 * @returns `AuditChangeSet` phẳng, key là dot-path tới từng giá trị lá.
 */
export function flattenChanges(obj: Record<string, unknown>, prefix = ""): AuditChangeSet {
  const out: AuditChangeSet = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value == null || typeof value !== "object" || isPrimitiveArray(value)) {
      // Lá: primitive, null, hoặc mảng primitive → ghi thẳng.
      out[path] = value as AuditChangeValue;
    } else {
      // Object lồng → đệ quy, nối path bằng dấu chấm.
      Object.assign(out, flattenChanges(value as Record<string, unknown>, path));
    }
  }
  return out;
}

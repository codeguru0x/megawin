/**
 * Serialize runtime — cặp đôi hàm chạy thật của type `WireType<T>`
 * (`@megawin/shared/types`).
 *
 * Hai biến thể cùng shape (`Date` → `string`), khác **nội dung** chuỗi thời gian:
 *
 * | Hàm | Chuỗi thời gian | Dùng khi |
 * |---|---|---|
 * | {@link serializeDates} | ISO UTC (`…Z`) | HTTP wire, cache, log, API response |
 * | {@link serializeDatesVN} | `yyyy-MM-dd HH:mm:ss` giờ VN | Payload cho người/LLM đọc (AI tool, prompt) |
 *
 * Use-case layer khai `WireType<Entity>` rồi gọi một trong hai tại điểm return — runtime
 * khớp type ngay, không cần cast `as unknown as X`.
 */
import type { WireType } from "../types/wire-type";
import { formatVNDateTime } from "./date";

/**
 * Object "phẳng" — literal `{}` hoặc `Object.create(null)`.
 *
 * Dùng để CHẶN đệ quy vào class instance (`Map`, `Set`, BSON type, entity có method):
 * `Object.entries` trên chúng chỉ lấy own enumerable prop, nên `new Map([["a", 1]])`
 * thành `{}` — mất sạch dữ liệu mà không có lỗi nào báo. Giữ nguyên giá trị lạ để
 * consumer tự vỡ ở chỗ có ngữ cảnh (biên tool eve reject và in tên field, hoặc
 * `JSON.stringify` dùng `toJSON()` của chính nó) tốt hơn là âm thầm thay bằng `{}`.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * ISO datetime có chữ `T` giữa ngày và giờ — dạng `toISOString()` / wire HTTP hay trả.
 * VD: `2026-09-04T07:43:28.000Z`, `2026-09-04T14:43:28+07:00`.
 */
const ISO_DATETIME_PREFIX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Đổi một `Date` hoặc chuỗi ISO datetime sang `yyyy-MM-dd HH:mm:ss` giờ VN.
 * Trả `null` khi không phải timestamp cần đổi (để caller giữ nguyên giá trị gốc).
 */
function toVnDateTimeString(value: Date | string): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return formatVNDateTime(value);
  }
  if (!ISO_DATETIME_PREFIX.test(value)) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return formatVNDateTime(parsed);
}

/**
 * Chuyển mọi `Date` instance thành ISO UTC string, đệ quy qua array và nested
 * object — implementation runtime tương ứng type {@link WireType}.
 *
 * An toàn cho object lồng nhiều tầng, field optional (`undefined` giữ nguyên),
 * và array. CHỈ đệ quy vào **plain object** — domain entity ở boundary use-case
 * luôn là plain data sau khi qua repo mapper (`ObjectId` đã map thành
 * `id: string`, `Long` đã `.toString()`... từ trước), không còn class instance
 * nào khác `Date`. Gặp class instance khác (`Map`, `Set`, BSON type còn sót) thì
 * TRẢ NGUYÊN VẸN, không biến thành `{}` — xem {@link isPlainObject}.
 *
 * @example
 * ```ts
 * const draw = await this.drawRepo.getDrawById(input.drawId); // DrawEntity (Date thật)
 * return { draw: serializeDates(draw) }; // WireType<DrawEntity> — type khớp runtime, không cast
 * ```
 *
 * @see {@link serializeDatesVN} — cùng walk, nhưng format giờ Việt Nam cho người/LLM đọc.
 */
export function serializeDates<T>(value: T): WireType<T> {
  if (value instanceof Date) {
    return value.toISOString() as WireType<T>;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => serializeDates(item)) as WireType<T>;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = serializeDates(v);
    }
    return out as WireType<T>;
  }
  return value as WireType<T>;
}

/**
 * Đệ quy đổi mọi `Date` và chuỗi ISO datetime thành giờ Việt Nam
 * (`yyyy-MM-dd HH:mm:ss`, `Asia/Ho_Chi_Minh`) — cùng shape {@link WireType} với
 * {@link serializeDates}, khác nội dung chuỗi.
 *
 * Dùng khi consumer **đọc và nhắc** timestamp (AI agent, prompt, báo cáo text). Model đọc
 * ISO UTC rồi nhắc nguyên văn → lệch 7h so với dashboard giờ VN (bug thật 04/09/2026).
 *
 * Cũng đổi chuỗi ISO đã có `T` (UTC `Z` hoặc offset) — vì nhiều use-case đã gọi
 * `toISOString()` trước khi tới biên serialize.
 *
 * KHÔNG đụng:
 * - Ngày lịch thuần `YYYY-MM-DD` (ngày tài chính, drawDate, from/to)
 * - Chuỗi giờ cấu hình `HH:mm` / `HH:mm:ss` không kèm ngày
 * - `drawId` dạng `YYYY-MM-DD.NNN`
 * - Chuỗi đã là `yyyy-MM-dd HH:mm:ss` (không có `T`) — coi như đã đúng giờ VN
 *
 * @example Biên tool AI backoffice:
 * ```ts
 * return { success: true, data: serializeDatesVN(result.data) };
 * // publishedAt: "2026-09-04T07:43:28.000Z" → "2026-09-04 14:43:28"
 * ```
 */
export function serializeDatesVN<T>(value: T): WireType<T> {
  if (value instanceof Date) {
    const formatted = toVnDateTimeString(value);
    return (formatted ?? value.toISOString()) as WireType<T>;
  }
  if (typeof value === "string") {
    const formatted = toVnDateTimeString(value);
    return (formatted ?? value) as WireType<T>;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => serializeDatesVN(item)) as WireType<T>;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = serializeDatesVN(v);
    }
    return out as WireType<T>;
  }
  return value as WireType<T>;
}

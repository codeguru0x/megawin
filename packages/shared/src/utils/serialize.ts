/**
 * Serialize runtime — cặp đôi hàm chạy thật của type `WireType<T>`
 * (`@megawin/shared/types`).
 *
 * HAI NƠI DÙNG:
 *
 * 1. **Use-case layer** khi response type khai `WireType<Entity>`: gọi hàm này
 *    tại điểm return để runtime value KHỚP ĐÚNG type ngay lập tức, thay vì cast
 *    `as unknown as X` — cast chỉ đổi type khai báo, KHÔNG đổi giá trị thật
 *    (`draw` vẫn là object chứa `Date` instance). Cast kiểu đó "chạy đúng" chỉ vì
 *    tình cờ `NextResponse.json()` gọi `JSON.stringify` ngay sau đó (và
 *    `Date.prototype.toJSON` tự trả ISO string) — nhưng compiler không còn khả
 *    năng bắt lỗi nếu entity thêm field `Date` mới mà quên cascade, và mọi nơi
 *    khác tiêu thụ trực tiếp use-case output (unit test, cache, log...) trước khi
 *    qua `NextResponse.json` sẽ nhận sai runtime type.
 *
 * 2. **Biên tool của AI agent** (`apps/backoffice/agent/tools/*`): eve validate
 *    output của `execute` bằng bộ kiểm tra JSON nghiêm ngặt và **không** gọi
 *    `toJSON()`, nên `Date` bị coi là không serialize được và turn chết với
 *    `ToolOutputSerializationError`. Đây là bẫy có hệ thống vì mọi entity report
 *    Mongo đều mang `createdAt`/`updatedAt`/`snapshotAt` kiểu `Date` (repo mapper
 *    chỉ đổi `_id` → `id`, giữ nguyên `Date`) — tool nào trả thẳng entity đều dính.
 *    ISO 8601 cũng là dạng model đọc tốt nhất (`"2026-08-16T07:12:00.000Z"`).
 */
import type { WireType } from "../types/wire-type";

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
 * Chuyển mọi `Date` instance thành ISO string, đệ quy qua array và nested
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
 * @example Biên tool của eve — eve validate output bằng bộ kiểm tra JSON nghiêm ngặt
 * và KHÔNG gọi `toJSON()`, nên `Date` làm turn chết với `ToolOutputSerializationError`.
 * Mọi entity report Mongo đều mang `createdAt`/`updatedAt` kiểu `Date`:
 * ```ts
 * execute: async (input) => serializeDates(await useCase.safeRun(input))
 * ```
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

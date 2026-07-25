/**
 * Serialize runtime — cặp đôi hàm chạy thật của type `WireType<T>`
 * (`@megawin/shared/types`).
 *
 * Dùng ở use-case layer khi response type khai `WireType<Entity>`: gọi hàm
 * này tại điểm return để runtime value KHỚP ĐÚNG type ngay lập tức, thay vì
 * cast `as unknown as X` — cast chỉ đổi type khai báo, KHÔNG đổi giá trị thật
 * (`draw` vẫn là object chứa `Date` instance). Cast kiểu đó "chạy đúng" chỉ vì
 * tình cờ `NextResponse.json()` gọi `JSON.stringify` ngay sau đó (và
 * `Date.prototype.toJSON` tự trả ISO string) — nhưng compiler không còn khả
 * năng bắt lỗi nếu entity thêm field `Date` mới mà quên cascade, và mọi nơi
 * khác tiêu thụ trực tiếp use-case output (unit test, cache, log...) trước khi
 * qua `NextResponse.json` sẽ nhận sai runtime type.
 */
import type { WireType } from "../types/wire-type";

/**
 * Chuyển mọi `Date` instance thành ISO string, đệ quy qua array và nested
 * object — implementation runtime tương ứng type {@link WireType}.
 *
 * An toàn cho object lồng nhiều tầng, field optional (`undefined` giữ nguyên),
 * và array. CHỈ dùng cho plain object/array/Date — domain entity ở boundary
 * use-case luôn là plain data sau khi qua repo mapper (`ObjectId` đã map
 * thành `id: string`, `Long` đã `.toString()`... từ trước), không còn class
 * instance nào khác `Date`.
 *
 * @example
 * ```ts
 * const draw = await this.drawRepo.getDrawById(input.drawId); // DrawEntity (Date thật)
 * return { draw: serializeDates(draw) }; // WireType<DrawEntity> — type khớp runtime, không cast
 * ```
 */
export function serializeDates<T>(value: T): WireType<T> {
  if (value instanceof Date) {
    return value.toISOString() as WireType<T>;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeDates(item)) as WireType<T>;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = serializeDates(v);
    }
    return out as WireType<T>;
  }
  return value as WireType<T>;
}

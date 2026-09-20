/**
 * Chuỗi hiển thị an toàn từ `unknown`.
 *
 * Không bao giờ gọi `String(object)` (ra `"[object Object]"`) — object/array trả `fallback`.
 * Dùng cho alert payload, audit metadata, chart cell khi type runtime chưa chắc.
 */
export function unknownToDisplayString(value: unknown, fallback = ""): string {
  if (value == null) {
    return fallback;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return fallback;
}

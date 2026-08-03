import { ObjectId } from "mongodb";

/**
 * ObjectId nhỏ nhất — 24 số 0 hex, dùng làm **sentinel "từ đầu"** cho watermark string.
 *
 * Mọi ObjectId thật đều LỚN hơn giá trị này (4 byte đầu là timestamp Unix > 0), nên:
 * - `{ _id: { $gt: MIN_OBJECT_ID } }` khớp mọi entry ⇒ đọc từ đầu.
 * - `{ lastEntryId: { $lt: batchMaxId } }` với `lastEntryId = MIN_OBJECT_ID` luôn khớp
 *   lần áp batch ĐẦU — tránh phải viết `$or: [{$exists:false}, {$lt}]` cho doc chưa từng
 *   cộng delta (Mongo `$lt: <string>` KHÔNG khớp field thiếu do type-bracketing).
 *
 * Seed field watermark bằng hằng này thay vì để field vắng mặt ⇒ filter `$lt` thuần đủ dùng.
 */
export const MIN_OBJECT_ID = "000000000000000000000000";

/**
 * Kiểm tra một string có phải là MongoDB ObjectId hợp lệ không.
 *
 * Hợp lệ khi: đúng 24 ký tự hex (0-9, a-f, A-F).
 * Dùng trước khi `new ObjectId(str)` để tránh exception runtime.
 */
export function isObjectId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return ObjectId.isValid(value) && value.length === 24;
}

/**
 * Tạo một ObjectId string mới (24 ký tự hex).
 *
 * Wrapper thuận tiện — tránh import `ObjectId` từ `mongodb` rải rác khắp codebase.
 */
export function newObjectId(): string {
  return new ObjectId().toHexString();
}

/**
 * Chuyển một string thành `ObjectId` instance.
 *
 * Throws `Error` nếu `id` không phải ObjectId hợp lệ.
 * Luôn gọi `isObjectId(id)` trước nếu input đến từ bên ngoài (API, query param...).
 */
export function toObjectId(id: string): ObjectId {
  if (!isObjectId(id)) {
    throw new Error(`Invalid ObjectId: "${id}"`);
  }
  return new ObjectId(id);
}

/**
 * Chuyển một `ObjectId` instance (hoặc string) thành hex string 24 ký tự.
 *
 * Dùng khi cần normalize giá trị trả về từ MongoDB driver về string thuần.
 */
export function objectIdToString(id: ObjectId | string): string {
  if (typeof id === "string") return id;
  return id.toHexString();
}

/**
 * So sánh bằng hai ObjectId (có thể là string hoặc ObjectId instance).
 *
 * Tránh so sánh reference giữa hai ObjectId instance khác nhau (luôn `false`).
 */
export function objectIdEquals(a: ObjectId | string, b: ObjectId | string): boolean {
  return objectIdToString(a) === objectIdToString(b);
}

/**
 * Chuyển một mảng string thành mảng `ObjectId`, bỏ qua các giá trị không hợp lệ.
 *
 * Dùng khi build MongoDB `$in` query từ danh sách id nhận được từ client.
 * Các id không hợp lệ bị lọc ra (không throw) — an toàn với input không tin cậy.
 */
export function toObjectIds(ids: string[]): ObjectId[] {
  return ids.filter(isObjectId).map((id) => new ObjectId(id));
}

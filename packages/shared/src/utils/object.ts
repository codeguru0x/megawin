/**
 * Object utils — thao tác nông (shallow) trên plain object, không đệ quy.
 *
 * CỐ Ý chỉ xử lý `undefined`, KHÔNG đụng `null`: `null` thường là **giá trị có
 * nghĩa** (VD "đã xoá field" trong diff/patch), còn `undefined` = "field không
 * được set". Gộp hai thứ dễ nuốt mất dữ liệu hợp lệ. Cần bỏ cả `null` thì viết
 * biến thể riêng, đừng mở rộng hàm này.
 *
 * Lý do tồn tại: MongoDB Node driver mặc định serialize `undefined → null` và
 * VẪN lưu key. Muốn key biến mất khỏi doc thì phải loại `undefined` TRƯỚC khi
 * ghi — đó là việc {@link omitUndefined} / {@link pruneUndefined} làm.
 */

/** Object sau khi loại field `undefined` — mỗi field không còn nhánh `undefined`. */
type WithoutUndefined<T extends object> = { [K in keyof T]: Exclude<T[K], undefined> };

/**
 * Loại field `undefined` khỏi object (shallow) — LUÔN trả object (kể cả `{}`).
 *
 * Nông: chỉ xét field tầng 1, KHÔNG đệ quy vào object lồng. Giữ nguyên `null`,
 * `0`, `""`, `false` — chỉ bỏ đúng `undefined`.
 *
 * @param obj - Object có thể chứa field `undefined`.
 * @returns Object mới chỉ còn field khác `undefined` (không mutate input).
 */
export function omitUndefined<T extends object>(obj: T): WithoutUndefined<T> {
  const out = {} as WithoutUndefined<T>;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k as keyof T] = v as WithoutUndefined<T>[keyof T];
  }
  return out;
}

/**
 * Như {@link omitUndefined} nhưng trả `undefined` khi KHÔNG còn field nào —
 * để bỏ HẲN key khỏi doc thay vì ghi object rỗng.
 *
 * Dùng build sub-doc optional (VD `metadata.http`): field nào có giá trị thì giữ,
 * toàn bộ trống thì không tạo key. Generic để giữ đúng shape input; thêm field
 * mới KHÔNG phải sửa hàm này (không hard-code tên field).
 *
 * @param obj - Object có thể chứa field `undefined`.
 * @returns Object đã loại field `undefined`, hoặc `undefined` nếu rỗng.
 */
export function pruneUndefined<T extends object>(obj: T): WithoutUndefined<T> | undefined {
  const out = omitUndefined(obj);
  return Object.keys(out).length > 0 ? out : undefined;
}

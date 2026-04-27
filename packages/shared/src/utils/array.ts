/**
 * Array Utilities
 *
 * Shared helpers cho thao tác mảng dùng chung trong toàn hệ thống.
 */

/**
 * Tính tổng các giá trị số được rút ra bởi `fn` từ mỗi phần tử trong mảng.
 *
 * Thay thế pattern `arr.reduce((s, t) => s + t.field, 0)` lặp đi lặp lại.
 * Null-safe: trả về `0` khi `arr` là `null`, `undefined`, hoặc mảng rỗng.
 *
 * @example
 * sumBy([{ amount: 100 }, { amount: 200 }], t => t.amount)  // 300
 * sumBy([], t => t.amount)                                   // 0
 * sumBy(null, t => t.amount)                                 // 0
 * sumBy(undefined, t => t.amount)                            // 0
 */
export function sumBy<T>(arr: readonly T[] | null | undefined, fn: (item: T) => number): number {
  return arr?.reduce((sum, item) => sum + fn(item), 0) ?? 0;
}

/**
 * Kiểm tra tất cả phần tử trong mảng có duy nhất không.
 *
 * Dùng thay cho pattern `new Set(arr).size === arr.length` lặp đi lặp lại
 * ở cả Zod schema validation lẫn business logic.
 *
 * @param arr - Mảng cần kiểm tra (primitive values: string, number).
 * @returns `true` nếu không có phần tử trùng, `false` nếu có trùng.
 *
 * @example
 * isUnique([1, 2, 3])           // true
 * isUnique([1, 2, 2])           // false
 * isUnique(["A", "B", "C"])     // true
 * isUnique([])                  // true (vacuous truth)
 */
export function isUnique<T>(arr: readonly T[]): boolean {
  return new Set(arr).size === arr.length;
}

/**
 * Kiểm tra tất cả phần tử duy nhất theo giá trị rút ra bởi `keyFn`.
 *
 * Hữu ích khi cần check unique trên 1 field của object array,
 * ví dụ: `isUniqueBy(boards, b => b.boardNo)`.
 *
 * @param arr - Mảng objects cần kiểm tra.
 * @param keyFn - Hàm rút key từ mỗi phần tử.
 * @returns `true` nếu tất cả key duy nhất.
 *
 * @example
 * isUniqueBy([{ no: "A" }, { no: "B" }], b => b.no)  // true
 * isUniqueBy([{ no: "A" }, { no: "A" }], b => b.no)  // false
 */
export function isUniqueBy<T, K>(arr: readonly T[], keyFn: (item: T) => K): boolean {
  const seen = new Set<K>();
  for (const item of arr) {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * Chia mảng thành nhiều nhóm kích thước `size`.
 *
 * Nhóm cuối có thể nhỏ hơn `size` nếu `arr.length` không chia hết.
 * `size <= 0` ném `RangeError` để tránh infinite loop.
 *
 * Dùng thay cho pattern `for (let i = 0; i < arr.length; i += size)` lặp đi lặp lại
 * ở bulk-write repos (lines, dispatch orders...).
 *
 * @example
 * chunk([1, 2, 3, 4, 5], 2)  // [[1, 2], [3, 4], [5]]
 * chunk([], 2)                // []
 * chunk([1, 2], 5)            // [[1, 2]]
 */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) {
    throw new RangeError(`chunk size must be > 0, got ${size}`);
  }
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

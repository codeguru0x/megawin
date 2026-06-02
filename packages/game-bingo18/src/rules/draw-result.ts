/**
 * Bingo 18 – So sánh kết quả quay (draw result equality).
 *
 * Dùng bởi `PublishResultUseCase` để phân biệt "sửa kết quả" (kéo resettle) vs
 * "chỉ sửa vietlottRef" (KHÔNG resettle) sau khi draw đã settle.
 */

/**
 * So sánh 2 mảng số quay Bingo 18 (3 xúc xắc 1-6) theo thứ tự quay chính thức.
 *
 * Bingo 18 lưu `numbers` đúng thứ tự nhập — KHÔNG sort — nên so sánh
 * element-by-element là chính xác. Số CÓ THỂ trùng nhau (3 xúc xắc độc lập).
 *
 * @param a - Mảng số quay hiện tại (đã lưu).
 * @param b - Mảng số quay mới (staff nhập).
 * @returns `true` nếu giống hệt (cùng độ dài + cùng giá trị theo từng vị trí).
 */
export function isSameBingo18Result(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

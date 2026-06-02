/**
 * Keno – So sánh kết quả kỳ quay.
 *
 * Dùng trong `PublishResultUseCase` để phân biệt "sửa kết quả" (kéo theo resettle)
 * với "chỉ sửa vietlottRef" (metadata, KHÔNG resettle) sau khi draw đã settle.
 */

/**
 * So sánh 2 bộ số trúng Keno theo thứ tự (element-by-element, exact order).
 *
 * Keno lưu `winningNumbers` đúng thứ tự quay (KHÔNG sort trước khi lưu) nên so
 * sánh giữ nguyên thứ tự là chính xác — đổi thứ tự cũng coi là kết quả khác.
 *
 * @param a - Bộ số trúng hiện tại (đã lưu trong DB).
 * @param b - Bộ số trúng mới nhập.
 * @returns `true` nếu hai bộ số giống hệt (cùng độ dài + cùng phần tử theo thứ tự).
 */
export function isSameKenoResult(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

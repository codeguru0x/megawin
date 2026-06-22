/**
 * Mega 6/45 – Draw Result comparison rules.
 *
 * Phục vụ orchestration ở `PublishResultUseCase`: phân biệt "staff chỉ sửa
 * metadata (vietlottRef)" với "staff sửa kết quả quay" để quyết định có cần
 * mở lại luồng resettle hay không.
 */

import type { DrawResult } from "../entities/draw";

/**
 * So sánh 2 `DrawResult` của Mega 6/45 CHÍNH XÁC theo thứ tự từng phần tử.
 *
 * Mega 6/45 gồm 6 số chính (winningNumbers), KHÔNG có bonus/special number.
 * Kết quả Vietlott công bố có thứ tự cố định; result được lưu nguyên trạng
 * theo thứ tự staff nhập (repo KHÔNG sort). So sánh element-by-element theo
 * đúng thứ tự là đáng tin:
 * - Khác dù chỉ 1 số (kể cả đổi thứ tự) → coi như kết quả đã thay đổi.
 *
 * @param a - Kết quả thứ nhất (vd kết quả cũ trong DB).
 * @param b - Kết quả thứ hai (vd kết quả staff vừa nhập).
 * @returns `true` nếu winningNumbers khớp đúng theo thứ tự; ngược lại `false`.
 */
export function isSameMega645Result(a: DrawResult, b: DrawResult): boolean {
  const aNums = a.winningNumbers;
  const bNums = b.winningNumbers;

  // Fail nhanh nếu số lượng khác (O(1)) — tránh duyệt mảng.
  if (aNums.length !== bNums.length) {
    return false;
  }

  // So sánh 6 số chính theo thứ tự (staff nhập theo thứ tự quay gốc).
  return aNums.every((v, i) => v === bNums[i]);
}

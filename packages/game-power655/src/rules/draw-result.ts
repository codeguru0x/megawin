/**
 * Power 6/55 – Draw Result comparison rules.
 *
 * Phục vụ orchestration ở `PublishResultUseCase`: phân biệt "staff chỉ sửa
 * metadata (vietlottRef)" với "staff sửa kết quả quay" để quyết định có cần
 * mở lại luồng resettle hay không.
 */

import type { DrawResult } from "../entities/draw";

/**
 * So sánh 2 `DrawResult` của Power 6/55 CHÍNH XÁC theo thứ tự từng phần tử.
 *
 * Power 6/55 gồm 6 số chính (winningMain) + 1 bonus (bonusNumber).
 * Kết quả Vietlott công bố có thứ tự cố định; result được lưu nguyên trạng
 * theo thứ tự staff nhập (repo KHÔNG sort). So sánh element-by-element theo
 * đúng thứ tự là đáng tin:
 * - Khác dù chỉ 1 số (kể cả đổi thứ tự) → coi như kết quả đã thay đổi.
 * - bonusNumber khác → coi như kết quả đã thay đổi.
 *
 * @param a - Kết quả thứ nhất (vd kết quả cũ trong DB).
 * @param b - Kết quả thứ hai (vd kết quả staff vừa nhập).
 * @returns `true` nếu winningMain và bonusNumber đều khớp đúng; ngược lại `false`.
 */
export function isSamePower655Result(a: DrawResult, b: DrawResult): boolean {
  // So sánh bonusNumber trước (O(1)) — fail nhanh nếu bonus khác.
  if (a.bonusNumber !== b.bonusNumber) {
    return false;
  }

  // So sánh 6 số chính theo thứ tự (staff nhập theo thứ tự quay gốc).
  const aMain = a.winningMain;
  const bMain = b.winningMain;

  if (aMain.length !== bMain.length) {
    return false;
  }

  return aMain.every((v, i) => v === bMain[i]);
}

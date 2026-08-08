/**
 * Max 3D Pro – Draw Result comparison rules.
 *
 * Phục vụ orchestration ở `PublishResultUseCase`: phân biệt "staff chỉ sửa
 * metadata (vietlottRef)" với "staff sửa kết quả quay" để quyết định có cần
 * mở lại luồng resettle hay không.
 */

import type { Max3dproDrawResult } from "../entities/draw-result";
import { BASIC_TIER_PRIORITY } from "../entities/enums";

/**
 * So sánh 2 `Max3dproDrawResult` CHÍNH XÁC theo thứ tự từng ô.
 *
 * Kết quả Vietlott công bố có thứ tự cố định; result được lưu nguyên trạng theo
 * thứ tự staff nhập (repo KHÔNG sort). Vì vậy so sánh element-by-element theo
 * đúng thứ tự là đáng tin: khác dù chỉ 1 ô (kể cả đổi thứ tự) → coi như kết quả
 * đã thay đổi → buộc resettle.
 *
 * Duyệt tier qua `BasicTier` (special/first/second/third) — trùng đúng key của
 * `Max3dproDrawResult` — thay vì hardcode chuỗi.
 *
 * @param a - Kết quả thứ nhất (vd kết quả cũ trong DB).
 * @param b - Kết quả thứ hai (vd kết quả staff vừa nhập).
 * @returns `true` nếu mọi tier khớp đúng giá trị lẫn thứ tự; ngược lại `false`.
 */
export function isSameMax3dproResult(a: Max3dproDrawResult, b: Max3dproDrawResult): boolean {
  return BASIC_TIER_PRIORITY.every((tier) => {
    const av = a[tier];
    const bv = b[tier];
    return av.length === bv.length && av.every((v, i) => v === bv[i]);
  });
}

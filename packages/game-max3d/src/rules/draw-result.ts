/**
 * Max 3D – Draw Result comparison rules.
 *
 * Phục vụ orchestration ở `PublishResultUseCase`: phân biệt "staff chỉ sửa
 * metadata (vietlottRef)" với "staff sửa kết quả quay" để quyết định có cần
 * mở lại luồng resettle hay không.
 */

import type { Max3dDrawResult } from "../entities/draw-result";
import { BASIC_PRIZE_TIER_VALUES } from "../entities/enums";

/**
 * So sánh 2 `Max3dDrawResult` CHÍNH XÁC theo thứ tự từng ô.
 *
 * Kết quả Vietlott công bố có thứ tự cố định; result được lưu nguyên trạng theo
 * thứ tự staff nhập (repo KHÔNG sort). Vì vậy so sánh element-by-element theo
 * đúng thứ tự là đáng tin: khác dù chỉ 1 ô (kể cả đổi thứ tự) → coi như kết quả
 * đã thay đổi → buộc resettle.
 *
 * Duyệt tier qua `BasicPrizeTier` (special/first/second/third) — trùng đúng key
 * của `Max3dDrawResult` — thay vì hardcode chuỗi.
 *
 * @param a - Kết quả thứ nhất (vd kết quả cũ trong DB).
 * @param b - Kết quả thứ hai (vd kết quả staff vừa nhập).
 * @returns `true` nếu mọi tier khớp đúng giá trị lẫn thứ tự; ngược lại `false`.
 */
export function isSameMax3dResult(a: Max3dDrawResult, b: Max3dDrawResult): boolean {
  return BASIC_PRIZE_TIER_VALUES.every((tier) => {
    const av = a[tier];
    const bv = b[tier];
    return av.length === bv.length && av.every((v, i) => v === bv[i]);
  });
}

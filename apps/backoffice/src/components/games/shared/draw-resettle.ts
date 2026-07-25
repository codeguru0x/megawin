/**
 * Shared – Resettle detection helpers cho Draw Command Center (mọi game)
 *
 * Sau khi đồng bộ field (xem `draw-command-center-shared-refactor.plan.md` §B0),
 * `drawResultAt` mang cùng ý nghĩa ở cả 7 game: raw `result?.publishedAt`,
 * `undefined` nếu chưa publish, KHÔNG fallback về giờ quay dự kiến. Logic
 * dưới đây generic 100%, không cần tham số hoá field theo game.
 */

import { DrawStatus } from "@megawin/game-core/entities";

/** Field tối thiểu cần cho các helper resettle — mọi `DrawSelectorItem` game đều thoả. */
export interface DrawResettleFields {
  /** Trạng thái kỳ quay hiện tại. */
  status: string;
  /** Thời điểm settle gần nhất (ISO 8601) — high-water mark. */
  settledAt?: string;
  /** Thời điểm công bố kết quả thực tế (ISO 8601) — undefined nếu chưa publish. */
  drawResultAt?: string;
}

/**
 * Phân biệt 2 case có cùng `status === Published`:
 *   - draw vừa publish kết quả lần đầu, chưa từng settle → hiển thị "Kết sổ".
 *   - draw đã settle ≥ 1 lần và staff vừa republish kết quả mới → hiển thị "Kết sổ lại".
 *
 * Edge case quan trọng: nếu `settledAt` null hoặc `drawResultAt <= settledAt`
 * → KHÔNG cho phép Resettle (chống staff bấm nhầm; backend cũng có guard tương ứng).
 */
export function shouldShowResettle(draw: DrawResettleFields): boolean {
  if (draw.status !== DrawStatus.Published) return false;
  if (!draw.settledAt) return false;
  if (!draw.drawResultAt) return false;
  return new Date(draw.drawResultAt).getTime() > new Date(draw.settledAt).getTime();
}

/**
 * Khi draw đang `Settling`, xác định lần kết sổ đang chạy là Settle (lần đầu)
 * hay Resettle (kết sổ lại sau republish) — để nút "Thử lại" trong banner
 * gọi đúng action.
 *
 * Cùng tiêu chí với {@link shouldShowResettle} nhưng KHÔNG ràng buộc status
 * `Published` (status hiện tại là `Settling`): nếu đã settle ≥ 1 lần và kết quả
 * mới hơn lần settle trước → phiên này là Resettle.
 */
export function isResettleSession(draw: DrawResettleFields): boolean {
  if (!draw.settledAt) return false;
  if (!draw.drawResultAt) return false;
  return new Date(draw.drawResultAt).getTime() > new Date(draw.settledAt).getTime();
}

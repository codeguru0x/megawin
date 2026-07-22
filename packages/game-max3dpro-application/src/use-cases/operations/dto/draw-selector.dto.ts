/**
 * Max 3D Pro – Draw Selector DTO
 *
 * Dùng cho dropdown chọn kỳ quay trên dashboard vận hành.
 * Max 3D Pro quay 3 lần/tuần (T3, T5, T7) lúc 18h00 — 1 kỳ/ngày.
 */

import type { DrawSelectorGroup } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// GetDrawSelectorList
// ─────────────────────────────────────────────

export interface GetDrawSelectorOutput {
  /** Danh sách kỳ quay cho dropdown, sorted theo drawDate. */
  draws: DrawSelectorItem[];
}

/**
 * Một item trong dropdown chọn kỳ quay.
 * Group phân loại để hiển thị theo section trong dropdown.
 */
export interface DrawSelectorItem {
  /** Mã kỳ quay. Format "YYYY-MM-DD.001" (luôn 1 kỳ/ngày). */
  drawId: string;
  /** Số thứ tự kỳ trong ngày (luôn = 1 với Max 3D Pro). */
  drawNo: number;
  /** Ngày quay, format DD/MM/YYYY (hiển thị). */
  drawDate: string;
  /** Giờ quay dự kiến, format HH:mm (luôn "18:00"). */
  drawTime: string;
  /** Thời điểm mở bán (ISO 8601) — undefined nếu chưa mở. */
  salesOpenAt?: string;
  /** Thời điểm đóng bán (ISO 8601). */
  salesCloseAt: string;
  /** Thời điểm quay số dự kiến (ISO 8601) — undefined nếu chưa có. */
  drawResultAt?: string;
  /** Trạng thái kỳ quay. */
  status: string;
  /**
   * Thời điểm kết sổ thành công (ISO 8601). Chỉ có sau khi `FinalizeSettle`
   * ghi `settledAt`. Là **high-water mark** — KHÔNG bị clear khi republish.
   *
   * UI dùng kết hợp với `drawResultAt` để phân biệt 2 case có cùng status `Published`:
   *   - `settledAt == null`: draw vừa publish lần đầu → hiển thị "Kết sổ".
   *   - `settledAt != null && drawResultAt > settledAt`: đã republish kết
   *     quả mới sau settle → hiển thị "Kết sổ lại" (Resettle).
   *   - `settledAt != null && drawResultAt <= settledAt`: case bất thường,
   *     KHÔNG cho Resettle (chống bấm nhầm).
   */
  settledAt?: string;
  /** Ngày tài chính (YYYY-MM-DD) — dùng để filter analytics đúng ngày. */
  financialDate: string;
  /**
   * Phân nhóm để hiển thị trong dropdown:
   * - active: cần xử lý (salesOpen, salesClosed, published, settling, voiding)
   * - future: kỳ scheduled chưa đến
   * - recent: kỳ đã hoàn thành trong 48h (settled, void)
   */
  group: DrawSelectorGroup;
}

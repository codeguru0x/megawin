/**
 * Lotto 5/35 – Draw Selector DTO
 *
 * Dùng cho dropdown chọn kỳ quay trên dashboard vận hành.
 * Mỗi item chứa đủ thông tin để render DrawRow (status, schedule, group).
 */

import type { DrawSelectorGroup } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// GetDrawSelectorList
// ─────────────────────────────────────────────

export interface GetDrawSelectorOutput {
  /**
   * Danh sách kỳ quay cho dropdown.
   * active/future: sorted ASC (cũ→mới). recent: sorted DESC (mới→cũ, dễ theo dõi kỳ vừa xong).
   */
  draws: DrawSelectorItem[];
}

/**
 * Một item trong dropdown chọn kỳ quay.
 * Group phân loại để hiển thị theo section trong dropdown.
 */
export interface DrawSelectorItem {
  /** Mã kỳ quay (UUID). */
  drawId: string;
  /** Số thứ tự kỳ trong ngày (1 = sáng 13h, 2 = tối 21h). */
  drawNo: 1 | 2;
  /** Ngày quay, format DD/MM/YYYY (hiển thị). */
  drawDate: string;
  /** Giờ quay dự kiến, format HH:mm. */
  drawTime: string;
  /** Thời điểm mở bán (ISO 8601) — undefined nếu chưa mở. */
  salesOpenAt?: string;
  /** Thời điểm đóng bán (ISO 8601). */
  salesCloseAt: string;
  /** Thời điểm quay số dự kiến (ISO 8601) — undefined nếu chưa có. */
  drawResultAt?: string;
  /** Thời điểm settle gần nhất (ISO 8601) — high-water mark resettle. */
  settledAt?: string;
  /**
   * publishedAt của result gần nhất (ISO 8601).
   * So sánh với `settledAt` để biết có kết quả mới sau settle.
   */
  resultPublishedAt?: string;
  /** Trạng thái kỳ quay. */
  status: string;
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

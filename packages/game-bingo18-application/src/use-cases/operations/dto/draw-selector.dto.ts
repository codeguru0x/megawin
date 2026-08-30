/**
 * Bingo 18 – Draw Selector DTO
 *
 * Dropdown chọn kỳ quay trên dashboard vận hành.
 * Bingo 18 có ~158 kỳ/ngày (6 phút/kỳ) — group theo trạng thái để tránh quá tải.
 */

import type { DrawSelectorGroup, DrawStatus } from "@megawin/game-core/entities";

export interface DrawSelectorItem {
  /** Mã định danh kỳ (format YYYY-MM-DD.NNN). */
  drawId: string;
  /** Ngày quay, format DD/MM/YYYY. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1-~160). */
  drawNo: number;
  /** Giờ quay, format HH:mm (giờ VN). */
  drawTime: string;
  /** Thời điểm đóng bán (ISO 8601). */
  salesCloseAt: string;
  /** Thời điểm mở bán (ISO 8601), optional nếu chưa mở. */
  salesOpenAt?: string;
  /**
   * Thời điểm quay theo lịch (ISO 8601) — luôn có, dùng để pre-fill form sửa lịch.
   * Lấy từ DrawDoc.drawTime (không phụ thuộc trạng thái kỳ).
   */
  scheduledDrawAt: string;
  /** Thời điểm công bố kết quả (ISO 8601), chỉ có sau khi published. */
  drawResultAt?: string;
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
  status: DrawStatus;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /**
   * Nhóm hiển thị trong dropdown.
   * active: đang xử lý (salesOpen/salesClosed/published/settling/voiding), sort ASC (cũ→mới).
   * future: kỳ scheduled sắp tới, sort ASC (cũ→mới).
   * recent: kỳ settled hoặc void gần đây, sort DESC (mới→cũ) — kỳ vừa hoàn thành lên đầu.
   */
  group: DrawSelectorGroup;
}

export interface GetDrawSelectorOutput {
  draws: DrawSelectorItem[];
}

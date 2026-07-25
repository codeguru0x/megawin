/**
 * Power 6/55 – Draw Selector DTO
 *
 * Dropdown chọn kỳ quay trên dashboard vận hành.
 * Power 6/55 chỉ quay 1 kỳ/ngày (drawNo = 1 cố định).
 */

import type { DrawStatus, DrawSelectorGroup } from "@megawin/game-core/entities";

export interface DrawSelectorItem {
  drawId: string;
  /** Power 6/55 chỉ có drawNo = 1. */
  drawNo: 1;
  /** Ngày quay, format DD/MM/YYYY. */
  drawDate: string;
  /** Giờ quay, format HH:mm. */
  drawTime: string;
  /** Thời điểm mở bán (ISO 8601). */
  salesOpenAt?: string;
  /** Thời điểm đóng bán (ISO 8601). */
  salesCloseAt: string;
  /**
   * Thời điểm quay theo lịch (ISO 8601) — luôn có, lấy từ `DrawDoc.drawTime`,
   * không phụ thuộc trạng thái kỳ. Dùng cho countdown "Quay số sau" và
   * overdue-publish check ở command center (khác `drawResultAt` — mốc quay
   * *thực tế* chỉ có sau khi staff công bố kết quả).
   */
  scheduledDrawAt: string;
  /**
   * Thời điểm công bố kết quả thực tế (ISO 8601) — undefined nếu chưa publish.
   * KHÔNG fallback về `scheduledDrawAt`: dùng để so sánh với `settledAt` nhằm
   * phát hiện republish (xem `shouldShowResettle`).
   */
  drawResultAt?: string;
  status: DrawStatus;
  /** Ngày tài chính của kỳ (YYYY-MM-DD). */
  financialDate: string;
  /** Nhóm hiển thị trong dropdown. active/future sort ASC, recent sort DESC (mới nhất lên đầu). */
  group: DrawSelectorGroup;
  /**
   * Thời điểm kết sổ thành công (ISO 8601). High-water mark.
   * Có giá trị khi kỳ đã settle ít nhất 1 lần.
   * Dùng để UI xác định kỳ đủ điều kiện resettle.
   */
  settledAt?: string;
}

export interface GetDrawSelectorOutput {
  draws: DrawSelectorItem[];
}

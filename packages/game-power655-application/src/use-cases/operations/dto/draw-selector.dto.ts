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
  /** Thời điểm công bố kết quả (ISO 8601). */
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
  /**
   * Thời điểm công bố kết quả gần nhất (ISO 8601).
   * Dùng để so sánh với `settledAt` — nếu `resultPublishedAt > settledAt`
   * thì đã có kết quả mới và có thể hiện nút "Kết sổ lại".
   */
  resultPublishedAt?: string;
}

export interface GetDrawSelectorOutput {
  draws: DrawSelectorItem[];
}

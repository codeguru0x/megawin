/**
 * Power 6/55 – Draw Selector DTO
 *
 * Dropdown chọn kỳ quay trên dashboard vận hành.
 * Power 6/55 chỉ quay 1 kỳ/ngày (drawNo = 1 cố định).
 */

import type { DrawStatus } from "@megawin/game-core/entities";

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
  /** Nhóm hiển thị trong dropdown. */
  group: "active" | "future" | "recent";
}

export interface GetDrawSelectorOutput {
  draws: DrawSelectorItem[];
}

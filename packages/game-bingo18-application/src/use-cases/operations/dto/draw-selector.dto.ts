/**
 * Bingo 18 – Draw Selector DTO
 *
 * Dropdown chọn kỳ quay trên dashboard vận hành.
 * Bingo 18 có ~160 kỳ/ngày (6 phút/kỳ) — group theo trạng thái để tránh quá tải.
 */

import type { DrawStatus } from "@megawin/game-core/entities";

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
  status: DrawStatus;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /**
   * Nhóm hiển thị trong dropdown.
   * active: đang xử lý (salesOpen/salesClosed/published/settling/voiding).
   * upcoming: kỳ scheduled sắp tới.
   * recent: kỳ settled hoặc void gần đây.
   */
  group: "active" | "upcoming" | "recent";
}

export interface GetDrawSelectorOutput {
  draws: DrawSelectorItem[];
}

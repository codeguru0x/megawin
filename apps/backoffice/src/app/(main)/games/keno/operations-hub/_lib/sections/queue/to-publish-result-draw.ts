/**
 * Ops Hub — map `DerivedRow` sang field tối thiểu `PublishResultAction` cần (plan p1-10).
 *
 * Tách riêng khỏi `hub-expand-panel.tsx` để dễ test độc lập — hàm thuần, không phụ thuộc React.
 */

import { displayVNTime } from "@megawin/shared/utils";

import type { PublishResultDraw } from "@/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-actions";

import type { DerivedRow } from "../../hub-types";

/**
 * Map 1 dòng Hub sang field tối thiểu `PublishResultAction` cần.
 *
 * `drawTime` PHẢI convert qua `displayVNTime` — `DerivedRow.drawTime` là ISO 8601 đầy đủ (nguồn
 * Hub snapshot), còn `PublishResultDraw.drawTime` kỳ vọng chuỗi đã format `"HH:mm"` (nguồn gốc:
 * `DrawSelectorItem` của trang `operations`). Gán thẳng ISO vào đây làm tiêu đề dialog hiện
 * nguyên chuỗi ISO thay vì giờ ngắn gọn — xem plan p1-10 §1 câu 4.
 */
export function toPublishResultDraw(row: DerivedRow): PublishResultDraw {
  return {
    drawId: row.drawId,
    scheduledDrawAt: row.drawTime, // cùng ngữ nghĩa (DrawDoc.drawTime dạng ISO) — gán thẳng được
    drawTime: displayVNTime(row.drawTime),
  };
}

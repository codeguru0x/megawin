/**
 * Keno – Draw ID Generation
 *
 * Format: "YYYY-MM-DD.NNN"
 *   - YYYY-MM-DD: ngày quay
 *   - NNN: số thứ tự kỳ quay trong ngày (zero-padded 3 chữ số)
 *
 * Keno quay mỗi 8 phút, từ 06:08 đến 21:52 = 119 kỳ/ngày.
 * drawNo tối đa 119 nên padStart(3) là đủ.
 *
 * Lịch kỳ quay do `listDrawSlotMinutes` / `computeDrawDayCapacity`
 * (`@megawin/game-core/utils`) sinh — file này CHỈ lo format drawId từ (drawDate, drawNo)
 * đã biết.
 */

import type { ISODateString } from "../entities/types";

/**
 * Tạo drawId duy nhất cho 1 kỳ quay Keno.
 *
 * Format: "YYYY-MM-DD.NNN" (ví dụ: "2024-01-15.042")
 *
 * @param drawDate - Ngày quay "YYYY-MM-DD"
 * @param drawNo - Số thứ tự kỳ trong ngày (1-based, ví dụ 42 → "042")
 */
export function generateKenoDrawId(drawDate: ISODateString, drawNo: number): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

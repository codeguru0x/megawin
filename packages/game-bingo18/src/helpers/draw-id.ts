/**
 * Bingo 18 – Draw ID Generation
 *
 * Format: "YYYY-MM-DD.NNN"
 *   - YYYY-MM-DD: ngày quay
 *   - NNN: số thứ tự kỳ quay trong ngày
 *
 * Bingo 18 quay mỗi 6 phút, từ 06:06 đến 21:53.
 *
 * Lịch kỳ quay do `listDrawSlotMinutes` / `computeDrawDayCapacity`
 * (`@megawin/game-core/utils`) sinh —
 * file này CHỈ lo format drawId từ (drawDate, drawNo) đã biết.
 */

import type { ISODateString } from "../entities/types";

/**
 * Ghép drawId từ ngày quay + số thứ tự kỳ trong ngày.
 *
 * @param drawDate - Ngày quay "YYYY-MM-DD"
 * @param drawNo - Số thứ tự kỳ trong ngày (1-based, VD 42 → "042")
 */
export function generateBingo18DrawId(drawDate: ISODateString, drawNo: number): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

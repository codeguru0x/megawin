/**
 * Power 6/55 – Draw ID Generation
 *
 * Draw ID là định danh duy nhất cho mỗi kỳ quay Power 6/55.
 *
 * Format: "YYYY-MM-DD.NNN"
 * - YYYY-MM-DD: ngày quay (ISO date string)
 * - NNN: số thứ tự kỳ trong ngày (zero-padded 3 chữ số)
 * - Power 6/55 chỉ quay 1 kỳ/ngày → NNN luôn = "001" (DrawNo.Single)
 *
 * Lịch quay: Thứ 3 (Tue=2), Thứ 5 (Thu=4), Thứ 7 (Sat=6) — 3 kỳ/tuần.
 * Draw days khác Mega 6/45 (T4, T6, CN).
 *
 * Lịch kỳ quay do `calcDrawSlots` (`@megawin/game-power655-application/helpers`) sinh —
 * file này CHỈ lo format drawId từ (drawDate, drawNo) đã biết.
 */

import type { ISODateString } from "../entities/types";
import { DrawNo } from "../entities/types";

/**
 * Sinh draw ID từ ngày quay và số thứ tự kỳ.
 *
 * @param drawDate - Ngày quay dạng "YYYY-MM-DD"
 * @param drawNo   - Số thứ tự kỳ trong ngày (mặc định DrawNo.Single = 1)
 * @returns Draw ID dạng "YYYY-MM-DD.NNN"
 *
 * @example
 * generateDrawId("2026-03-10")       // → "2026-03-10.001"
 * generateDrawId("2026-03-10", 1)    // → "2026-03-10.001"
 */
export function generateDrawId(drawDate: ISODateString, drawNo: DrawNo = DrawNo.Single): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

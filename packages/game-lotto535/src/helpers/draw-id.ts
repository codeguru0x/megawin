/**
 * Lotto 5/35 – Draw ID Generation
 *
 * Format: "YYYY-MM-DD.NNN"
 *   - YYYY-MM-DD: ngày quay theo timezone vận hành
 *   - NNN: số thứ tự kỳ quay trong ngày (001 = 13h, 002 = 21h)
 *
 * Ví dụ: "2026-02-22.001", "2026-02-22.002"
 *
 * DrawId là stable + unique, dùng làm join key giữa draws ↔ entries.
 *
 * Lịch kỳ quay do `calcDrawSlots` (`@megawin/game-lotto535-application/helpers`) sinh —
 * file này CHỈ lo format drawId từ (drawDate, drawNo) đã biết.
 */

import type { DrawNo, ISODateString } from "../entities/types";

/**
 * Tạo drawId từ ngày + số thứ tự kỳ quay.
 *
 * @param drawDate - Ngày quay format "YYYY-MM-DD"
 * @param drawNo - Số thứ tự kỳ quay trong ngày (1, 2)
 * @returns DrawId format "YYYY-MM-DD.NNN"
 *
 * @example
 * ```ts
 * generateDrawId("2026-02-22", 1) // → "2026-02-22.001"
 * generateDrawId("2026-02-22", 2) // → "2026-02-22.002"
 * ```
 */
export function generateDrawId(drawDate: ISODateString, drawNo: DrawNo): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

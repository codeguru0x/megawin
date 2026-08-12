/**
 * Mega 6/45 – Draw ID Generation
 *
 * Format: "YYYY-MM-DD.001"
 * Mega 6/45 chỉ quay 1 kỳ/ngày → drawNo luôn = 001.
 *
 * Lịch quay: Thứ 4 (3), Thứ 6 (5), Chủ nhật (0) lúc 18:00.
 * drawDate là ngày theo giờ Việt Nam (UTC+7).
 *
 * Lịch kỳ quay do `calcDrawSlots` (`@megawin/game-mega645-application/helpers`) sinh —
 * file này CHỈ lo format drawId từ (drawDate, drawNo) đã biết.
 */

import type { ISODateString } from "../entities/types";
import { DrawNo } from "../entities/types";

/**
 * Tạo Draw ID từ drawDate và drawNo.
 * Format: "YYYY-MM-DD.NNN" (NNN = drawNo zero-padded 3 chữ số).
 * Mega 6/45 chỉ dùng drawNo = 1 → luôn ra "YYYY-MM-DD.001".
 *
 * @example generateDrawId("2024-03-06") → "2024-03-06.001"
 */
export function generateDrawId(drawDate: ISODateString, drawNo: DrawNo = DrawNo.Single): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

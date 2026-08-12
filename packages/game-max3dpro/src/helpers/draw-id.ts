/**
 * Max 3D Pro – Draw ID Generation
 *
 * Format: "YYYY-MM-DD.001"
 * Max 3D Pro chỉ có 1 kỳ/ngày (18h00, thứ 3/5/7).
 *
 * Lịch kỳ quay do `calcDrawSlots` (`@megawin/game-max3dpro-application/helpers`) sinh —
 * file này CHỈ lo format drawId từ (drawDate, drawNo) đã biết.
 */

import type { ISODateString } from "../entities/types";
import { DrawNo } from "../entities/types";

export function generateDrawId(drawDate: ISODateString, drawNo: number = DrawNo.Default): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

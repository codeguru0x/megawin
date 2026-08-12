/**
 * Max 3D – Draw ID Generation
 *
 * Format: "YYYY-MM-DD.001"
 * Max 3D chỉ có 1 kỳ/ngày (18h00, thứ 2/4/6).
 *
 * Lịch kỳ quay do `calcDrawSlots` (`@megawin/game-max3d-application/helpers`) sinh —
 * file này CHỈ lo format drawId từ (drawDate, drawNo) đã biết.
 */

import type { ISODateString } from "../entities/types";
import { DrawNo } from "../entities/types";

export function generateDrawId(drawDate: ISODateString, drawNo: number = DrawNo.Default): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

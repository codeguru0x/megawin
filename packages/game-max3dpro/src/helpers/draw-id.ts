/**
 * Max 3D Pro – Draw ID Generation
 *
 * Format: "YYYY-MM-DD.001"
 * Max 3D Pro chỉ có 1 kỳ/ngày (18h00, thứ 3/5/7).
 */

import type { ISODateString } from "../entities/types";
import { DrawNo } from "../entities/types";

export function generateDrawId(
  drawDate: ISODateString,
  drawNo: number = DrawNo.Default
): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

export function parseDrawId(
  drawId: string
): { drawDate: ISODateString; drawNo: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.(\d{3})$/.exec(drawId);
  if (!match) return null;

  return {
    drawDate: match[1]!,
    drawNo: parseInt(match[2]!, 10),
  };
}

/**
 * Tạo chuỗi drawId liên tiếp cho Max 3D Pro.
 * Max 3D Pro quay vào thứ 3, 5, 7 → skip các ngày khác.
 */
export function generateDrawIdSequence(
  startDrawId: string,
  drawCount: number,
  drawDaysOfWeek: number[] = [2, 4, 6]
): string[] {
  const parsed = parseDrawId(startDrawId);
  if (!parsed) {
    throw new Error(`Invalid startDrawId: ${startDrawId}`);
  }

  const ids: string[] = [];
  const currentDate = new Date(parsed.drawDate + "T00:00:00");

  while (ids.length < drawCount) {
    const dayOfWeek = currentDate.getDay();
    if (drawDaysOfWeek.includes(dayOfWeek)) {
      const dateStr = currentDate.toISOString().split("T")[0]!;
      ids.push(generateDrawId(dateStr, DrawNo.Default));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return ids;
}

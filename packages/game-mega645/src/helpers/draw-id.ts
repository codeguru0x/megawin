/**
 * Mega 6/45 – Draw ID Generation
 *
 * Format: "YYYY-MM-DD.001" (Mega 6/45 chỉ quay 1 kỳ/ngày)
 *
 * Lịch quay: Thứ 4, Thứ 6, Chủ nhật lúc 18:00.
 */

import { DrawNo } from "../entities/types";
import type { ISODateString } from "../entities/types";

export function generateDrawId(
  drawDate: ISODateString,
  drawNo: DrawNo = DrawNo.Single
): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

export function parseDrawId(
  drawId: string
): { drawDate: ISODateString; drawNo: DrawNo } | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.(\d{3})$/.exec(drawId);
  if (!match) return null;
  return {
    drawDate: match[1]!,
    drawNo: parseInt(match[2]!, 10) as DrawNo,
  };
}

/** Ngày quay trong tuần: 0=Sun, 3=Wed, 5=Fri. */
const DRAW_DAYS = new Set([0, 3, 5]);

/**
 * Tìm ngày quay tiếp theo từ ngày cho trước.
 * @param fromDate - Date object
 * @param inclusive - Có bao gồm ngày fromDate không (nếu là ngày quay)
 */
export function getNextDrawDate(fromDate: Date, inclusive = false): Date {
  const d = new Date(fromDate);
  if (!inclusive) d.setDate(d.getDate() + 1);

  for (let i = 0; i < 7; i++) {
    if (DRAW_DAYS.has(d.getDay())) return d;
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/**
 * Tạo danh sách drawIds liên tiếp cho Mega 6/45.
 * Chỉ quay vào Thứ 4, Thứ 6, Chủ nhật.
 */
export function generateDrawIdSequence(
  startDrawId: string,
  drawCount: number
): string[] {
  const parsed = parseDrawId(startDrawId);
  if (!parsed) throw new Error(`Invalid startDrawId: ${startDrawId}`);

  const ids: string[] = [];
  let currentDate = new Date(parsed.drawDate + "T00:00:00");

  for (let i = 0; i < drawCount; i++) {
    if (i > 0) {
      currentDate = getNextDrawDate(currentDate, false);
    }
    const dateStr = currentDate.toISOString().split("T")[0]!;
    ids.push(generateDrawId(dateStr));
  }

  return ids;
}

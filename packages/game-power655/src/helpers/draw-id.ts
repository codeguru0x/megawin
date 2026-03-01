/**
 * Power 6/55 – Draw ID Generation
 *
 * Format: "YYYY-MM-DD.001"
 * Power 6/55 chỉ quay 1 kỳ/ngày (thứ 3, 5, 7).
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

/**
 * Tạo danh sách drawIds cho multi-draw ticket.
 * Power 6/55 quay thứ 3, 5, 7 → cần skip các ngày khác.
 *
 * @param startDrawDate - Ngày bắt đầu "YYYY-MM-DD"
 * @param drawCount - Số kỳ (1-6)
 * @param drawDaysOfWeek - Các ngày quay trong tuần [2,4,6] = Tue,Thu,Sat
 */
export function generateDrawIdSequence(
  startDrawDate: string,
  drawCount: number,
  drawDaysOfWeek: number[] = [2, 4, 6]
): string[] {
  const ids: string[] = [];
  const currentDate = new Date(startDrawDate + "T00:00:00");

  while (ids.length < drawCount) {
    const dayOfWeek = currentDate.getDay();
    if (drawDaysOfWeek.includes(dayOfWeek)) {
      const dateStr = currentDate.toISOString().split("T")[0]!;
      ids.push(generateDrawId(dateStr));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return ids;
}

/**
 * Tìm ngày quay tiếp theo từ một ngày cho trước.
 */
export function getNextDrawDate(
  fromDate: Date,
  drawDaysOfWeek: number[] = [2, 4, 6]
): Date {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + 1);
  while (!drawDaysOfWeek.includes(d.getDay())) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

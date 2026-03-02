/**
 * Bingo 18 – Draw ID Generation
 *
 * Format: "YYYY-MM-DD.NNN"
 *   - YYYY-MM-DD: ngày quay
 *   - NNN: số thứ tự kỳ quay trong ngày
 *
 * Bingo 18 quay mỗi 6 phút, từ 06:00 đến 21:53.
 */

import type { ISODateString } from "../entities/types";

export function generateBingo18DrawId(
  drawDate: ISODateString,
  drawNo: number,
): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

export function parseBingo18DrawId(
  drawId: string,
): { drawDate: ISODateString; drawNo: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.(\d{3})$/.exec(drawId);
  if (!match) return null;

  return {
    drawDate: match[1]!,
    drawNo: parseInt(match[2]!, 10),
  };
}

/**
 * Tạo danh sách drawIds liên tiếp cho multi-draw.
 */
export function generateBingo18DrawIdSequence(
  startDrawId: string,
  drawCount: number,
  drawsPerDay: number = 160,
): string[] {
  const parsed = parseBingo18DrawId(startDrawId);
  if (!parsed) {
    throw new Error(`Invalid startDrawId: ${startDrawId}`);
  }

  const ids: string[] = [];
  let currentDate = new Date(parsed.drawDate + "T00:00:00");
  let currentDrawNo = parsed.drawNo;

  for (let i = 0; i < drawCount; i++) {
    const dateStr = currentDate.toISOString().split("T")[0]!;
    ids.push(generateBingo18DrawId(dateStr, currentDrawNo));

    currentDrawNo++;
    if (currentDrawNo > drawsPerDay) {
      currentDrawNo = 1;
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return ids;
}

/**
 * Tính drawNo từ thời gian trong ngày.
 */
export function calculateDrawNo(
  time: string,
  firstDrawTime: string = "06:00",
  intervalMinutes: number = 6,
): number {
  const [h, m] = time.split(":").map(Number);
  const [fh, fm] = firstDrawTime.split(":").map(Number);

  const minutesSinceFirst = (h! - fh!) * 60 + (m! - fm!);
  if (minutesSinceFirst < 0) return 0;

  return Math.floor(minutesSinceFirst / intervalMinutes) + 1;
}

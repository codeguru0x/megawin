/**
 * Keno – Draw ID Generation
 *
 * Format: "YYYY-MM-DD.NNN"
 *   - YYYY-MM-DD: ngày quay
 *   - NNN: số thứ tự kỳ quay trong ngày (001-096, zero-padded 3 chữ số)
 *
 * Keno quay mỗi 8 phút, từ 06:00 đến 21:52 = 120 kỳ/ngày.
 * drawNo tối đa 120 nên regex \d{3} và padStart(3) là đủ.
 */

import type { ISODateString } from "../entities/types";

export function generateKenoDrawId(drawDate: ISODateString, drawNo: number): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

export function parseKenoDrawId(
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
 *
 * @param startDrawId - DrawId kỳ đầu tiên
 * @param drawCount - Số kỳ tham gia
 * @param drawsPerDay - Số kỳ quay mỗi ngày (mặc định 120)
 */
export function generateKenoDrawIdSequence(
  startDrawId: string,
  drawCount: number,
  drawsPerDay: number = 120,
): string[] {
  const parsed = parseKenoDrawId(startDrawId);
  if (!parsed) {
    throw new Error(`Invalid startDrawId: ${startDrawId}`);
  }

  const ids: string[] = [];
  let currentDate = new Date(parsed.drawDate + "T00:00:00");
  let currentDrawNo = parsed.drawNo;

  for (let i = 0; i < drawCount; i++) {
    const dateStr = currentDate.toISOString().split("T")[0]!;
    ids.push(generateKenoDrawId(dateStr, currentDrawNo));

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
 *
 * @param time - Giờ:phút format "HH:mm"
 * @param firstDrawTime - Giờ kỳ đầu tiên (default "06:00")
 * @param intervalMinutes - Khoảng cách giữa các kỳ (default 8)
 * @returns drawNo (1-based)
 */
export function calculateDrawNo(
  time: string,
  firstDrawTime: string = "06:00",
  intervalMinutes: number = 8,
): number {
  const [h, m] = time.split(":").map(Number);
  const [fh, fm] = firstDrawTime.split(":").map(Number);

  const minutesSinceFirst = (h! - fh!) * 60 + (m! - fm!);
  if (minutesSinceFirst < 0) return 0;

  return Math.floor(minutesSinceFirst / intervalMinutes) + 1;
}

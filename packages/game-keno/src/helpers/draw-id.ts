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

/**
 * Tạo drawId duy nhất cho 1 kỳ quay Keno.
 *
 * Format: "YYYY-MM-DD.NNN" (ví dụ: "2024-01-15.042")
 *
 * @param drawDate - Ngày quay "YYYY-MM-DD"
 * @param drawNo - Số thứ tự kỳ trong ngày (1-based, ví dụ 42 → "042")
 */
export function generateKenoDrawId(drawDate: ISODateString, drawNo: number): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

/**
 * Parse drawId thành drawDate và drawNo.
 *
 * @param drawId - DrawId format "YYYY-MM-DD.NNN"
 * @returns `{ drawDate, drawNo }` nếu hợp lệ, `null` nếu format sai
 */
export function parseKenoDrawId(drawId: string): { drawDate: ISODateString; drawNo: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.(\d{3})$/.exec(drawId);
  if (!match) return null;

  return {
    drawDate: match[1]!,
    drawNo: parseInt(match[2]!, 10),
  };
}

/**
 * Tạo danh sách drawIds liên tiếp cho multi-draw ticket.
 *
 * Dùng khi player chọn chơi nhiều kỳ liên tiếp.
 * Khi drawNo vượt `drawsPerDay`, tự động chuyển sang ngày hôm sau + reset về 1.
 *
 * @param startDrawId - DrawId của kỳ đầu tiên (format "YYYY-MM-DD.NNN")
 * @param drawCount - Số kỳ tham gia (1-20, cấu hình bởi `PlayRules.maxDrawCount`)
 * @param drawsPerDay - Số kỳ quay mỗi ngày (mặc định 120 — phù hợp Keno 8 phút/kỳ)
 * @returns Mảng drawIds có độ dài = drawCount
 * @throws Nếu startDrawId không đúng format
 */
export function generateKenoDrawIdSequence(startDrawId: string, drawCount: number, drawsPerDay = 120): string[] {
  const parsed = parseKenoDrawId(startDrawId);
  if (!parsed) {
    throw new Error(`Invalid startDrawId: ${startDrawId}`);
  }

  const ids: string[] = [];
  const currentDate = new Date(parsed.drawDate + "T00:00:00");
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
 * Tính drawNo từ giờ quay trong ngày.
 *
 * Dùng khi cần biết kỳ quay nào ứng với một thời điểm cụ thể.
 * DrawNo bắt đầu từ 1 (kỳ đầu tiên trong ngày = `firstDrawTime`).
 *
 * Ví dụ: firstDrawTime = "06:00", intervalMinutes = 8
 *   - "06:00" → drawNo 1
 *   - "06:08" → drawNo 2
 *   - "21:52" → drawNo 120
 *
 * @param time - Giờ:phút "HH:mm"
 * @param firstDrawTime - Giờ kỳ đầu tiên (default "06:00")
 * @param intervalMinutes - Khoảng cách giữa các kỳ (default 8)
 * @returns drawNo (1-based). Trả 0 nếu `time` trước `firstDrawTime`.
 */
export function calculateDrawNo(time: string, firstDrawTime = "06:00", intervalMinutes = 8): number {
  const [h, m] = time.split(":").map(Number);
  const [fh, fm] = firstDrawTime.split(":").map(Number);

  const minutesSinceFirst = (h! - fh!) * 60 + (m! - fm!);
  if (minutesSinceFirst < 0) return 0;

  return Math.floor(minutesSinceFirst / intervalMinutes) + 1;
}

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
 */

import { DrawNo } from "../entities/types";
import type { ISODateString } from "../entities/types";

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

/**
 * Parse drawId thành components.
 *
 * @param drawId - Format "YYYY-MM-DD.NNN"
 * @returns { drawDate, drawNo } hoặc null nếu format sai
 */
export function parseDrawId(drawId: string): { drawDate: ISODateString; drawNo: DrawNo } | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.(\d{3})$/.exec(drawId);
  if (!match) return null;

  return {
    drawDate: match[1]!,
    drawNo: parseInt(match[2]!, 10) as DrawNo,
  };
}

/**
 * Tạo danh sách drawIds cho 1 ticket dựa trên startDrawId + số kỳ.
 *
 * Lotto 5/35 quay 2 lần/ngày, nên drawIds liên tiếp sẽ xen kẽ
 * giữa các session trong ngày và sang ngày tiếp theo.
 *
 * @param startDrawId - DrawId kỳ đầu tiên
 * @param drawCount - Số kỳ tham gia (1-6)
 * @param drawsPerDay - Số kỳ quay mỗi ngày (mặc định 2)
 * @returns Danh sách drawIds liên tiếp
 *
 * @example
 * ```ts
 * generateDrawIdSequence("2026-02-22.001", 3, 2)
 * // → ["2026-02-22.001", "2026-02-22.002", "2026-02-23.001"]
 * ```
 */
export function generateDrawIdSequence(startDrawId: string, drawCount: number, drawsPerDay: number = 2): string[] {
  const parsed = parseDrawId(startDrawId);
  if (!parsed) {
    throw new Error(`Invalid startDrawId: ${startDrawId}`);
  }

  const ids: string[] = [];
  let currentDate = new Date(parsed.drawDate + "T00:00:00");
  let currentDrawNo = parsed.drawNo as number;

  for (let i = 0; i < drawCount; i++) {
    const dateStr = currentDate.toISOString().split("T")[0]!;
    ids.push(generateDrawId(dateStr, currentDrawNo as DrawNo));

    currentDrawNo++;
    if (currentDrawNo > DrawNo.Evening) {
      currentDrawNo = DrawNo.Morning;
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return ids;
}

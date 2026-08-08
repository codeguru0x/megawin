/**
 * Power 6/55 – Draw ID Generation & Parsing
 *
 * Draw ID là định danh duy nhất cho mỗi kỳ quay Power 6/55.
 *
 * Format: "YYYY-MM-DD.NNN"
 * - YYYY-MM-DD: ngày quay (ISO date string)
 * - NNN: số thứ tự kỳ trong ngày (zero-padded 3 chữ số)
 * - Power 6/55 chỉ quay 1 kỳ/ngày → NNN luôn = "001" (DrawNo.Single)
 *
 * Lịch quay: Thứ 3 (Tue=2), Thứ 5 (Thu=4), Thứ 7 (Sat=6) — 3 kỳ/tuần.
 * Draw days khác Mega 6/45 (T4, T6, CN).
 */

import { DrawNo } from "../entities/types";
import type { ISODateString } from "../entities/types";

/**
 * Sinh draw ID từ ngày quay và số thứ tự kỳ.
 *
 * @param drawDate - Ngày quay dạng "YYYY-MM-DD"
 * @param drawNo   - Số thứ tự kỳ trong ngày (mặc định DrawNo.Single = 1)
 * @returns Draw ID dạng "YYYY-MM-DD.NNN"
 *
 * @example
 * generateDrawId("2026-03-10")       // → "2026-03-10.001"
 * generateDrawId("2026-03-10", 1)    // → "2026-03-10.001"
 */
export function generateDrawId(drawDate: ISODateString, drawNo: DrawNo = DrawNo.Single): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

/**
 * Parse draw ID thành ngày quay và số thứ tự kỳ.
 *
 * Regex: /^(\d{4}-\d{2}-\d{2})\.(\d{3})$/
 * Trả về null nếu format không hợp lệ (defensive — dùng khi nhận input từ API/DB).
 *
 * @param drawId - Draw ID cần parse (e.g. "2026-03-10.001")
 * @returns Object { drawDate, drawNo } hoặc null nếu format sai
 *
 * @example
 * parseDrawId("2026-03-10.001") // → { drawDate: "2026-03-10", drawNo: 1 }
 * parseDrawId("invalid")        // → null
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
 * Tạo danh sách draw IDs cho multi-draw ticket (mua nhiều kỳ liên tiếp).
 *
 * Power 6/55 quay thứ 3, 5, 7 (dayOfWeek = 2, 4, 6) → cần skip các ngày khác.
 * Thuật toán: duyệt từng ngày từ startDrawDate, nếu ngày đó là ngày quay → thêm vào danh sách,
 * dừng khi đủ drawCount IDs.
 *
 * Player có thể mua tối đa 6 kỳ liên tiếp (drawCount ≤ 6).
 *
 * @param startDrawDate  - Ngày bắt đầu "YYYY-MM-DD" (phải là ngày quay hợp lệ)
 * @param drawCount      - Số kỳ muốn tạo (1-6)
 * @param drawDaysOfWeek - Các ngày quay trong tuần, mặc định [2,4,6] = Tue,Thu,Sat.
 *                         Dùng JS Date.getDay(): 0=Sun, 1=Mon, 2=Tue, ..., 6=Sat.
 * @returns Mảng draw IDs theo thứ tự thời gian
 *
 * @example
 * // Mua 3 kỳ từ thứ 3 ngày 10/03/2026
 * generateDrawIdSequence("2026-03-10", 3)
 * // → ["2026-03-10.001", "2026-03-12.001", "2026-03-14.001"]
 * //    (T3 10/3, T5 12/3, T7 14/3)
 */
export function generateDrawIdSequence(
  startDrawDate: string,
  drawCount: number,
  drawDaysOfWeek: number[] = [2, 4, 6],
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
 *
 * Bắt đầu từ ngày sau fromDate, duyệt lần lượt cho đến khi gặp ngày quay hợp lệ.
 * Worst case: duyệt tối đa 6 ngày (ví dụ: Sat → Tue = skip Sun, Mon).
 *
 * Dùng khi cần xác định kỳ quay kế tiếp cho scheduling (create-draws, close-sales deadline).
 *
 * @param fromDate       - Ngày bắt đầu tìm (Date object)
 * @param drawDaysOfWeek - Các ngày quay trong tuần, mặc định [2,4,6] = Tue,Thu,Sat
 * @returns Date object của ngày quay tiếp theo (luôn > fromDate)
 *
 * @example
 * // Hôm nay thứ 3 (Tue), ngày quay tiếp theo là thứ 5 (Thu)
 * getNextDrawDate(new Date("2026-03-10")) // → Date("2026-03-12") (Thu)
 *
 * // Hôm nay thứ 7 (Sat), ngày quay tiếp theo là thứ 3 tuần sau (Tue)
 * getNextDrawDate(new Date("2026-03-14")) // → Date("2026-03-17") (Tue)
 */
export function getNextDrawDate(fromDate: Date, drawDaysOfWeek: number[] = [2, 4, 6]): Date {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + 1);
  while (!drawDaysOfWeek.includes(d.getDay())) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

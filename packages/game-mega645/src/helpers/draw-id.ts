/**
 * Mega 6/45 – Draw ID Generation
 *
 * Format: "YYYY-MM-DD.001"
 * Mega 6/45 chỉ quay 1 kỳ/ngày → drawNo luôn = 001.
 *
 * Lịch quay: Thứ 4 (3), Thứ 6 (5), Chủ nhật (0) lúc 18:00.
 * drawDate là ngày theo giờ Việt Nam (UTC+7).
 */

import { DrawNo } from "../entities/types";
import type { ISODateString } from "../entities/types";

/**
 * Tạo Draw ID từ drawDate và drawNo.
 * Format: "YYYY-MM-DD.NNN" (NNN = drawNo zero-padded 3 chữ số).
 * Mega 6/45 chỉ dùng drawNo = 1 → luôn ra "YYYY-MM-DD.001".
 *
 * @example generateDrawId("2024-03-06") → "2024-03-06.001"
 */
export function generateDrawId(drawDate: ISODateString, drawNo: DrawNo = DrawNo.Single): string {
  return `${drawDate}.${String(drawNo).padStart(3, "0")}`;
}

/**
 * Parse Draw ID ngược lại thành { drawDate, drawNo }.
 * Trả về null nếu format không hợp lệ (không match regex YYYY-MM-DD.NNN).
 *
 * @example parseDrawId("2024-03-06.001") → { drawDate: "2024-03-06", drawNo: 1 }
 * @example parseDrawId("invalid") → null
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
 * Ngày quay trong tuần theo lịch Vietlott Mega 6/45.
 * 0=Chủ nhật, 3=Thứ 4, 5=Thứ 6.
 */
const DRAW_DAYS = new Set([0, 3, 5]);

/**
 * Tìm ngày quay tiếp theo từ ngày cho trước.
 * Duyệt tối đa 7 ngày để tìm ngày quay kế tiếp trong lịch.
 *
 * @param fromDate  - Ngày bắt đầu tìm kiếm.
 * @param inclusive - true: bao gồm fromDate nếu chính là ngày quay.
 *                    false (mặc định): bắt đầu tìm từ ngày hôm sau.
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
 * Chỉ sinh drawId vào các ngày quay hợp lệ (Thứ 4, Thứ 6, Chủ nhật).
 * Dùng khi tạo nhiều kỳ quay trước (pre-create draws cho vé multi-draw).
 *
 * @param startDrawId - DrawId đầu tiên trong chuỗi (phải hợp lệ).
 * @param drawCount   - Số kỳ quay cần tạo.
 * @throws Error nếu startDrawId không đúng format.
 *
 * @example
 * generateDrawIdSequence("2024-03-06.001", 3)
 * → ["2024-03-06.001", "2024-03-08.001", "2024-03-10.001"]
 */
export function generateDrawIdSequence(startDrawId: string, drawCount: number): string[] {
  const parsed = parseDrawId(startDrawId);
  if (!parsed) throw new Error(`Invalid startDrawId: ${startDrawId}`);

  const ids: string[] = [];
  let currentDate = new Date(parsed.drawDate + "T00:00:00");

  for (let i = 0; i < drawCount; i++) {
    if (i > 0) {
      // Từ kỳ thứ 2 trở đi: tìm ngày quay tiếp theo (không inclusive).
      currentDate = getNextDrawDate(currentDate, false);
    }
    const dateStr = currentDate.toISOString().split("T")[0]!;
    ids.push(generateDrawId(dateStr));
  }

  return ids;
}

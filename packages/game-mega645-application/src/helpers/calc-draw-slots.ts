/**
 * Tính danh sách draw slots cho Mega 6/45.
 *
 * Mega 6/45 quay Thứ 4, Thứ 6, Chủ nhật (drawDaysOfWeek = [0, 3, 5]).
 * Convention: 0 = Chủ nhật, 1 = Thứ 2, ..., 6 = Thứ 7 (giống Date.getDay() / JS).
 * Mỗi ngày chỉ 1 kỳ quay lúc drawTime (VN timezone).
 */

import {
  VN_TIMEZONE,
  TZDate,
  toVNDate,
  subtractMinutes,
  formatVNDate,
  addDays,
  getDay,
  isBefore,
} from "@megawin/shared/utils";
import { DrawStatus } from "@megawin/game-core/entities";
import type { PlayRules } from "@megawin/game-mega645/entities";

export interface Mega645DrawSlot {
  /** "YYYY-MM-DD" theo giờ VN. */
  drawDate: string;
  /** Luôn = 1 (Mega 6/45 chỉ 1 kỳ/ngày). */
  drawNo: number;
  /** HH:mm từ config (ví dụ "18:00"). */
  drawTimeStr: string;
  /** UTC Date tương ứng với drawTime ở VN timezone. */
  drawTime: Date;
  /** UTC Date đóng bán = drawTime − salesCloseBeforeMinutes. */
  closeAt: Date;
  status: typeof DrawStatus.SalesOpen | typeof DrawStatus.Scheduled;
}

/**
 * Tính danh sách `count` draw slots tiếp theo từ thời điểm `now`.
 *
 * Logic duyệt từng ngày (VN timezone) bắt đầu từ hôm nay:
 * - Bỏ qua nếu ngày không nằm trong drawDaysOfWeek.
 * - Bỏ qua nếu drawId đã tồn tại trong DB.
 * - Bỏ qua nếu là hôm nay và đã qua thời điểm đóng bán (closeAt ≤ now).
 * - status = "salesOpen" nếu drawTime > now; ngược lại "scheduled".
 *
 * @param now             Thời điểm hiện tại (UTC).
 * @param count           Số slots cần tính (1–12).
 * @param config          PlayRules từ GlobalConfig.
 * @param existingDrawIds Set drawId đã có trong DB để bỏ qua kỳ trùng.
 */
export function calcMega645DrawSlots(
  now: Date,
  count: number,
  config: PlayRules,
  existingDrawIds: Set<string> = new Set(),
): Mega645DrawSlot[] {
  const { drawTime: drawTimeStr, salesCloseBeforeMinutes, drawDaysOfWeek } = config;

  const slots: Mega645DrawSlot[] = [];

  // Dùng TZDate để getDay() trả đúng thứ trong tuần theo giờ VN,
  // tránh bị lệch ngày do server chạy UTC.
  // getDay() convention: 0=Sun, 1=Mon, ..., 6=Sat — khớp drawDaysOfWeek.
  const todayVN = new TZDate(now, VN_TIMEZONE);

  for (let offset = 0; offset <= 60 && slots.length < count; offset++) {
    // addDays hoạt động đúng với TZDate, không bị lệch khi DST (dù VN không có DST).
    const dayVN = offset === 0 ? todayVN : addDays(todayVN, offset);

    if (!drawDaysOfWeek.includes(getDay(dayVN))) continue;

    const dateStr = formatVNDate(dayVN);

    // Mega 6/45: 1 kỳ/ngày, drawId = "YYYY-MM-DD.001".
    if (existingDrawIds.has(`${dateStr}.001`)) continue;

    const drawTime = toVNDate(dateStr, drawTimeStr);
    const closeAt = subtractMinutes(drawTime, salesCloseBeforeMinutes);

    // Bỏ qua nếu thời điểm đóng bán đã qua — kỳ hôm nay không còn mua được.
    if (!isBefore(now, closeAt)) continue;

    slots.push({
      drawDate: dateStr,
      drawNo: 1,
      drawTimeStr,
      drawTime,
      closeAt,
      // salesOpen khi drawTime chưa đến (staff vẫn có thể mở bán ngay).
      status: isBefore(now, drawTime) ? DrawStatus.SalesOpen : DrawStatus.Scheduled,
    });
  }

  return slots;
}

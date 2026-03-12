/**
 * Tính danh sách draw slots cho Max 3D Pro.
 *
 * Max 3D Pro quay vào T2/T4/T6 (drawDaysOfWeek = [1,3,5]) lúc 18:00.
 * Chỉ 1 kỳ/ngày (drawsPerDay = 1).
 *
 * Convention: 0 = Chủ nhật, 1 = Thứ 2, ..., 6 = Thứ 7 (JS/date-fns getDay()).
 * Server chạy UTC — mọi phép tính ngày/thứ PHẢI dùng TZDate để tránh lệch ngày.
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
} from "@megawin/shared/utils/date";
import { DrawStatus } from "@megawin/game-core/entities";
import type { PlayRules } from "@megawin/game-max3dpro/entities";

export interface Max3dproDrawSlot {
  /** "YYYY-MM-DD" theo giờ VN. */
  drawDate: string;
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
 * - Bỏ qua nếu closeAt đã qua now.
 * - status = "salesOpen" nếu drawTime > now; ngược lại "scheduled".
 *
 * @param now             Thời điểm hiện tại (UTC).
 * @param count           Số slots cần tính (1–12).
 * @param config          PlayRules từ GlobalConfig.
 * @param existingDrawIds Set drawId đã có trong DB để bỏ qua kỳ trùng.
 */
export function calcMax3dproDrawSlots(
  now: Date,
  count: number,
  config: PlayRules,
  existingDrawIds: Set<string> = new Set(),
): Max3dproDrawSlot[] {
  const { drawTimes, salesCloseBeforeMinutes, drawsPerDay, drawDaysOfWeek } = config;

  const slots: Max3dproDrawSlot[] = [];

  // Dùng TZDate để getDay() trả đúng thứ trong tuần theo giờ VN,
  // tránh bị lệch ngày do server chạy UTC.
  const todayVN = new TZDate(now, VN_TIMEZONE);

  for (let offset = 0; offset <= 60 && slots.length < count; offset++) {
    const dayVN = offset === 0 ? todayVN : addDays(todayVN, offset);

    if (!drawDaysOfWeek.includes(getDay(dayVN))) continue;

    const dateStr = formatVNDate(dayVN);

    for (let drawNo = 1; drawNo <= drawsPerDay; drawNo++) {
      if (slots.length >= count) break;

      const drawTimeStr = drawTimes[drawNo - 1]!;
      const drawId = `${dateStr}.${String(drawNo).padStart(3, "0")}`;

      if (existingDrawIds.has(drawId)) continue;

      const drawTime = toVNDate(dateStr, drawTimeStr);
      const closeAt = subtractMinutes(drawTime, salesCloseBeforeMinutes);

      // Bỏ qua nếu thời điểm đóng bán đã qua — kỳ này không còn mua được.
      if (!isBefore(now, closeAt)) continue;

      slots.push({
        drawDate: dateStr,
        drawNo,
        drawTimeStr,
        drawTime,
        closeAt,
        status: isBefore(now, drawTime) ? DrawStatus.SalesOpen : DrawStatus.Scheduled,
      });
    }
  }

  return slots;
}

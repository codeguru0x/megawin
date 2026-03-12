/**
 * Tính danh sách draw slots cho Power 6/55.
 *
 * Power 6/55 quay thứ 3, thứ 5, thứ 7 (drawDaysOfWeek = [2,4,6]),
 * mỗi ngày 1 kỳ lúc 18:00.
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
import type { PlayRules } from "@megawin/game-power655/entities";

export interface Power655DrawSlot {
  /** "YYYY-MM-DD" theo giờ VN. */
  drawDate: string;
  /** Luôn = 1 (Power 6/55 chỉ 1 kỳ/ngày). */
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
export function calcPower655DrawSlots(
  now: Date,
  count: number,
  config: PlayRules,
  existingDrawIds: Set<string> = new Set(),
): Power655DrawSlot[] {
  const { drawTimes, salesCloseBeforeMinutes, drawDaysOfWeek } = config;

  // Power 6/55 có 1 drawTime/ngày, lấy phần tử đầu từ mảng drawTimes.
  const drawTimeStr = drawTimes[0]!;

  const slots: Power655DrawSlot[] = [];

  // Dùng TZDate để getDay() trả đúng thứ trong tuần theo giờ VN,
  // tránh bị lệch ngày do server chạy UTC.
  // getDay() convention: 0=Sun, 1=Mon, ..., 6=Sat — khớp drawDaysOfWeek.
  const todayVN = new TZDate(now, VN_TIMEZONE);

  for (let offset = 0; offset <= 60 && slots.length < count; offset++) {
    // addDays hoạt động đúng với TZDate, không bị lệch khi cộng ngày.
    const dayVN = offset === 0 ? todayVN : addDays(todayVN, offset);

    if (!drawDaysOfWeek.includes(getDay(dayVN))) continue;

    const dateStr = formatVNDate(dayVN);

    // Power 6/55: 1 kỳ/ngày, drawId = "YYYY-MM-DD.001".
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

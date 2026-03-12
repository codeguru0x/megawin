/**
 * Tính danh sách draw slots cho Lotto 5/35.
 *
 * Lotto 5/35 quay hàng ngày với nhiều kỳ/ngày (drawsPerDay = 2, drawTimes = ["13:00","21:00"]).
 * Không có drawDaysOfWeek — quay mọi ngày trong tuần.
 *
 * Server chạy UTC — mọi phép tính ngày PHẢI dùng TZDate để tránh lệch ngày.
 */

import {
  VN_TIMEZONE,
  TZDate,
  toVNDate,
  subtractMinutes,
  formatVNDate,
  addDays,
  isBefore,
} from "@megawin/shared/utils/date";
import { DrawStatus } from "@megawin/game-core/entities";
import type { PlayRules } from "@megawin/game-lotto535/entities";

export interface Lotto535DrawSlot {
  /** "YYYY-MM-DD" theo giờ VN. */
  drawDate: string;
  drawNo: number;
  /** HH:mm từ config (ví dụ "13:00", "21:00"). */
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
 * - Lotto 5/35 quay mọi ngày — không lọc theo drawDaysOfWeek.
 * - Duyệt từng drawNo (1..drawsPerDay) trong ngày.
 * - Bỏ qua nếu drawId đã tồn tại trong DB.
 * - Bỏ qua nếu closeAt đã qua now.
 * - status = "salesOpen" nếu drawTime > now; ngược lại "scheduled".
 *
 * @param now             Thời điểm hiện tại (UTC).
 * @param count           Số slots cần tính (1–12).
 * @param config          PlayRules từ GlobalConfig.
 * @param existingDrawIds Set drawId đã có trong DB để bỏ qua kỳ trùng.
 */
export function calcLotto535DrawSlots(
  now: Date,
  count: number,
  config: PlayRules,
  existingDrawIds: Set<string> = new Set(),
): Lotto535DrawSlot[] {
  const { drawTimes, salesCloseBeforeMinutes, drawsPerDay } = config;

  const slots: Lotto535DrawSlot[] = [];

  // Dùng TZDate để formatVNDate() trả đúng ngày theo giờ VN,
  // tránh bị lệch ngày do server chạy UTC.
  const todayVN = new TZDate(now, VN_TIMEZONE);

  for (let offset = 0; offset <= 30 && slots.length < count; offset++) {
    const dayVN = offset === 0 ? todayVN : addDays(todayVN, offset);
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

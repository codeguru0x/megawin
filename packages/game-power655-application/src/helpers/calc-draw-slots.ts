/**
 * Tính danh sách draw slots cho Power 6/55.
 *
 * Power 6/55 quay thứ 3, thứ 5, thứ 7 (drawDaysOfWeek = [2,4,6]),
 * mỗi ngày 1 kỳ lúc 18:00.
 *
 * Quy tắc:
 *   - Chỉ tạo slot cho các ngày nằm trong drawDaysOfWeek
 *   - Kỳ có drawTime > now + salesCloseBeforeMinutes: salesOpen
 *   - Kỳ có drawTime <= now + salesCloseBeforeMinutes: scheduled (không tự mở)
 *   - Skip kỳ đã tồn tại (dựa trên existingDrawIds)
 */

import { toVNDate, subtractMinutes, formatVN } from "@megawin/shared/utils/date";
import { DrawStatus } from "@megawin/game-core/entities";
import type { PlayRules } from "@megawin/game-power655/entities";

export interface Power655DrawSlot {
  drawDate: string;
  drawNo: number;
  drawTimeStr: string;
  drawTime: Date;
  closeAt: Date;
  status: typeof DrawStatus.SalesOpen | typeof DrawStatus.Scheduled;
}

/**
 * Tính draw slots cho Power 6/55.
 *
 * @param now - Thời gian hiện tại
 * @param count - Số kỳ muốn tạo (1-12)
 * @param config - Play rules từ global config
 * @param existingDrawIds - Set drawIds đã tồn tại, để skip
 * @returns Danh sách draw slots khả dụng
 */
export function calcPower655DrawSlots(
  now: Date,
  count: number,
  config: PlayRules,
  existingDrawIds: Set<string> = new Set()
): Power655DrawSlot[] {
  const { drawTimes, salesCloseBeforeMinutes, drawDaysOfWeek } = config;

  const vnTimeStr = formatVN(now, "HH:mm:ss");
  const [hStr, mStr, sStr] = vnTimeStr.split(":");
  const nowMinutes = parseInt(hStr!) * 60 + parseInt(mStr!);
  const nowSeconds = parseInt(sStr!);
  const nowTotalSeconds = nowMinutes * 60 + nowSeconds;

  const vnDateStr = formatVN(now, "yyyy-MM-dd");

  const slots: Power655DrawSlot[] = [];
  let currentDate = vnDateStr;
  let dayOffset = 0;

  while (slots.length < count) {
    const currentDateObj = dayOffset === 0
      ? now
      : new Date(now.getTime() + dayOffset * 86_400_000);

    const dayOfWeek = parseInt(formatVN(currentDateObj, "c"));

    if (!drawDaysOfWeek.includes(dayOfWeek)) {
      dayOffset++;
      currentDate = formatVN(
        new Date(now.getTime() + dayOffset * 86_400_000),
        "yyyy-MM-dd"
      );
      if (dayOffset > 60) break;
      continue;
    }

    const drawTimeStr = drawTimes[0]!;
    const drawTime = toVNDate(currentDate, drawTimeStr);
    const closeAt = subtractMinutes(drawTime, salesCloseBeforeMinutes);

    const drawId = `${currentDate}.001`;
    if (existingDrawIds.has(drawId)) {
      dayOffset++;
      currentDate = formatVN(
        new Date(now.getTime() + dayOffset * 86_400_000),
        "yyyy-MM-dd"
      );
      if (dayOffset > 60) break;
      continue;
    }

    if (dayOffset === 0) {
      const [dh, dm] = drawTimeStr.split(":").map(Number);
      const drawMinutes = dh! * 60 + dm!;
      const closeSeconds = drawMinutes * 60 - salesCloseBeforeMinutes * 60;
      if (closeSeconds <= nowTotalSeconds) {
        dayOffset++;
        currentDate = formatVN(
          new Date(now.getTime() + dayOffset * 86_400_000),
          "yyyy-MM-dd"
        );
        if (dayOffset > 60) break;
        continue;
      }
    }

    const status =
      drawTime.getTime() > now.getTime()
        ? DrawStatus.SalesOpen
        : DrawStatus.Scheduled;

    slots.push({
      drawDate: currentDate,
      drawNo: 1,
      drawTimeStr,
      drawTime,
      closeAt,
      status,
    });

    dayOffset++;
    currentDate = formatVN(
      new Date(now.getTime() + dayOffset * 86_400_000),
      "yyyy-MM-dd"
    );

    if (dayOffset > 60) break;
  }

  return slots;
}

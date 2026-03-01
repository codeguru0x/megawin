/**
 * Tính danh sách draw slots cho Mega 6/45.
 *
 * Mega 6/45 quay Thứ 4, Thứ 6, Chủ nhật (drawDaysOfWeek = [0,3,5]),
 * mỗi ngày 1 kỳ lúc 18:00.
 */

import { toVNDate, subtractMinutes, formatVN } from "@megawin/shared/utils/date";
import { DrawStatus } from "@megawin/game-core/entities";
import type { PlayRules } from "@megawin/game-mega645/entities";

export interface Mega645DrawSlot {
  drawDate: string;
  drawNo: number;
  drawTimeStr: string;
  drawTime: Date;
  closeAt: Date;
  status: typeof DrawStatus.SalesOpen | typeof DrawStatus.Scheduled;
}

export function calcMega645DrawSlots(
  now: Date,
  count: number,
  config: PlayRules,
  existingDrawIds: Set<string> = new Set()
): Mega645DrawSlot[] {
  const { drawTime: drawTimeStr, salesCloseBeforeMinutes, drawDaysOfWeek } = config;

  const vnTimeStr = formatVN(now, "HH:mm:ss");
  const [hStr, mStr, sStr] = vnTimeStr.split(":");
  const nowTotalSeconds = parseInt(hStr!) * 3600 + parseInt(mStr!) * 60 + parseInt(sStr!);

  const slots: Mega645DrawSlot[] = [];
  let dayOffset = 0;

  while (slots.length < count) {
    const currentDateObj = dayOffset === 0
      ? now
      : new Date(now.getTime() + dayOffset * 86_400_000);

    const dayOfWeek = parseInt(formatVN(currentDateObj, "c"));
    const currentDate = formatVN(currentDateObj, "yyyy-MM-dd");

    if (!drawDaysOfWeek.includes(dayOfWeek)) {
      dayOffset++;
      if (dayOffset > 60) break;
      continue;
    }

    const drawId = `${currentDate}.001`;
    if (existingDrawIds.has(drawId)) {
      dayOffset++;
      if (dayOffset > 60) break;
      continue;
    }

    if (dayOffset === 0) {
      const [dh, dm] = drawTimeStr.split(":").map(Number);
      const closeSeconds = dh! * 3600 + dm! * 60 - salesCloseBeforeMinutes * 60;
      if (closeSeconds <= nowTotalSeconds) {
        dayOffset++;
        if (dayOffset > 60) break;
        continue;
      }
    }

    const drawTime = toVNDate(currentDate, drawTimeStr);
    const closeAt = subtractMinutes(drawTime, salesCloseBeforeMinutes);

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
    if (dayOffset > 60) break;
  }

  return slots;
}

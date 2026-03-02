/**
 * Tính danh sách draw slots cho Max 3D Pro.
 *
 * Max 3D Pro quay vào T2/T4/T6 (drawDaysOfWeek = [1,3,5]) lúc 18:00.
 * Chỉ 1 kỳ/ngày (drawsPerDay = 1).
 *
 * Quy tắc:
 *   - Kỳ có drawTime > now + salesCloseBeforeMinutes: salesOpen
 *   - Kỳ có drawTime <= now + salesCloseBeforeMinutes: scheduled
 *   - Skip kỳ đã tồn tại (dựa trên existingDrawIds)
 *   - Skip ngày không nằm trong drawDaysOfWeek
 */

import { toVNDate, subtractMinutes, formatVN } from "@megawin/shared/utils/date";
import { DrawStatus } from "@megawin/game-core/entities";
import type { PlayRules } from "@megawin/game-max3dpro/entities";

export interface Max3dproDrawSlot {
  drawDate: string;
  drawNo: number;
  drawTimeStr: string;
  drawTime: Date;
  closeAt: Date;
  status: typeof DrawStatus.SalesOpen | typeof DrawStatus.Scheduled;
}

export function calcMax3dproDrawSlots(
  now: Date,
  count: number,
  config: PlayRules,
  existingDrawIds: Set<string> = new Set()
): Max3dproDrawSlot[] {
  const {
    drawTimes,
    salesCloseBeforeMinutes,
    drawsPerDay,
    drawDaysOfWeek,
  } = config;

  const vnTimeStr = formatVN(now, "HH:mm:ss");
  const [hStr, mStr, sStr] = vnTimeStr.split(":");
  const nowTotalSeconds =
    parseInt(hStr!) * 3600 + parseInt(mStr!) * 60 + parseInt(sStr!);

  const vnDateStr = formatVN(now, "yyyy-MM-dd");

  const slots: Max3dproDrawSlot[] = [];
  let currentDate = vnDateStr;
  let dayOffset = 0;

  while (slots.length < count) {
    const currentDateObj = new Date(now.getTime() + dayOffset * 86_400_000);
    const dayOfWeek = currentDateObj.getDay();

    if (!drawDaysOfWeek.includes(dayOfWeek)) {
      dayOffset++;
      currentDate = formatVN(
        new Date(now.getTime() + dayOffset * 86_400_000),
        "yyyy-MM-dd"
      );
      if (dayOffset > 60) break;
      continue;
    }

    for (let drawNo = 1; drawNo <= drawsPerDay; drawNo++) {
      if (slots.length >= count) break;

      const drawTimeStr = drawTimes[drawNo - 1]!;
      const drawTime = toVNDate(currentDate, drawTimeStr);
      const closeAt = subtractMinutes(drawTime, salesCloseBeforeMinutes);

      const drawId = `${currentDate}.${String(drawNo).padStart(3, "0")}`;
      if (existingDrawIds.has(drawId)) continue;

      if (dayOffset === 0) {
        const [dh, dm] = drawTimeStr.split(":").map(Number);
        const closeSeconds = (dh! * 60 + dm!) * 60 - salesCloseBeforeMinutes * 60;
        if (closeSeconds <= nowTotalSeconds) continue;
      }

      const status =
        drawTime.getTime() > now.getTime()
          ? DrawStatus.SalesOpen
          : DrawStatus.Scheduled;

      slots.push({
        drawDate: currentDate,
        drawNo,
        drawTimeStr,
        drawTime,
        closeAt,
        status,
      });
    }

    dayOffset++;
    currentDate = formatVN(
      new Date(now.getTime() + dayOffset * 86_400_000),
      "yyyy-MM-dd"
    );

    if (dayOffset > 60) break;
  }

  return slots;
}

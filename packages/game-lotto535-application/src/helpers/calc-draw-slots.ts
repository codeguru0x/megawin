/**
 * Tính danh sách draw slots cho Lotto 5/35.
 *
 * Lotto 5/35 có lịch cố định: drawTimes = ["13:00", "21:00"] (config).
 * Cho phép tạo nhiều kỳ cho các ngày tiếp theo (up to maxDrawCount).
 *
 * Quy tắc:
 *   - Kỳ có drawTime > now + salesCloseBeforeMinutes: salesOpen
 *   - Kỳ có drawTime <= now + salesCloseBeforeMinutes: scheduled (không tự mở)
 *   - Skip kỳ đã tồn tại (dựa trên existingDrawIds)
 */

import { toVNDate, subtractMinutes, formatVN } from "@megawin/shared/utils/date";
import { DrawStatus } from "@megawin/game-core/entities";
import type { PlayRules } from "@megawin/game-lotto535/entities";

export interface Lotto535DrawSlot {
  drawDate: string;
  drawNo: number;
  drawTimeStr: string;
  drawTime: Date;
  closeAt: Date;
  status: typeof DrawStatus.SalesOpen | typeof DrawStatus.Scheduled;
}

/**
 * Tính draw slots cho Lotto 5/35.
 *
 * @param now - Thời gian hiện tại
 * @param count - Số kỳ muốn tạo (1-12)
 * @param config - Play rules từ global config
 * @param existingDrawIds - Set drawIds đã tồn tại, để skip
 */
export function calcLotto535DrawSlots(
  now: Date,
  count: number,
  config: PlayRules,
  existingDrawIds: Set<string> = new Set()
): Lotto535DrawSlot[] {
  const { drawTimes, salesCloseBeforeMinutes, drawsPerDay } = config;

  const vnTimeStr = formatVN(now, "HH:mm:ss");
  const [hStr, mStr, sStr] = vnTimeStr.split(":");
  const nowMinutes = parseInt(hStr!) * 60 + parseInt(mStr!);
  const nowSeconds = parseInt(sStr!);
  const nowTotalSeconds = nowMinutes * 60 + nowSeconds;

  const vnDateStr = formatVN(now, "yyyy-MM-dd");

  const slots: Lotto535DrawSlot[] = [];
  let currentDate = vnDateStr;
  let dayOffset = 0;

  while (slots.length < count) {
    for (let drawNo = 1; drawNo <= drawsPerDay; drawNo++) {
      if (slots.length >= count) break;

      const drawTimeStr = drawTimes[drawNo - 1]!;
      const drawTime = toVNDate(currentDate, drawTimeStr);
      const closeAt = subtractMinutes(drawTime, salesCloseBeforeMinutes);

      const drawId = `${currentDate}.${String(drawNo).padStart(3, "0")}`;
      if (existingDrawIds.has(drawId)) continue;

      if (dayOffset === 0) {
        const [dh, dm] = drawTimeStr.split(":").map(Number);
        const drawMinutes = dh! * 60 + dm!;
        const closeSeconds = drawMinutes * 60 - salesCloseBeforeMinutes * 60;
        if (closeSeconds <= nowTotalSeconds) continue;
      }

      const status =
        drawTime.getTime() > now.getTime() ? DrawStatus.SalesOpen : DrawStatus.Scheduled;

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
    const nextDate = new Date(now.getTime() + dayOffset * 86_400_000);
    currentDate = formatVN(nextDate, "yyyy-MM-dd");

    if (dayOffset > 30) break;
  }

  return slots;
}

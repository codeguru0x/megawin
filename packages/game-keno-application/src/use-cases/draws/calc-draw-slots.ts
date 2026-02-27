/**
 * Tính danh sách draw slots dựa theo lịch game Keno.
 *
 * Lịch game: firstDrawTime + N * interval (VD: 06:00, 06:08, 06:16, ...)
 *
 * Quy tắc:
 *   - Kỳ trong [firstDrawTime, lastDrawTime]: status = salesOpen
 *   - Kỳ > lastDrawTime và <= 23:59: status = scheduled (không cược)
 *   - Kỳ > 23:59: không tạo
 *
 * Dùng chung cho PreviewDraws và CreateDraw.
 */

import { formatVN, toVNDate } from "@megawin/shared/utils/date";

export interface DrawSlotConfig {
  firstDrawTime: string;
  lastDrawTime: string;
  drawIntervalMinutes: number;
  salesCloseBeforeSeconds: number;
}

export interface DrawSlot {
  minutes: number;
  drawTimeStr: string;
  drawTime: Date;
  closeAt: Date;
  status: "salesOpen" | "scheduled";
}

function findNextSlotMinutes(
  nowMinutes: number,
  nowSeconds: number,
  config: DrawSlotConfig
): number {
  const [fh, fm] = config.firstDrawTime.split(":").map(Number);
  const firstMinutes = fh! * 60 + fm!;

  const sinceFirst = nowMinutes - firstMinutes;
  const slotsElapsed =
    sinceFirst >= 0
      ? Math.floor(sinceFirst / config.drawIntervalMinutes) + 1
      : 0;

  let candidate = firstMinutes + slotsElapsed * config.drawIntervalMinutes;

  const nowTotalSeconds = nowMinutes * 60 + nowSeconds;
  while (candidate * 60 - config.salesCloseBeforeSeconds <= nowTotalSeconds) {
    candidate += config.drawIntervalMinutes;
  }

  return candidate;
}

function minutesToHHmm(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function calcDrawSlots(
  nowDate: Date,
  drawDate: string,
  count: number,
  config: DrawSlotConfig
): DrawSlot[] {
  const vnTimeStr = formatVN(nowDate, "HH:mm:ss");
  const [hStr, mStr, sStr] = vnTimeStr.split(":");
  const nowMinutes = parseInt(hStr!) * 60 + parseInt(mStr!);
  const nowSeconds = parseInt(sStr!);

  const [lh, lm] = config.lastDrawTime.split(":").map(Number);
  const lastDrawMinutes = lh! * 60 + lm!;

  const MAX_MINUTES = 23 * 60 + 59;

  let candidateMinutes = findNextSlotMinutes(nowMinutes, nowSeconds, config);

  const slots: DrawSlot[] = [];
  for (let i = 0; i < count; i++) {
    if (candidateMinutes > MAX_MINUTES) break;

    const drawTimeStr = minutesToHHmm(candidateMinutes);
    const drawTime = toVNDate(drawDate, drawTimeStr);
    const closeAt = new Date(
      drawTime.getTime() - config.salesCloseBeforeSeconds * 1000
    );

    const status: "salesOpen" | "scheduled" =
      candidateMinutes <= lastDrawMinutes ? "salesOpen" : "scheduled";

    slots.push({
      minutes: candidateMinutes,
      drawTimeStr,
      drawTime,
      closeAt,
      status,
    });

    candidateMinutes += config.drawIntervalMinutes;
  }

  return slots;
}

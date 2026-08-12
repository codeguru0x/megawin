/**
 * Tính danh sách draw slots dựa theo lịch game Keno.
 *
 * Lịch game: firstDrawTime + N * interval (VD: 06:00, 06:08, 06:16, ...)
 *
 * Quy tắc cross-day rollover:
 *   - Bắt đầu từ thời điểm hiện tại (giờ VN), tìm slot tiếp theo khả dụng
 *   - Nếu slot vượt quá lastDrawTime trong ngày → chuyển sang ngày tiếp theo
 *     ở firstDrawTime
 *   - Tiếp tục cho đến khi đủ count slots
 *
 * Dùng chung cho PreviewDraws và CreateDraw.
 */

import { DrawStatus } from "@megawin/game-core/entities";
import { addDays, formatVN, formatVNDate, parseHHMMToMinutes, todayVN, toVNDate } from "@megawin/shared/utils";

export interface DrawSlotConfig {
  firstDrawTime: string;
  lastDrawTime: string;
  drawIntervalMinutes: number;
  salesCloseBeforeSeconds: number;
}

export interface DrawSlot {
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  minutes: number;
  drawTimeStr: string;
  drawTime: Date;
  closeAt: Date;
  status: typeof DrawStatus.SalesOpen | typeof DrawStatus.Scheduled;
}

/**
 * Đổi `"HH:mm"` thành phút trong ngày. Trả `0` khi format sai — config đã được Zod
 * validate ở route nên nhánh này chỉ là fallback phòng data cũ.
 */
function parseHHmm(timeStr: string): number {
  return parseHHMMToMinutes(timeStr) ?? 0;
}

function minutesToHHmm(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Tìm slot tiếp theo trong ngày dựa trên thời điểm hiện tại.
 * Trả về phút trong ngày của slot, hoặc -1 nếu không còn slot hợp lệ trong ngày.
 */
function findNextSlotInDay(nowMinutes: number, nowSeconds: number, config: DrawSlotConfig, isToday: boolean): number {
  const firstMinutes = parseHHmm(config.firstDrawTime);
  const lastMinutes = parseHHmm(config.lastDrawTime);

  if (!isToday) return firstMinutes;

  const sinceFirst = nowMinutes - firstMinutes;
  const slotsElapsed = sinceFirst >= 0 ? Math.floor(sinceFirst / config.drawIntervalMinutes) + 1 : 0;

  let candidate = firstMinutes + slotsElapsed * config.drawIntervalMinutes;

  // Đảm bảo slot chưa quá hạn đóng bán
  const nowTotalSeconds = nowMinutes * 60 + nowSeconds;
  while (candidate * 60 - config.salesCloseBeforeSeconds <= nowTotalSeconds) {
    candidate += config.drawIntervalMinutes;
  }

  // Nếu vượt quá lastDrawTime → không còn slot trong ngày
  if (candidate > lastMinutes) return -1;

  return candidate;
}

/**
 * Tính danh sách draw slots, hỗ trợ cross-day rollover.
 *
 * Bắt đầu từ now (giờ VN), nếu hết slot trong ngày (vượt lastDrawTime)
 * thì chuyển sang ngày tiếp theo ở firstDrawTime.
 */
export function calcDrawSlots(nowDate: Date, count: number, config: DrawSlotConfig): DrawSlot[] {
  const vnTimeStr = formatVN(nowDate, "HH:mm:ss");
  const [hStr, mStr, sStr] = vnTimeStr.split(":");
  const nowMinutes = parseInt(hStr!) * 60 + parseInt(mStr!);
  const nowSeconds = parseInt(sStr!);

  const firstMinutes = parseHHmm(config.firstDrawTime);
  const lastMinutes = parseHHmm(config.lastDrawTime);

  let currentDate = todayVN();
  let candidateMinutes = findNextSlotInDay(nowMinutes, nowSeconds, config, true);

  // Nếu hôm nay hết slot → bắt đầu từ ngày mai
  if (candidateMinutes === -1) {
    currentDate = formatVNDate(addDays(nowDate, 1));
    candidateMinutes = firstMinutes;
  }

  const slots: DrawSlot[] = [];
  while (slots.length < count) {
    // Nếu vượt lastDrawTime → rollover sang ngày tiếp theo
    if (candidateMinutes > lastMinutes) {
      const nextDay = addDays(toVNDate(currentDate, "00:00"), 1);
      currentDate = formatVNDate(nextDay);
      candidateMinutes = firstMinutes;
    }

    const drawTimeStr = minutesToHHmm(candidateMinutes);
    const drawTime = toVNDate(currentDate, drawTimeStr);
    const closeAt = new Date(drawTime.getTime() - config.salesCloseBeforeSeconds * 1000);

    const status = candidateMinutes <= lastMinutes ? DrawStatus.SalesOpen : DrawStatus.Scheduled;

    slots.push({
      drawDate: currentDate,
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

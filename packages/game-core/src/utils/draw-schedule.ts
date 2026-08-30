/**
 * Game Core – Draw Schedule Helpers (hàm toán thuần, KHÔNG I/O)
 *
 * Suy số kỳ quay/ngày từ khung giờ + khoảng cách giữa 2 kỳ liên tiếp — dùng cho lịch
 * quay kiểu A (lưới đều trong ngày, xem `vietlott-period.ts` — `VietlottScheduleKind.Grid`).
 * Tách riêng khỏi `@megawin/shared/utils` vì đây là khái niệm nghiệp vụ GAME (lịch quay),
 * không phải date util thuần chung cho toàn hệ thống.
 */

import { parseHHMMToMinutes } from "@megawin/shared/utils";

/**
 * Số kỳ quay/ngày suy ra từ khung giờ + khoảng cách giữa 2 kỳ liên tiếp.
 *
 * Công thức: `floor((kỳ cuối − kỳ đầu) ÷ khoảng cách) + 1` — kỳ đầu tính là 1 kỳ.
 * Dùng cho game quay nhanh (Keno, Bingo 18) để hiển thị số kỳ derive từ config
 * thật, KHÔNG hardcode.
 *
 * Trả `null` khi input chưa hợp lệ (giờ sai format, interval ≤ 0, hoặc kỳ cuối
 * sớm hơn kỳ đầu) để UI không hiện số rác trong lúc staff đang gõ.
 *
 * @example
 *   computeDrawsPerDay("06:00", "21:55", 5) → 192
 *   computeDrawsPerDay("06:00", "05:00", 5) → null (kỳ cuối < kỳ đầu)
 */
export function computeDrawsPerDay(
  firstDrawTime: string,
  lastDrawTime: string,
  intervalMinutes: number,
): number | null {
  const first = parseHHMMToMinutes(firstDrawTime);
  const last = parseHHMMToMinutes(lastDrawTime);

  if (first === null || last === null || intervalMinutes <= 0 || last < first) {
    return null;
  }

  return Math.floor((last - first) / intervalMinutes) + 1;
}

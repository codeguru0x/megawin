/**
 * Financial Date Utility
 *
 * Ngày tài chính (financial date) dùng cho báo cáo tài chính hệ thống.
 *
 * Business rule:
 *   Ngày tài chính tính từ 11:00 sáng hôm nay đến 10:59:59 sáng hôm sau
 *   theo giờ Asia/Ho_Chi_Minh (UTC+7).
 *
 *   Ví dụ (giờ Việt Nam):
 *   - 15/2 lúc 13:00 → financialDate = "2026-02-15" (13 >= 11)
 *   - 15/2 lúc 10:30 → financialDate = "2026-02-14" (10 < 11)
 *
 * LƯU Ý:
 *   Server chạy UTC+0 nhưng mốc 11:00 là giờ Asia/Ho_Chi_Minh.
 *   Util này dùng TZDate (@date-fns/tz) để convert chính xác sang giờ VN
 *   trước khi so sánh – hoạt động đúng trên bất kỳ server timezone nào.
 *
 * USAGE:
 *   Chỉ gọi getFinancialDate() tại thời điểm TẠO DRAW (dựa trên drawTime).
 *   Ticket, entry, report phải lấy financialDate từ draw – không tự tính lại.
 */

import { TZDate } from "@date-fns/tz";
import { format, subDays } from "date-fns";

import { VN_UTC_OFFSET } from "./date";

const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";
const FINANCIAL_DAY_START_HOUR = 11;
const FINANCIAL_DATE_FORMAT = "yyyy-MM-dd";

/**
 * Tính ngày tài chính từ drawTime.
 *
 * Convert sang giờ Asia/Ho_Chi_Minh rồi xét:
 *   giờ VN >= 11:00 → ngày tài chính = ngày hôm đó (VN)
 *   giờ VN <  11:00 → ngày tài chính = ngày hôm trước (VN)
 *
 * Server chạy UTC+0 cũng an toàn vì TZDate luôn convert đúng timezone.
 *
 * @param date - Thời điểm cần tính (thường là drawTime). Mặc định = now.
 * @param timezone - IANA timezone. Mặc định = "Asia/Ho_Chi_Minh".
 * @returns Ngày tài chính dạng "YYYY-MM-DD".
 */
export function getFinancialDate(date: Date | string = new Date(), timezone: string = DEFAULT_TIMEZONE): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const tzDate = new TZDate(d, timezone);
  const hour = tzDate.getHours();

  if (hour < FINANCIAL_DAY_START_HOUR) {
    const previousDay = subDays(tzDate, 1);
    return format(previousDay, FINANCIAL_DATE_FORMAT);
  }

  return format(tzDate, FINANCIAL_DATE_FORMAT);
}

/**
 * Lấy khoảng thời gian (start, end) của 1 ngày tài chính.
 *
 * Dùng để query báo cáo: WHERE timestamp >= start AND timestamp < end.
 *
 * @param financialDate - Ngày tài chính "YYYY-MM-DD".
 * @param timezone - IANA timezone. Mặc định = "Asia/Ho_Chi_Minh".
 * @returns { start: Date, end: Date } - start inclusive, end exclusive.
 */
export function getFinancialDateRange(
  financialDate: string,
  // timezone parameter kept for backward compat — only Asia/Ho_Chi_Minh (+07:00) is supported.
  _timezone: string = DEFAULT_TIMEZONE,
): { start: Date; end: Date } {
  const hourStr = String(FINANCIAL_DAY_START_HOUR).padStart(2, "0");

  // Dùng explicit +07:00 offset thay vì TZDate string constructor để tránh
  // lệch giờ khi server chạy UTC (new TZDate(str, tz) parse dựa vào system timezone).
  const start = new Date(`${financialDate}T${hourStr}:00:00${VN_UTC_OFFSET}`);

  const nextDay = format(
    new TZDate(new Date(start.getTime() + 24 * 60 * 60 * 1000), DEFAULT_TIMEZONE),
    FINANCIAL_DATE_FORMAT,
  );

  const end = new Date(`${nextDay}T${hourStr}:00:00${VN_UTC_OFFSET}`);

  return { start, end };
}

/**
 * Kiểm tra 1 timestamp có thuộc ngày tài chính cho trước không.
 *
 * @param date - Timestamp cần kiểm tra.
 * @param financialDate - Ngày tài chính "YYYY-MM-DD".
 * @param timezone - IANA timezone.
 */
export function isInFinancialDate(
  date: Date | string,
  financialDate: string,
  timezone: string = DEFAULT_TIMEZONE,
): boolean {
  const { start, end } = getFinancialDateRange(financialDate, timezone);
  const d = typeof date === "string" ? new Date(date) : date;
  return d >= start && d < end;
}

export { DEFAULT_TIMEZONE as FINANCIAL_TIMEZONE, FINANCIAL_DAY_START_HOUR };

/**
 * Độ chia thời gian khi gộp báo cáo theo ngày tài chính.
 *
 * Dùng cho báo cáo xu hướng: 1 dòng = 1 kỳ (ngày / tuần / tháng) thay vì 1 dòng = 1 ngày.
 */
export const FinancialPeriod = {
  Day: "day",
  Week: "week",
  Month: "month",
} as const;
export type FinancialPeriod = (typeof FinancialPeriod)[keyof typeof FinancialPeriod];

/**
 * Khoá gộp kỳ của một ngày tài chính — dùng làm `_id` khi roll-up nhiều ngày thành 1 dòng.
 *
 * | Độ chia | Khoá trả về | Ví dụ (từ `"2026-06-17"`) |
 * |---|---|---|
 * | `day`   | chính ngày đó `YYYY-MM-DD` | `"2026-06-17"` |
 * | `week`  | **thứ Hai** của tuần ISO, `YYYY-MM-DD` | `"2026-06-15"` |
 * | `month` | `YYYY-MM` | `"2026-06"` |
 *
 * Tuần trả về NGÀY BẮT ĐẦU (không phải `"2026-W25"`) vì khoá này đi thẳng lên biểu đồ/bảng: dạng
 * `YYYY-MM-DD` được nhận là mốc thời gian nên trục X hiện `15/06`, còn `"2026-W25"` chỉ là chuỗi
 * phân loại — người vận hành phải tự tra tuần 25 là tuần nào.
 *
 * Tính bằng chuỗi + UTC, KHÔNG dùng timezone: `financialDate` đã là ngày tài chính đã chốt (mốc
 * 11:00 giờ VN đã áp lúc tạo draw), nên gộp kỳ chỉ là phép chia lịch trên chuỗi đó. Đưa timezone
 * vào đây là dịch ngày lần thứ hai.
 *
 * @param financialDate - Ngày tài chính `YYYY-MM-DD`.
 * @param period - Độ chia cần gộp.
 * @returns Khoá kỳ; sort lexicographic của khoá LUÔN đúng thứ tự thời gian (cả 3 độ chia).
 */
export function financialPeriodKey(financialDate: string, period: FinancialPeriod): string {
  if (period === FinancialPeriod.Month) {
    return financialDate.slice(0, 7);
  }
  if (period === FinancialPeriod.Day) {
    return financialDate;
  }
  // Tuần: lùi về thứ Hai. `getUTCDay()` trả 0 cho Chủ nhật — với tuần ISO, Chủ nhật là ngày CUỐI
  // tuần nên phải lùi 6 ngày, không phải 0 (lỗi off-by-one kinh điển nếu dùng thẳng getUTCDay).
  const date = new Date(`${financialDate}T00:00:00Z`);
  const weekday = date.getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

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

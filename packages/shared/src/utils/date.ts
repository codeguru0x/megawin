/**
 * Date Utility – Timezone-aware helpers cho Asia/Ho_Chi_Minh
 *
 * Server chạy UTC+0 nhưng tất cả business logic làm việc ở giờ Việt Nam.
 * Module này cung cấp các hàm tiện ích để:
 *   - Tạo Date chính xác từ "YYYY-MM-DD" + "HH:mm" theo giờ VN
 *   - Format Date sang string theo giờ VN
 *   - Lấy ngày hiện tại (VN), thời gian hiện tại (VN)
 *   - So sánh, cộng/trừ thời gian
 *
 * Tất cả Date trả về vẫn là UTC timestamp chuẩn –
 * chỉ khác ở chỗ tạo/format đúng theo Asia/Ho_Chi_Minh.
 */

import { TZDate } from "@date-fns/tz";
import {
  format,
  addMinutes,
  subMinutes,
  addDays,
  subDays,
  addHours,
  subHours,
  startOfDay,
  endOfDay,
  isBefore,
  isAfter,
  isEqual,
} from "date-fns";

export const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

// ─────────────────────────────────────────────
// Tạo Date từ components (theo giờ VN)
// ─────────────────────────────────────────────

/**
 * Tạo Date từ "YYYY-MM-DD" + "HH:mm" theo giờ VN.
 *
 * Ví dụ: toVNDate("2026-02-15", "13:00") → Date tương ứng 13:00 VN (= 06:00 UTC).
 */
export function toVNDate(dateStr: string, timeStr: string): Date {
  const tzDate = new TZDate(`${dateStr}T${timeStr}:00`, VN_TIMEZONE);
  return new Date(tzDate.getTime());
}

/**
 * Tạo Date từ "YYYY-MM-DD" lúc 00:00:00 giờ VN.
 */
export function toVNStartOfDay(dateStr: string): Date {
  const tzDate = new TZDate(`${dateStr}T00:00:00`, VN_TIMEZONE);
  return new Date(tzDate.getTime());
}

/**
 * Tạo Date từ "YYYY-MM-DD" lúc 23:59:59.999 giờ VN.
 */
export function toVNEndOfDay(dateStr: string): Date {
  const tzDate = new TZDate(`${dateStr}T23:59:59.999`, VN_TIMEZONE);
  return new Date(tzDate.getTime());
}

// ─────────────────────────────────────────────
// Format Date → string (theo giờ VN)
// ─────────────────────────────────────────────

/**
 * Format Date sang "YYYY-MM-DD" theo giờ VN.
 */
export function formatVNDate(date: Date): string {
  return format(new TZDate(date, VN_TIMEZONE), "yyyy-MM-dd");
}

/**
 * Format Date sang "HH:mm" theo giờ VN.
 */
export function formatVNTime(date: Date): string {
  return format(new TZDate(date, VN_TIMEZONE), "HH:mm");
}

/**
 * Format Date sang "HH:mm:ss" theo giờ VN.
 */
export function formatVNTimeWithSeconds(date: Date): string {
  return format(new TZDate(date, VN_TIMEZONE), "HH:mm:ss");
}

/**
 * Format ISO string hoặc Date thành "HH:mm" theo giờ VN cho hiển thị UI.
 * Null-safe: trả "—" nếu input rỗng hoặc không hợp lệ.
 */
export function displayVNTime(value: string | Date | undefined | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return format(new TZDate(d, VN_TIMEZONE), "HH:mm");
}

/**
 * Format ISO string hoặc Date thành "HH:mm:ss" theo giờ VN cho hiển thị UI.
 * Null-safe: trả "—" nếu input rỗng hoặc không hợp lệ.
 */
export function displayVNTimeWithSeconds(value: string | Date | undefined | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return format(new TZDate(d, VN_TIMEZONE), "HH:mm:ss");
}

/**
 * Format ISO string hoặc Date thành "DD/MM/YYYY HH:mm" theo giờ VN cho hiển thị UI.
 * Null-safe: trả "—" nếu input rỗng hoặc không hợp lệ.
 */
export function displayVNDateTime(value: string | Date | undefined | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return format(new TZDate(d, VN_TIMEZONE), "dd/MM/yyyy HH:mm");
}

/**
 * Format Date sang "YYYY-MM-DD HH:mm:ss" theo giờ VN.
 */
export function formatVNDateTime(date: Date): string {
  return format(new TZDate(date, VN_TIMEZONE), "yyyy-MM-dd HH:mm:ss");
}

/**
 * Format Date với pattern tuỳ ý, theo giờ VN.
 */
export function formatVN(date: Date, pattern: string): string {
  return format(new TZDate(date, VN_TIMEZONE), pattern);
}

// ─────────────────────────────────────────────
// Lấy thông tin hiện tại theo giờ VN
// ─────────────────────────────────────────────

/**
 * Lấy ngày hiện tại "YYYY-MM-DD" theo giờ VN.
 */
export function todayVN(): string {
  return formatVNDate(new Date());
}

/**
 * Lấy ngày hôm qua "YYYY-MM-DD" theo giờ VN.
 */
export function yesterdayVN(): string {
  return formatVNDate(subDays(new Date(), 1));
}

/**
 * Lấy thời gian hiện tại dưới dạng TZDate theo giờ VN.
 * Trả về Date object có context timezone Asia/Ho_Chi_Minh.
 */
export function nowVN(): Date {
  return new TZDate(new Date(), VN_TIMEZONE);
}

/**
 * Lấy giờ hiện tại (0-23) theo giờ VN.
 */
export function currentVNHour(): number {
  return new TZDate(new Date(), VN_TIMEZONE).getHours();
}

// ─────────────────────────────────────────────
// Arithmetic helpers (trả Date chuẩn)
// ─────────────────────────────────────────────

export { addMinutes, subMinutes, addDays, subDays, addHours, subHours };

/**
 * Trừ phút từ 1 Date, trả về Date mới.
 */
export function subtractMinutes(date: Date, minutes: number): Date {
  return subMinutes(date, minutes);
}

// ─────────────────────────────────────────────
// Comparison helpers
// ─────────────────────────────────────────────

export { isBefore, isAfter, isEqual };

// ─────────────────────────────────────────────
// Start/End of day theo giờ VN
// ─────────────────────────────────────────────

/**
 * Lấy start-of-day (00:00:00) theo giờ VN cho 1 Date.
 */
export function startOfDayVN(date: Date): Date {
  const tzDate = new TZDate(date, VN_TIMEZONE);
  const sod = startOfDay(tzDate);
  return new Date(sod.getTime());
}

/**
 * Lấy end-of-day (23:59:59.999) theo giờ VN cho 1 Date.
 */
export function endOfDayVN(date: Date): Date {
  const tzDate = new TZDate(date, VN_TIMEZONE);
  const eod = endOfDay(tzDate);
  return new Date(eod.getTime());
}

// ─────────────────────────────────────────────
// Time Rounding (floor / ceil theo interval)
// ─────────────────────────────────────────────

/**
 * Làm tròn xuống (floor) đến bội số `intervalMinutes` phút gần nhất.
 *
 * Ví dụ (intervalMinutes = 5):
 *   15:01:25 → 15:00:00
 *   15:07:30 → 15:05:00
 *   15:10:00 → 15:10:00 (đã tròn)
 *
 * Ví dụ (intervalMinutes = 1):
 *   15:01:25 → 15:01:00
 */
export function floorTime(date: Date, intervalMinutes: number = 1): Date {
  const ms = intervalMinutes * 60_000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

/**
 * Làm tròn lên (ceil) đến bội số `intervalMinutes` phút gần nhất.
 * Nếu thời gian đã tròn → giữ nguyên.
 *
 * Ví dụ (intervalMinutes = 5):
 *   15:01:25 → 15:05:00
 *   15:07:30 → 15:10:00
 *   15:10:00 → 15:10:00 (đã tròn)
 *
 * Ví dụ (intervalMinutes = 1):
 *   15:01:25 → 15:02:00
 */
export function ceilTime(date: Date, intervalMinutes: number = 1): Date {
  const ms = intervalMinutes * 60_000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

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
  addDays,
  addHours,
  addMinutes,
  endOfDay,
  format,
  getDay,
  isAfter,
  isBefore,
  isEqual,
  startOfDay,
  subDays,
  subHours,
  subMinutes,
} from "date-fns";

export const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

/**
 * UTC offset cố định của Việt Nam (+07:00).
 *
 * Dùng để tạo Date từ string mà không phụ thuộc vào system timezone của server.
 * Vietnam không có DST nên offset luôn là +07:00.
 */
export const VN_UTC_OFFSET = "+07:00";

// ─────────────────────────────────────────────
// Tạo Date từ components (theo giờ VN)
// ─────────────────────────────────────────────

/**
 * Tạo Date từ "YYYY-MM-DD" + "HH:mm" theo giờ VN.
 *
 * Luôn đúng bất kể system timezone của server (UTC hay VN).
 * Dùng explicit `+07:00` offset thay vì TZDate string constructor
 * vì `new TZDate(str, tz)` parse string dựa trên system timezone nội bộ,
 * dẫn đến lệch 7 tiếng khi server chạy UTC.
 *
 * Ví dụ: toVNDate("2026-02-15", "13:00") → Date tương ứng 13:00 VN (= 06:00 UTC).
 */
export function toVNDate(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00${VN_UTC_OFFSET}`);
}

/**
 * Ghép "YYYY-MM-DD" + "HH:mm" thành ISO string có offset `+07:00` tường minh (giờ VN).
 *
 * Dùng khi cần GIỮ NGUYÊN dạng string (không cần `Date` object) để gửi lên API/lưu vào
 * form state — VD field `drawTime` trong form tạo kỳ quay (backoffice). Cùng công thức với
 * {@link toVNDate}, chỉ khác kiểu trả về; tách riêng vì gọi `.toISOString()` trên `Date` sẽ
 * đổi sang giờ UTC (`Z`), không còn giữ nguyên literal string theo giờ VN.
 *
 * Ví dụ: toVNIsoString("2026-02-15", "13:00") → "2026-02-15T13:00:00+07:00"
 */
export function toVNIsoString(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}:00${VN_UTC_OFFSET}`;
}

/**
 * Tạo Date từ "YYYY-MM-DD" + "HH:mm:ss" theo giờ VN.
 *
 * Dùng cho game có chu kỳ ngắn (Keno, Bingo18) — cần độ chính xác đến giây.
 * Luôn đúng bất kể system timezone của server.
 *
 * Ví dụ: toVNDateWithSeconds("2026-02-15", "13:00:45") → Date tương ứng 13:00:45 VN (= 06:00:45 UTC).
 */
export function toVNDateWithSeconds(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}${VN_UTC_OFFSET}`);
}

/**
 * Tạo Date từ "YYYY-MM-DD" lúc 00:00:00 giờ VN.
 *
 * Luôn đúng bất kể system timezone của server.
 */
export function toVNStartOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00${VN_UTC_OFFSET}`);
}

/**
 * Tạo Date từ "YYYY-MM-DD" lúc 23:59:59.999 giờ VN.
 *
 * Luôn đúng bất kể system timezone của server.
 */
export function toVNEndOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999${VN_UTC_OFFSET}`);
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
 * Format ISO string hoặc Date thành "YYYY-MM-DD" theo giờ VN.
 * Null-safe: trả "—" nếu input rỗng hoặc không hợp lệ.
 *
 * Dùng khi cần trích ngày (theo giờ VN) từ 1 timestamp ISO để bind vào field ngày
 * dạng string trong form — VD field `date` trong form tạo kỳ quay (backoffice).
 */
export function displayVNDate(value: string | Date | undefined | null): string {
  if (!value) {
    return "—";
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  return format(new TZDate(d, VN_TIMEZONE), "yyyy-MM-dd");
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
 * Lấy ngày tài chính hiện tại "YYYY-MM-DD" theo giờ VN.
 *
 * Ngày tài chính thay đổi lúc 11:00 VN — trước 11h → vẫn thuộc ngày hôm qua.
 * Dùng thay cho các `getFinancialDateToday()` local trong từng game package.
 *
 * Ví dụ: gọi lúc 09:00 VN ngày 15/2 → trả "2026-02-14"
 *         gọi lúc 13:00 VN ngày 15/2 → trả "2026-02-15"
 */
export function financialDateTodayVN(): string {
  const now = new Date();
  // Dùng UTC math trực tiếp — không phụ thuộc system timezone.
  // vnMinutes là tổng phút trong ngày tính theo giờ VN (0–1439).
  const vnMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 7 * 60) % (24 * 60);
  const vnDate = new Date(now.getTime() + 7 * 60 * 60_000);
  if (vnMinutes < 11 * 60) {
    vnDate.setUTCDate(vnDate.getUTCDate() - 1);
  }
  const y = vnDate.getUTCFullYear();
  const m = String(vnDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

export { addDays, addHours, addMinutes, getDay, subDays, subHours, subMinutes };

/**
 * Trừ phút từ 1 Date, trả về Date mới.
 */
export function subtractMinutes(date: Date, minutes: number): Date {
  return subMinutes(date, minutes);
}

// ─────────────────────────────────────────────
// Comparison helpers
// ─────────────────────────────────────────────

export { isAfter, isBefore, isEqual, TZDate };

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
// Time-of-day "HH:mm" (không gắn ngày, không timezone)
// ─────────────────────────────────────────────

/**
 * Regex chuẩn cho giờ trong ngày format `HH:mm` — 00:00 đến 23:59, zero-padded.
 *
 * Dùng chung cho Zod schema (`z.string().regex(HHMM_PATTERN, ...)`) ở cả route API
 * lẫn form config backoffice, thay vì mỗi file tự khai `const timePattern = ...`.
 *
 * ⚠️ KHÔNG có flag `g` — regex `/g` mang state `lastIndex`, `.test()` gọi lần 2 sẽ
 * trả sai. Giữ nguyên không thêm flag.
 */
export const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Đổi giờ trong ngày `"HH:mm"` thành số phút kể từ 00:00.
 *
 * Trả `null` khi chuỗi không đúng format (VD người dùng đang gõ dở trên form) —
 * caller phải xử lý nhánh `null` thay vì hiện `NaN` ra UI.
 *
 * @example
 *   parseHHMMToMinutes("00:00") → 0
 *   parseHHMMToMinutes("18:30") → 1110
 *   parseHHMMToMinutes("24:00") → null (giờ không hợp lệ)
 *   parseHHMMToMinutes("6:05")  → null (thiếu zero-padding)
 */
export function parseHHMMToMinutes(time: string): number | null {
  if (!HHMM_PATTERN.test(time)) {
    return null;
  }
  // Regex đã chốt đúng 2 nhóm số hợp lệ nên destructure luôn có giá trị.
  const [hours, minutes] = time.split(":") as [string, string];
  return Number(hours) * 60 + Number(minutes);
}

/**
 * Hàm NGHỊCH ĐẢO của {@link parseHHMMToMinutes}: đổi số phút kể từ 00:00 thành `"HH:mm"`.
 *
 * Luôn zero-padded 2 chữ số cả giờ và phút, để chuỗi trả về dùng được ngay với
 * {@link toVNDate}, {@link HHMM_PATTERN} và mọi Zod schema giờ trong ngày.
 *
 * KHÔNG tự wrap về trong ngày: `1440` → `"24:00"`, `1500` → `"25:00"`. Caller chịu trách
 * nhiệm truyền phút trong `[0, 1439]` — wrap ngầm sẽ che mất bug tính lịch quay tràn ngày.
 *
 * @example
 *   minutesToHHmm(0)    → "00:00"
 *   minutesToHHmm(366)  → "06:06"
 *   minutesToHHmm(1110) → "18:30"
 */
export function minutesToHHmm(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Số phút kể từ 00:00 **theo giờ VN** của một mốc thời gian (0–1439).
 *
 * Dùng để đối chiếu một `Date` (UTC instant lấy từ DB hoặc từ input ISO) với lưới giờ quay
 * trong game config — vốn khai báo bằng `"HH:mm"` giờ VN.
 *
 * ⚠️ KHÔNG dùng `date.getHours()` cho việc này: nó trả giờ theo timezone của **process**.
 * Lambda/worker chạy UTC nên sẽ lệch đúng 7 tiếng, và bug đó chỉ lộ ra ở ranh giới ngày.
 *
 * @example
 *   minutesOfDayVN(new Date("2026-08-30T06:06:00+07:00")) → 366
 *   minutesOfDayVN(new Date("2026-08-29T23:06:00Z"))      → 366 (06:06 giờ VN ngày kế tiếp)
 */
export function minutesOfDayVN(at: Date): number {
  // Default 0 chỉ để thoả type — `formatVN(…, "HH:mm")` luôn trả đúng 2 phần số.
  const [h = 0, m = 0] = formatVN(at, "HH:mm").split(":").map(Number);
  return h * 60 + m;
}

/**
 * Số giây kể từ 00:00 **theo giờ VN** của một mốc thời gian (0–86399).
 *
 * Bản phân giải giây của {@link minutesOfDayVN}, dành cho so sánh cần độ chính xác dưới phút —
 * VD kiểm tra một kỳ quay còn đủ cửa sổ bán hay không, khi `salesCloseBeforeSeconds` cấu hình
 * theo giây.
 *
 * @param at - Mốc cần quy đổi. Bỏ trống = thời điểm hiện tại.
 */
export function secondsOfDayVN(at: Date = new Date()): number {
  // Default 0 chỉ để thoả type — `formatVN(…, "HH:mm:ss")` luôn trả đúng 3 phần số.
  const [h = 0, m = 0, s = 0] = formatVN(at, "HH:mm:ss").split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

// ─────────────────────────────────────────────
// Ngày `YYYY-MM-DD` (chuỗi thuần, không timezone)
// ─────────────────────────────────────────────

/**
 * Regex chuẩn cho ngày format `YYYY-MM-DD`.
 *
 * ⚠️ KHÔNG có flag `g` — cùng lý do với {@link HHMM_PATTERN}.
 */
export const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Đổi `"YYYY-MM-DD"` thành `Date` ở 00:00 GIỜ MÁY (local), dùng cho calendar picker —
 * KHÔNG dùng cho tính toán tài chính (dùng `toVNStartOfDay` khi cần mốc giờ VN).
 *
 * Trả `undefined` khi chuỗi sai format hoặc ngày không tồn tại (VD `"2026-02-31"`)
 * để caller hiện trạng thái "chưa chọn ngày" thay vì `Invalid Date`.
 *
 * @example
 *   parseYMDToLocalDate("2026-03-07")  → Date 2026-03-07 00:00 local
 *   parseYMDToLocalDate("2026-3-7")    → undefined (thiếu zero-padding)
 *   parseYMDToLocalDate("not-a-date")  → undefined
 */
export function parseYMDToLocalDate(dateStr: string): Date | undefined {
  if (!YMD_PATTERN.test(dateStr)) {
    return undefined;
  }
  // Regex đã chốt đúng 3 nhóm số nên destructure luôn có giá trị.
  const [year, month, day] = dateStr.split("-") as [string, string, string];
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Thứ trong tuần của 1 ngày "YYYY-MM-DD" — `0`=Chủ Nhật … `6`=Thứ Bảy.
 *
 * Thứ trong tuần của 1 ngày lịch KHÔNG phụ thuộc timezone (ngày 2026-03-07 luôn là thứ 7
 * dù xem ở timezone nào) — tính thuần bằng `Date.UTC` để không lệ thuộc system timezone
 * của server, KHÔNG dùng `toVNDate`/`TZDate` (không cần thiết cho phép tính này).
 *
 * @example
 *   dayOfWeek("2026-03-07") → 6 (Thứ Bảy)
 */
export function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Nhãn thứ trong tuần (tiếng Việt) — dạng ĐẦY ĐỦ, dùng cho text mô tả dài (VD tool AI đọc
 * lịch quay `drawDaysOfWeek` thành câu tiếng Việt).
 *
 * Key cùng convention với {@link dayOfWeek} / `Date.getDay()`: `0`=Chủ nhật … `6`=Thứ Bảy.
 */
export const WEEKDAY_LABELS_FULL: Record<number, string> = {
  0: "Chủ nhật",
  1: "Thứ Hai",
  2: "Thứ Ba",
  3: "Thứ Tư",
  4: "Thứ Năm",
  5: "Thứ Sáu",
  6: "Thứ Bảy",
};

/**
 * Nhãn thứ trong tuần (tiếng Việt) — dạng NGẮN, dùng cho nút chọn ngày quay trong form
 * cấu hình game (`play-rules-section.tsx`).
 *
 * Key cùng convention với {@link WEEKDAY_LABELS_FULL}.
 */
export const WEEKDAY_LABELS_SHORT: Record<number, string> = {
  0: "Chủ nhật",
  1: "Thứ 2",
  2: "Thứ 3",
  3: "Thứ 4",
  4: "Thứ 5",
  5: "Thứ 6",
  6: "Thứ 7",
};

/**
 * Nhãn thứ trong tuần (tiếng Việt) — dạng VIẾT TẮT, dùng cho cột "Thứ" hẹp trong bảng tạo
 * nhiều kỳ quay (`create-draw-action.tsx`).
 *
 * Key cùng convention với {@link WEEKDAY_LABELS_FULL}.
 */
export const WEEKDAY_LABELS_ABBR: Record<number, string> = {
  0: "CN",
  1: "T2",
  2: "T3",
  3: "T4",
  4: "T5",
  5: "T6",
  6: "T7",
};

/**
 * Ngày HÔM NAY **theo giờ VN**, trả về `Date` ở 00:00 GIỜ MÁY (local) — dùng làm mốc cho
 * matcher của calendar picker, VD `disabled={{ before: todayVNAsLocalDate() }}` để chặn chọn
 * ngày quá khứ.
 *
 * Vì sao KHÔNG dùng `toVNStartOfDay(todayVN())`: hàm đó trả **instant** 00:00 giờ VN — máy
 * client ở timezone khác sẽ thấy nó rơi vào ngày local khác, lệch mốc so với `selected` (vốn
 * dựng bằng {@link parseYMDToLocalDate}). react-day-picker so sánh theo **local date parts**,
 * nên mốc chặn phải cùng hệ quy chiếu local với `selected`.
 *
 * Vì sao KHÔNG dùng `new Date()`: giá trị đó mang cả giờ/phút hiện tại → matcher `before` có
 * thể loại luôn chính ngày hôm nay.
 *
 * Luôn trả `Date` hợp lệ (không optional như `parseYMDToLocalDate`) vì `todayVN()` bảo đảm
 * format `YYYY-MM-DD` đúng — caller không phải xử lý `undefined`.
 */
export function todayVNAsLocalDate(): Date {
  const today = parseYMDToLocalDate(todayVN());
  // Không thể undefined (todayVN luôn đúng format) — fallback chỉ để thoả type, không phải path thật.
  return today ?? new Date();
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
export function floorTime(date: Date, intervalMinutes = 1): Date {
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
export function ceilTime(date: Date, intervalMinutes = 1): Date {
  const ms = intervalMinutes * 60_000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

// ─────────────────────────────────────────────
// Duration formatting (countdown)
// ─────────────────────────────────────────────

/**
 * Format 1 khoảng thời gian (duration, ms) thành dạng đồng hồ đếm ngược:
 * `mm:ss`, hoặc `h:mm:ss` khi ≥ 1 giờ. Giá trị âm được clamp về `00:00`.
 *
 * Timezone-independent — input là duration, không phải timestamp.
 * Dùng cho countdown UI (draw command center, sales-close timer, v.v.).
 *
 * Ví dụ:
 * - `formatDurationClock(90_000)`    → `"01:30"`
 * - `formatDurationClock(3_723_000)` → `"1:02:03"`
 * - `formatDurationClock(-500)`      → `"00:00"`
 */
export function formatDurationClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ─────────────────────────────────────────────
// Relative time label (tiếng Việt)
// ─────────────────────────────────────────────

/**
 * Tính khoảng cách giữa 1 ISO timestamp và thời điểm hiện tại,
 * trả về chuỗi tiếng Việt dạng ngắn dùng cho timeline, countdown, v.v.
 *
 * Output examples:
 * - "vừa xong"       ← quá khứ < 60 giây
 * - "ngay bây giờ"   ← tương lai < 60 giây
 * - "5ph trước"      ← quá khứ, tính bằng phút
 * - "trong 5ph"      ← tương lai, tính bằng phút
 * - "2h trước"       ← quá khứ, tính bằng giờ
 * - "trong 2h"       ← tương lai, tính bằng giờ
 * - "3ng trước"      ← quá khứ, tính bằng ngày
 * - "trong 3ng"      ← tương lai, tính bằng ngày
 *
 * @param isoDate - ISO 8601 timestamp string.
 * @param now - Thời điểm so sánh. Mặc định = `Date.now()`.
 */
export function calcRelativeTime(isoDate: string, now: number = Date.now()): string {
  const diff = Math.round((new Date(isoDate).getTime() - now) / 1000);
  const abs = Math.abs(diff);
  if (abs < 60) return diff < 0 ? "vừa xong" : "ngay bây giờ";
  if (abs < 3600) {
    const m = Math.round(abs / 60);
    return diff < 0 ? `${m}ph trước` : `trong ${m}ph`;
  }
  if (abs < 86400) {
    const h = Math.round(abs / 3600);
    return diff < 0 ? `${h}h trước` : `trong ${h}h`;
  }
  const d = Math.round(abs / 86400);
  return diff < 0 ? `${d}ng trước` : `trong ${d}ng`;
}

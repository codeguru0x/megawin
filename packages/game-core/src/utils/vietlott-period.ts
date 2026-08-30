/**
 * Game Core – Vietlott Period Suggestion (hàm toán thuần, KHÔNG I/O)
 *
 * Suy mã kỳ Vietlott (`vietlottRef.drawPeriod`) cho một kỳ đích, dựa trên một neo
 * `{ ngày quay, giờ quay, mã kỳ }` của MỘT kỳ bất kỳ (không bắt buộc kỳ đầu ngày).
 *
 * Thiết kế đầy đủ + lý do quyết định: xem
 * `.cursor/plans/vietlott-period-suggestion/00-overview.md` §4.
 *
 * ⚠️ QUY TẮC BẮT BUỘC (P0.0.1): file này KHÔNG import bất kỳ `DEFAULT_*_CONFIG` nào.
 * Lịch quay (`VietlottDrawSchedule`) chỉ vào qua tham số — caller PHẢI dựng nó từ
 * `GlobalConfigDoc` đọc từ DB (qua `GetGlobalConfigUseCase`), không phải từ default
 * code. Fallback về default là cái bẫy đã xảy ra thật (xem overview P0.0.1) — file
 * thiếu import `DEFAULT_*` là bằng chứng tĩnh cho việc không có fallback ngầm.
 */

import { addDays, dayOfWeek, formatVN, formatVNDate, parseHHMMToMinutes, toVNDate } from "@megawin/shared/utils";

import type { VietlottPeriodAnchor } from "../types/vietlott";
import { computeDrawsPerDay } from "./draw-schedule";

// ─────────────────────────────────────────────
// Schedule model — phủ cả 3 kiểu lịch (overview §4.1)
// ─────────────────────────────────────────────

/**
 * Phân loại lịch quay — chỉ 2 hình dạng dữ liệu dù overview mô tả 3 kiểu:
 * kiểu C (theo thứ trong tuần) = kiểu B (giờ cố định) + filter ngày quay, nên dùng
 * chung 1 shape `FixedTimes`, khác nhau ở có/không có `drawDaysOfWeek`.
 */
export const VietlottScheduleKind = {
  /** Kiểu A — lưới đều trong ngày (Keno, Bingo18): `firstDrawTime + k×interval`. */
  Grid: "grid",
  /** Kiểu B/C — danh sách giờ quay cố định, có thể giới hạn theo thứ trong tuần. */
  FixedTimes: "fixed_times",
} as const;
export type VietlottScheduleKind = (typeof VietlottScheduleKind)[keyof typeof VietlottScheduleKind];

/** Lịch kiểu A — Keno, Bingo18. */
export interface VietlottGridSchedule {
  kind: typeof VietlottScheduleKind.Grid;
  /** Giờ quay đầu ngày, "HH:mm". */
  firstDrawTime: string;
  /** Giờ quay cuối ngày, "HH:mm". */
  lastDrawTime: string;
  /** Khoảng cách giữa 2 kỳ liên tiếp (phút). */
  intervalMinutes: number;
}

/**
 * Lịch kiểu B/C — Lotto535 (mọi ngày) hoặc Mega645/Power655/Max3D/Max3DPro (theo thứ).
 *
 * Kiểu C = kiểu B + `drawDaysOfWeek`. KHÔNG hardcode `slotsPerDay = drawTimes.length`
 * ở call site cho kiểu C — số giờ quay/ngày là DỮ LIỆU config, có thể đổi (P4).
 */
export interface VietlottFixedTimesSchedule {
  kind: typeof VietlottScheduleKind.FixedTimes;
  /** Danh sách giờ quay trong ngày quay, "HH:mm"[] — không cần sort trước, hàm tự sort. */
  drawTimes: string[];
  /**
   * Thứ trong tuần được quay, `0`=Chủ Nhật … `6`=Thứ Bảy (theo `Date.getUTCDay()`).
   * `undefined` hoặc rỗng = quay MỌI ngày (kiểu B, ví dụ Lotto535).
   */
  drawDaysOfWeek?: number[];
}

/** Lịch quay — union 2 shape, đủ phủ cả 3 kiểu ở overview §4.1. */
export type VietlottDrawSchedule = VietlottGridSchedule | VietlottFixedTimesSchedule;

// ─────────────────────────────────────────────
// Lý do không suy được — const object as const (code-quality §5.3)
// ─────────────────────────────────────────────

/** Lý do `suggestVietlottPeriod` trả `null` — mỗi giá trị ứng với 1 thông báo UI riêng (overview §7.1). */
export const VietlottSuggestionUnavailableReason = {
  /** Config game chưa có `vietlott` (neo). */
  NoAnchor: "no_anchor",
  /** `drawDate` của kỳ đích nhỏ hơn `anchorDrawDate` — neo không suy ngược được. */
  BeforeAnchorDate: "before_anchor_date",
  /** Giờ quay của kỳ đích không nằm trên lịch chuẩn (thường do sửa giờ quay tay). */
  OffGrid: "off_grid",
  /** Giờ quay của CHÍNH neo không còn khớp lịch hiện tại — lịch đã đổi sau khi neo được nhập. */
  ScheduleChangedSinceAnchor: "schedule_changed_since_anchor",
} as const;

export type VietlottSuggestionUnavailableReason =
  (typeof VietlottSuggestionUnavailableReason)[keyof typeof VietlottSuggestionUnavailableReason];

// ─────────────────────────────────────────────
// Bắc cầu qua ngày (đếm ngày quay) — dùng cho kiểu C
// ─────────────────────────────────────────────

/** Cộng `days` ngày vào 1 chuỗi "YYYY-MM-DD", trả chuỗi mới cùng format. */
function addDaysStr(dateStr: string, days: number): string {
  return formatVNDate(addDays(toVNDate(dateStr, "00:00"), days));
}

// ─────────────────────────────────────────────
// slotsPerDay / slotIndexInDay — mô hình lịch chung (P0.3)
// ─────────────────────────────────────────────

/**
 * Số kỳ quay trong 1 ngày theo lịch. Trả `0` nếu ngày đó KHÔNG quay (kiểu C, ngày
 * không thuộc `drawDaysOfWeek`).
 */
export function slotsPerDay(dateStr: string, schedule: VietlottDrawSchedule): number {
  if (schedule.kind === VietlottScheduleKind.Grid) {
    return computeDrawsPerDay(schedule.firstDrawTime, schedule.lastDrawTime, schedule.intervalMinutes) ?? 0;
  }

  if (schedule.drawDaysOfWeek && schedule.drawDaysOfWeek.length > 0) {
    if (!schedule.drawDaysOfWeek.includes(dayOfWeek(dateStr))) {
      return 0;
    }
  }

  return schedule.drawTimes.length;
}

/**
 * Vị trí (1-based) của kỳ quay trong ngày, suy từ giờ quay + lịch. `null` khi giờ
 * quay không nằm trên lịch chuẩn (lệch lưới kiểu A, hoặc không khớp `drawTimes`
 * kiểu B/C, hoặc rơi vào ngày không quay ở kiểu C) — KHÔNG làm tròn.
 */
export function slotIndexInDay(drawTimeStr: string, dateStr: string, schedule: VietlottDrawSchedule): number | null {
  if (schedule.kind === VietlottScheduleKind.Grid) {
    const drawMinutes = parseHHMMToMinutes(drawTimeStr);
    const firstMinutes = parseHHMMToMinutes(schedule.firstDrawTime);
    const lastMinutes = parseHHMMToMinutes(schedule.lastDrawTime);
    if (drawMinutes === null || firstMinutes === null || lastMinutes === null || schedule.intervalMinutes <= 0) {
      return null;
    }
    if (drawMinutes < firstMinutes || drawMinutes > lastMinutes) {
      return null;
    }
    const diff = drawMinutes - firstMinutes;
    if (diff % schedule.intervalMinutes !== 0) {
      return null;
    }
    return diff / schedule.intervalMinutes + 1;
  }

  if (schedule.drawDaysOfWeek && schedule.drawDaysOfWeek.length > 0) {
    if (!schedule.drawDaysOfWeek.includes(dayOfWeek(dateStr))) {
      return null;
    }
  }

  const sortedTimes = [...schedule.drawTimes].sort();
  const idx = sortedTimes.indexOf(drawTimeStr);
  return idx === -1 ? null : idx + 1;
}

/** Vị trí (1-based) của kỳ quay trong ngày, suy trực tiếp từ `Date` (giờ VN) + lịch. */
export function calcSlotIndex(drawTime: Date, schedule: VietlottDrawSchedule): number | null {
  const dateStr = formatVNDate(drawTime);
  const timeStr = formatVN(drawTime, "HH:mm");
  return slotIndexInDay(timeStr, dateStr, schedule);
}

// ─────────────────────────────────────────────
// suggestVietlottPeriod — hàm chính (P0.4)
// ─────────────────────────────────────────────

export interface SuggestVietlottPeriodInput {
  /** Kỳ cần suy mã Vietlott. */
  target: {
    /** Ngày quay, "YYYY-MM-DD". */
    drawDate: string;
    /** Giờ quay đầy đủ (Date) — dùng để suy `slotIndex` qua giờ VN. */
    drawTime: Date;
  };
  /** Neo — `undefined` nghĩa là game chưa cấu hình (chưa bật gợi ý). */
  anchor: VietlottPeriodAnchor | undefined;
  /** Lịch quay — LUÔN dựng từ `GlobalConfigDoc` đọc từ DB, KHÔNG từ `DEFAULT_*_CONFIG`. */
  schedule: VietlottDrawSchedule;
}

export interface SuggestVietlottPeriodResult {
  /** Mã kỳ suy được, giữ zero-pad theo độ rộng của `anchor.anchorPeriod`. `null` nếu không suy được. */
  suggestedPeriod: string | null;
  /** Lý do khi `suggestedPeriod` là `null` — dùng để UI hiện đúng thông báo (overview §7.1). */
  reason: VietlottSuggestionUnavailableReason | null;
}

/**
 * Suy mã kỳ Vietlott từ neo KỲ BẤT KỲ (không phải kỳ đầu ngày — overview §4.0).
 *
 * Công thức: `period = anchorPeriod + slotsGiữa(neo → đích)`, với số slot giữa 2 kỳ
 * tính bằng slot còn lại trong ngày neo (sau vị trí neo) + tổng slot các ngày nằm
 * giữa + vị trí kỳ đích trong ngày đích. Cho phép delta ÂM khi kỳ đích cùng ngày
 * nhưng đứng TRƯỚC neo (neo không bắt buộc là kỳ đầu ngày).
 *
 * KHÔNG I/O — hàm thuần, an toàn gọi trực tiếp từ use-case sau khi caller đã tự đọc
 * config DB và dựng `schedule`/`anchor`.
 */
export function suggestVietlottPeriod(input: SuggestVietlottPeriodInput): SuggestVietlottPeriodResult {
  const { target, anchor, schedule } = input;

  if (!anchor) {
    return { suggestedPeriod: null, reason: VietlottSuggestionUnavailableReason.NoAnchor };
  }

  // Kỳ đích trước ngày neo → không suy ngược qua ranh giới ngày (overview §7.1).
  // So sánh string "YYYY-MM-DD" hợp lệ vì zero-padded, cùng độ dài.
  if (target.drawDate < anchor.anchorDrawDate) {
    return { suggestedPeriod: null, reason: VietlottSuggestionUnavailableReason.BeforeAnchorDate };
  }

  const anchorSlot = slotIndexInDay(anchor.anchorDrawTime, anchor.anchorDrawDate, schedule);
  if (anchorSlot === null) {
    // Neo không nằm trên lịch HIỆN TẠI → lịch đã đổi sau khi neo được nhập, hoặc
    // staff nhập sai giờ quay lúc cấu hình neo. KHÔNG suy tiếp — staff phải cập nhật neo.
    return { suggestedPeriod: null, reason: VietlottSuggestionUnavailableReason.ScheduleChangedSinceAnchor };
  }

  const targetSlot = calcSlotIndex(target.drawTime, schedule);
  if (targetSlot === null) {
    return { suggestedPeriod: null, reason: VietlottSuggestionUnavailableReason.OffGrid };
  }

  let delta: number;
  if (target.drawDate === anchor.anchorDrawDate) {
    delta = targetSlot - anchorSlot;
  } else {
    // Slot còn lại trong ngày neo (sau vị trí neo) + slot các ngày nằm giữa (không
    // tính ngày neo, không tính ngày đích) + vị trí kỳ đích trong ngày đích.
    let sum = slotsPerDay(anchor.anchorDrawDate, schedule) - anchorSlot;
    let cursor = addDaysStr(anchor.anchorDrawDate, 1);
    while (cursor < target.drawDate) {
      sum += slotsPerDay(cursor, schedule);
      cursor = addDaysStr(cursor, 1);
    }
    delta = sum + targetSlot;
  }

  const anchorPeriodNum = Number(anchor.anchorPeriod);
  if (!Number.isFinite(anchorPeriodNum)) {
    return { suggestedPeriod: null, reason: VietlottSuggestionUnavailableReason.NoAnchor };
  }

  const periodNum = anchorPeriodNum + delta;
  if (periodNum < 0) {
    return { suggestedPeriod: null, reason: VietlottSuggestionUnavailableReason.BeforeAnchorDate };
  }

  // Giữ zero-pad theo độ rộng của anchorPeriod — số lớn hơn độ rộng gốc được phép
  // "mọc" thêm chữ số (padStart không cắt), số nhỏ hơn giữ đủ số 0 phía trước.
  const width = anchor.anchorPeriod.length;
  return { suggestedPeriod: String(periodNum).padStart(width, "0"), reason: null };
}

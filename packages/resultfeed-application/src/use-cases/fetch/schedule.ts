/**
 * ResultFeed – Fetch Schedule (giờ quay cố định)
 *
 * `05-lotto535-and-schedule.plan.md §2`. Game liên tục (Keno, Bingo18 — quay mỗi vài phút)
 * và game giờ quay CỐ ĐỊNH (Lotto535 quay 13:00+21:00 mọi ngày; Power655/Mega645 quay 1
 * giờ cố định, chỉ vài ngày/tuần) cần cách tính `nextFetchAt` khác nhau ở nhánh THÀNH CÔNG:
 * game liên tục cứ `minIntervalMs` poll tiếp; game giờ quay cố định nên nhảy THẲNG tới giờ
 * quay kế tiếp — không cần poll đều suốt ngày cho một kết quả chỉ đổi 1-2 lần/ngày.
 *
 * Nhánh lỗi/`unavailable`/backoff KHÔNG dùng type này — vẫn `minIntervalMs`-based như cũ
 * (site có thể publish muộn hơn giờ quay lý thuyết, phải tiếp tục poll tới khi bắt kịp).
 *
 * Mirror đúng shape `VietlottFixedTimesSchedule` (`@megawin/game-core/utils/vietlott-period`)
 * — KHÔNG import thẳng, vì `resultfeed*` bị cấm import `@megawin/game-*` (boundary lint,
 * `00-overview.md` §6). Chỉ tái dùng `dayOfWeek()`/`toVNDate()` từ `@megawin/shared/utils`
 * (package trung lập, không thuộc domain `game-*`).
 *
 * ## BUG ĐÃ SỬA (2026-09, vòng 2) — nhảy lịch tính từ "now" bỏ sót kỳ ĐÃ công bố
 *
 * `computeNextFetchAt(schedule, now, ...)` dò slot lịch cố định kế tiếp tính từ THỜI ĐIỂM
 * GỌI (`now`) — đúng khi tick chạy ĐÚNG NHỊP lịch (now ≈ giờ quay của kỳ vừa xác nhận). SAI
 * khi tick xác nhận kỳ đó chạy TRỄ hơn giờ quay lý thuyết của CHÍNH kỳ đó — dù không phải do
 * lỗi thật (VD chờ "chưa có kết quả" — `recordUnavailable` — lặp lại nhiều giờ/ngày, KHÔNG
 * set `needsBackfill`, xem `fetch-and-parse.ts`). Nếu độ trễ đó đã vượt qua CẢ slot lý
 * thuyết của kỳ KẾ TIẾP, `computeNextFetchAt(now)` bỏ qua đúng slot đó (đã ở quá khứ so với
 * `now`) và nhảy tới slot xa hơn — trong khi kỳ kế tiếp rất có thể ĐÃ được site công bố từ
 * trước. Ví dụ thật: kỳ vừa xác nhận quay Thứ Bảy nhưng tick chỉ chạy được tới Thứ Tư tuần
 * sau (trễ do chờ unavailable) → `computeNextFetchAt(now=Thứ Tư)` nhảy tới Thứ Năm KẾ TIẾP,
 * bỏ qua đúng slot Thứ Ba đã trôi qua — trong khi kỳ Thứ Ba đó đã có kết quả từ lâu.
 *
 * Fix: {@link computeNextFetchAtAfterConfirm} dò slot tính từ NGÀY QUAY của kỳ vừa xác nhận
 * (`confirmedDrawDate`, lấy từ `parsed.drawDateSource`), không phải từ `now`. Slot tìm được
 * mà đã ở QUÁ KHỨ so với `now` (đang trễ so với lịch) ⇒ trả về mốc GẦN (`minIntervalMs`-based)
 * để tick kế tiếp kiểm tra ngay — không nhảy tới slot xa hơn. Slot đó còn ở tương lai (đúng
 * nhịp) ⇒ giữ hành vi cũ, đợi tới đúng giờ quay. `computeNextFetchAt` (tính từ `now`) giữ lại
 * cho mục đích khác cần "slot kế tiếp kể từ bây giờ" (VD tooling vận hành).
 */

import { addDays, dayOfWeek, formatVNDate, toVNDate, toVNEndOfDay } from "@megawin/shared/utils";

/** ±{@link FIXED_SCHEDULE_JITTER_MS} quanh giờ quay — tránh gọi đúng giây quay, né dấu hiệu bot. */
const FIXED_SCHEDULE_JITTER_MS = 3 * 60 * 1000;
/** Dò tối đa 7 ngày tới — đủ cho mọi lịch quay thực tế (game thưa nhất hiện có: vài ngày/tuần). */
const MAX_LOOKAHEAD_DAYS = 7;

/**
 * Lịch fetch theo game — hằng số khai báo tại code (mỗi Lambda handler tự truyền vào
 * `FetchAndParseDeps.schedule`), KHÔNG lưu DB (không phải data vận hành đổi qua backoffice,
 * giống cách `gameKey`/`sourceId` hiện đang khai cứng ở handler).
 */
export type GameFetchSchedule =
  | { type: "continuous" }
  | {
      type: "fixed";
      /** "HH:mm" giờ VN — không cần sort trước, `computeNextFetchAt` tự sort. */
      drawTimesVn: string[];
      /** `0`=Chủ Nhật…`6`=Thứ Bảy (`dayOfWeek()`). Rỗng/không set = quay MỌI ngày. */
      drawDaysOfWeek?: number[];
    };

/** `Date.now() + baseMs` cộng jitter ngẫu nhiên trong khoảng `[-jitterMs, +jitterMs]`. */
function withJitter(base: Date, jitterMs: number): Date {
  const offset = Math.round((Math.random() * 2 - 1) * jitterMs);
  return new Date(base.getTime() + offset);
}

/**
 * Lõi dò slot lịch cố định — tìm mốc GẦN NHẤT trong `schedule.drawTimesVn` (đã sort)
 * STRICTLY sau `after`, dò tối đa {@link MAX_LOOKAHEAD_DAYS} ngày tới (giờ VN); ngày nào có
 * `drawDaysOfWeek` mà không khớp `dayOfWeek(dateStr)` thì bỏ qua. `null` = không tìm được
 * mốc nào trong phạm vi dò (lịch rỗng — lỗi cấu hình).
 *
 * Tách riêng khỏi {@link computeNextFetchAt}/{@link computeNextFetchAtAfterConfirm} để 2 nơi
 * gọi (dò từ `now` vs dò từ ngày kỳ vừa xác nhận) dùng CHUNG một logic dò ngày/giờ — tránh
 * lệch nhau khi 1 bên sửa mà quên bên kia.
 */
function findNextFixedSlotAfter(
  schedule: { drawTimesVn: string[]; drawDaysOfWeek?: number[] },
  after: Date,
): Date | null {
  const sortedTimes = [...schedule.drawTimesVn].sort();
  const daysFilter = schedule.drawDaysOfWeek;

  for (let dayOffset = 0; dayOffset <= MAX_LOOKAHEAD_DAYS; dayOffset++) {
    const candidateDateStr = formatVNDate(addDays(after, dayOffset));
    if (daysFilter && daysFilter.length > 0 && !daysFilter.includes(dayOfWeek(candidateDateStr))) {
      continue;
    }
    for (const timeVn of sortedTimes) {
      const candidate = toVNDate(candidateDateStr, timeVn);
      if (candidate.getTime() > after.getTime()) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Tính `nextFetchAt` kiểu "slot kế tiếp KỂ TỪ BÂY GIỜ" — dùng cho tooling/ops cần biết mốc
 * quay gần nhất từ thời điểm gọi, KHÔNG dùng cho nhánh THÀNH CÔNG của pipeline (xem
 * {@link computeNextFetchAtAfterConfirm} — lý do tách ở JSDoc đầu file mục "BUG ĐÃ SỬA").
 *
 * - `continuous` → `now + minIntervalMs` ± jitter 20% (Keno, Bingo18).
 * - `fixed` → {@link findNextFixedSlotAfter} tính từ `now`, cộng jitter
 *   {@link FIXED_SCHEDULE_JITTER_MS}. Không tìm được mốc nào (lịch rỗng) → fallback
 *   `now + minIntervalMs` để KHÔNG bao giờ trả về mốc undefined/hot-loop.
 */
export function computeNextFetchAt(schedule: GameFetchSchedule, now: Date, minIntervalMs: number): Date {
  if (schedule.type === "continuous") {
    return withJitter(new Date(now.getTime() + minIntervalMs), minIntervalMs * 0.2);
  }

  const nextSlot = findNextFixedSlotAfter(schedule, now);
  if (nextSlot === null) {
    // Lịch rỗng (drawTimesVn = [] hoặc drawDaysOfWeek loại hết mọi ngày trong 7 ngày tới) —
    // lỗi cấu hình, không phải trạng thái vận hành bình thường. Fallback an toàn để không
    // bao giờ trả về mốc không hợp lệ / gây hot-loop.
    return withJitter(new Date(now.getTime() + minIntervalMs), minIntervalMs * 0.2);
  }
  return withJitter(nextSlot, FIXED_SCHEDULE_JITTER_MS);
}

/**
 * Tính `nextFetchAt` cho nhánh THÀNH CÔNG (bước 9 pipeline `fetch-and-parse.ts`, cả đường
 * bình thường và đường self-heal `period_gap`) — dò slot kế tiếp tính từ NGÀY QUAY của kỳ
 * VỪA XÁC NHẬN (`confirmedDrawDate`, `parsed.drawDateSource`, format `YYYY-MM-DD`), KHÔNG
 * phải từ `now`. Xem JSDoc đầu file mục "BUG ĐÃ SỬA (2026-09, vòng 2)" để biết lý do
 * `computeNextFetchAt(now)` sai trong trường hợp tick chạy trễ hơn giờ quay lý thuyết.
 *
 * - `continuous` → không có khái niệm "ngày quay cố định", hành vi giống
 *   {@link computeNextFetchAt}: `now + minIntervalMs` ± jitter 20%.
 * - `fixed` → trước tiên dò {@link findNextFixedSlotAfter} tính từ CUỐI NGÀY (23:59:59.999
 *   giờ VN) của `confirmedDrawDate` — tức slot SỚM NHẤT ở ngày SAU `confirmedDrawDate` (bỏ
 *   qua toàn bộ slot CÙNG ngày — không thể biết kỳ vừa xác nhận là slot nào trong ngày khi
 *   game có nhiều giờ quay/ngày như Lotto535 (13:00+21:00), vì `drawTimeSource` luôn `null`):
 *   - Slot đó ĐÃ ở QUÁ KHỨ so với `now` (nghĩa là tick đang trễ hơn ÍT NHẤT 1 ngày lịch so với
 *     `confirmedDrawDate` — dù có nhiều slot/ngày hay không, mốc "ngày sau" vẫn phải nằm ở
 *     tương lai nếu tick không trễ) ⇒ trả mốc GẦN (`now + minIntervalMs` ± jitter 20%) để tick
 *     kế tiếp kiểm tra lại NGAY — có kỳ rất có thể đã được site công bố mà chưa fetch tới,
 *     không nên nhảy tới slot xa hơn (đây là fix cho bug ở trên).
 *   - Slot đó còn ở TƯƠNG LAI (không trễ theo ngày, kể cả game có nhiều slot/ngày — trường
 *     hợp Lotto535 vừa xác nhận slot 13:00, còn slot 21:00 CÙNG ngày chưa xác nhận) ⇒ fallback
 *     {@link computeNextFetchAt} tính từ `now` như hành vi cũ — ĐÚNG trong trường hợp này vì
 *     `now` ≈ giờ quay của kỳ vừa xác nhận, `computeNextFetchAt(now)` tự tìm đúng slot 21:00
 *     cùng ngày (hoặc slot ngày kế tiếp nếu không còn slot nào trong ngày).
 */
export function computeNextFetchAtAfterConfirm(
  schedule: GameFetchSchedule,
  confirmedDrawDate: string,
  now: Date,
  minIntervalMs: number,
): Date {
  if (schedule.type === "continuous") {
    return withJitter(new Date(now.getTime() + minIntervalMs), minIntervalMs * 0.2);
  }

  const nextCalendarDaySlot = findNextFixedSlotAfter(schedule, toVNEndOfDay(confirmedDrawDate));
  if (nextCalendarDaySlot !== null && nextCalendarDaySlot.getTime() <= now.getTime()) {
    return withJitter(new Date(now.getTime() + minIntervalMs), minIntervalMs * 0.2);
  }
  return computeNextFetchAt(schedule, now, minIntervalMs);
}

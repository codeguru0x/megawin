/**
 * ResultFeed – Fetch Schedule (giờ quay cố định)
 *
 * `05-lotto535-and-schedule.plan.md §2`. Game liên tục (Keno, Bingo18 — quay mỗi vài phút)
 * và game giờ quay CỐ ĐỊNH (Lotto535 quay 13:00+21:00 mọi ngày; Power655/Mega645 quay 1
 * giờ cố định, chỉ vài ngày/tuần) cần cách tính `nextFetchAt` khác nhau ở nhánh THÀNH CÔNG:
 * game liên tục cứ `minIntervalMs` poll tiếp; game giờ quay cố định nên nhảy THẲNG tới giờ
 * quay kế tiếp — không cần poll đều suốt ngày cho một kết quả chỉ đổi 1-2 lần/ngày.
 *
 * Nhánh lỗi/backoff (`recordFailure`) KHÔNG dùng type này — vẫn `minIntervalMs`-based như cũ
 * (site có thể publish muộn hơn giờ quay lý thuyết, phải tiếp tục poll tới khi bắt kịp).
 * Nhánh `unavailable` (`recordUnavailable`) CŨNG giữ nguyên `minIntervalMs`-based cho
 * `continuous`/`fixed`, nhưng có xử lý RIÊNG cho `continuous-daily-window` — xem
 * {@link computeNextFetchAtOnUnavailable} + mục "GIÃN NHỊP QUA ĐÊM" dưới.
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
 *
 * ## GIÃN NHỊP QUA ĐÊM (2026-09) — `continuous-daily-window` (Keno, Bingo18)
 *
 * Keno/Bingo18 quay LIÊN TỤC (Keno 8 phút/kỳ, Bingo18 6 phút/kỳ) nhưng CHỈ trong giờ hoạt
 * động của Vietlott (Keno 06:08–21:52, Bingo18 06:06–21:53) — trước đây khai `type:
 * "continuous"` thuần, không có khái niệm giờ trong ngày. Hệ quả: sau kỳ cuối ngày, mỗi
 * lần request nhận "chưa có kết quả" (`ResultUnavailableError`) đều được `recordUnavailable`
 * đặt `nextFetchAt` = `now + minIntervalMs` — GIỐNG HỆT nhịp ban ngày — nên worker tiếp tục
 * gọi Vietlott đều đặn suốt ~8 giờ đêm (tới kỳ đầu ngày mới) mà không có gì để lấy, tốn
 * request vô ích. `fixed` (Lotto535...) không bị vấn đề này vì `computeNextFetchAtAfterConfirm`
 * đã nhảy `nextFetchAt` thẳng tới giờ quay kế tiếp ở nhánh THÀNH CÔNG — cursor "ngủ yên" giữa
 * 2 kỳ, nhánh unavailable chỉ chạy trong vài phút quanh đúng giờ quay. Keno/Bingo18 quay liên
 * tục suốt ngày nên không thể áp dụng cách đó cho nhánh thành công — phải xử lý riêng ở
 * nhánh KHÔNG thành công (`unavailable`), qua {@link computeNextFetchAtOnUnavailable}.
 *
 * 1 chu kỳ ngày (giờ VN) chia 4 giai đoạn theo đồng hồ tường:
 *
 *   1. **VÙNG HOẠT ĐỘNG** `[firstDrawVn - drawIntervalMs, lastDrawVn + drawIntervalMs]` —
 *      nhịp `minIntervalMs` như cũ, KHÔNG đổi gì. Biên nới ra thêm 1 chu kỳ quay THẬT mỗi
 *      đầu (không dùng đúng `firstDrawVn`/`lastDrawVn` làm biên) — vd Bingo18 (chu kỳ 6
 *      phút): vùng hoạt động thực tế = 06:00–21:59, không phải 06:06–21:53. Lý do nới ra:
 *      đây chính là cách đảm bảo "lấy chưa xong kỳ cuối vẫn phải lấy cho xong mới giãn
 *      nhịp" — hễ còn trong vùng này (dù đang giữa ngày, hay do kỳ cuối trễ vài phút so với
 *      giờ lý thuyết `lastDrawVn`), nhịp KHÔNG đổi, cứ đuổi theo `minIntervalMs` tới khi lấy
 *      được. Chỉ khi ĐÃ qua cả biên nới rộng này mới coi là "chắc chắn hết ngày".
 *   2. **ĐỆM CHỜ** — ngay sau khi vùng hoạt động đóng, kéo dài `bufferDurationMs` (mặc định
 *      30 phút): nhịp `bufferIntervalMs` (mặc định 3 phút) — chậm hơn ban ngày nhưng vẫn đủ
 *      nhanh để bắt kịp trong vài phút nếu site publish trễ kỳ cuối NHIỀU hơn 1 chu kỳ (hiếm,
 *      giai đoạn 1 đã che hầu hết trường hợp trễ thông thường). Siết chặt (3 phút, không phải
 *      5-10 phút) vì kỳ CUỐI NGÀY không có "kỳ sau" để đối chiếu nếu bị bỏ lỡ.
 *   3. **NGHỈ ĐÊM** — hết đệm chờ, chưa tới cutoff: nhịp `nightIntervalMs` (mặc định 30
 *      phút) — phần lớn thời gian qua đêm nằm ở giai đoạn này.
 *   4. **CUTOFF** — mốc tính ra ở giai đoạn 2/3 mà rơi TỪ đầu vùng hoạt động NGÀY KẾ TIẾP
 *      trở đi ⇒ CHẶN TRẦN đúng bằng đầu vùng hoạt động đó (`firstDrawVn - drawIntervalMs`
 *      ngày mai), KHÔNG jitter thêm — tick "nghỉ đêm" cuối cùng luôn tỉnh ĐÚNG lúc, không
 *      trễ hơn, để không bỏ lỡ kỳ đầu ngày mới. Từ đó trở đi worker lại request đều — cursor
 *      tự rơi về giai đoạn 1 (vùng hoạt động) ở tick kế tiếp.
 */

import { addDays, dayOfWeek, formatVNDate, toVNDate, toVNEndOfDay } from "@megawin/shared/utils";

/** ±{@link FIXED_SCHEDULE_JITTER_MS} quanh giờ quay — tránh gọi đúng giây quay, né dấu hiệu bot. */
const FIXED_SCHEDULE_JITTER_MS = 3 * 60 * 1000;
/** Dò tối đa 7 ngày tới — đủ cho mọi lịch quay thực tế (game thưa nhất hiện có: vài ngày/tuần). */
const MAX_LOOKAHEAD_DAYS = 7;
/** ±20% quanh nhịp — dùng chung cho mọi nhánh `continuous`/`continuous-daily-window` (Keno, Bingo18). */
const CONTINUOUS_JITTER_RATIO = 0.2;
/**
 * Nhịp "đệm chờ" mặc định (giai đoạn 2, sau khi vùng hoạt động đóng) — 3 phút/lần.
 *
 * Chậm hơn nhịp ban ngày (`minIntervalMs`, thường 2 phút) nhưng vẫn đủ nhanh để bắt kịp
 * trong vài phút nếu site publish kỳ cuối TRỄ hơn mức vùng hoạt động đã nới ra (1 chu kỳ
 * quay thật — giai đoạn 1 đã che hầu hết trường hợp trễ thông thường, giai đoạn này chỉ xử
 * lý phần trễ NHIỀU hơn bình thường, hiếm gặp).
 *
 * 3 phút (không phải 5-10 phút như bàn ban đầu) — SIẾT LẠI sau khi phân tích worst-case:
 * kỳ CUỐI NGÀY là kỳ duy nhất không có "kỳ sau" để đối chiếu nếu bị bỏ lỡ (khác kỳ giữa
 * ngày, lỡ trễ vẫn còn kỳ kế tiếp), nên ưu tiên bắt sát ngay khi vừa vượt biên vùng hoạt
 * động hơn là tiết kiệm vài request. Chỉ dùng khi `GameFetchSchedule.bufferIntervalMs`
 * không được set ở handler.
 */
const DEFAULT_BUFFER_INTERVAL_MS = 3 * 60 * 1000;

/**
 * Thời gian áp dụng nhịp đệm mặc định — 30 phút, tính từ lúc vùng hoạt động đóng
 * ({@link dailyActiveWindow}`.end`).
 *
 * Hết 30 phút này mà vẫn "chưa có kết quả" thì coi như CHẮC CHẮN ngày đã kết thúc thật
 * (không còn khả năng site publish trễ) ⇒ chuyển sang nhịp nghỉ đêm ({@link
 * DEFAULT_NIGHT_INTERVAL_MS}) để tiết kiệm request cho phần lớn thời gian còn lại của đêm.
 * 30 phút là đủ RỘNG để bắt được trường hợp site trễ bất thường (chậm hơn nhiều so với vài
 * phút thông thường — vùng hoạt động đã nới 1 chu kỳ quay, đệm chờ 30 phút nữa là biên rất
 * rộng), nhưng vẫn đủ HẸP để không kéo dài nhịp nhanh (3 phút/lần) vô ích suốt cả đêm. Chỉ
 * dùng khi `GameFetchSchedule.bufferDurationMs` không được set ở handler.
 */
const DEFAULT_BUFFER_DURATION_MS = 30 * 60 * 1000;

/**
 * Nhịp "nghỉ đêm" mặc định (giai đoạn 3, sau khi hết đệm chờ) — 30 phút/lần.
 *
 * Áp dụng cho PHẦN LỚN thời gian qua đêm (từ sau {@link DEFAULT_BUFFER_DURATION_MS} tới trước
 * giờ mở vùng hoạt động ngày mới) — nhịp CHẬM NHẤT trong 3 giai đoạn vì đây là lúc chắc chắn
 * không còn gì để lấy, chỉ còn việc "canh giờ" để tỉnh lại đúng lúc ({@link
 * computeNextFetchAtOnUnavailable} giai đoạn 4 — CUTOFF luôn chặn trần đúng giờ mở, không bao
 * giờ trễ hơn dù nhịp 30 phút). Chỉ dùng khi `GameFetchSchedule.nightIntervalMs` không được
 * set ở handler.
 */
const DEFAULT_NIGHT_INTERVAL_MS = 30 * 60 * 1000;

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
    }
  | {
      /**
       * Quay LIÊN TỤC nhưng chỉ trong giờ hoạt động của Vietlott mỗi ngày (Keno, Bingo18) —
       * khác `continuous` thuần ở nhánh `unavailable`: có night-mode giãn nhịp qua đêm, xem
       * {@link computeNextFetchAtOnUnavailable} + JSDoc đầu file mục "GIÃN NHỊP QUA ĐÊM".
       */
      type: "continuous-daily-window";
      /** "HH:mm" giờ VN — giờ quay LÝ THUYẾT của kỳ ĐẦU mỗi ngày (Keno "06:08", Bingo18 "06:06"). */
      firstDrawVn: string;
      /** "HH:mm" giờ VN — giờ quay LÝ THUYẾT của kỳ CUỐI mỗi ngày (Keno "21:52", Bingo18 "21:53"). */
      lastDrawVn: string;
      /**
       * Chu kỳ quay THẬT (ms) — Keno 8 phút, Bingo18 6 phút. Dùng để nới "vùng hoạt động"
       * ra thêm ĐÚNG 1 chu kỳ ở MỖI ĐẦU: vùng hoạt động thực tế = `[firstDrawVn -
       * drawIntervalMs, lastDrawVn + drawIntervalMs]` — KHÔNG dùng đúng `firstDrawVn`/
       * `lastDrawVn` làm biên, để không giãn nhịp oan khi kỳ đầu/cuối xê dịch vài phút
       * quanh giờ lý thuyết (xem JSDoc đầu file).
       */
      drawIntervalMs: number;
      /** Nhịp "đệm chờ" ngay sau khi vùng hoạt động đóng — mặc định {@link DEFAULT_BUFFER_INTERVAL_MS} (3 phút). */
      bufferIntervalMs?: number;
      /** Thời gian áp dụng nhịp đệm trước khi chuyển hẳn sang nghỉ đêm — mặc định {@link DEFAULT_BUFFER_DURATION_MS} (30 phút). */
      bufferDurationMs?: number;
      /** Nhịp "nghỉ đêm" — mặc định {@link DEFAULT_NIGHT_INTERVAL_MS} (30 phút). */
      nightIntervalMs?: number;
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
 * - `continuous`/`continuous-daily-window` → `now + minIntervalMs` ± jitter 20% (Keno,
 *   Bingo18) — nhánh THÀNH CÔNG của `continuous-daily-window` không phân biệt giờ trong
 *   ngày, giống `continuous` thuần. Xem {@link computeNextFetchAtOnUnavailable} cho night-mode
 *   (chỉ áp dụng ở nhánh `unavailable`).
 * - `fixed` → {@link findNextFixedSlotAfter} tính từ `now`, cộng jitter
 *   {@link FIXED_SCHEDULE_JITTER_MS}. Không tìm được mốc nào (lịch rỗng) → fallback
 *   `now + minIntervalMs` để KHÔNG bao giờ trả về mốc undefined/hot-loop.
 */
export function computeNextFetchAt(schedule: GameFetchSchedule, now: Date, minIntervalMs: number): Date {
  // `continuous-daily-window` KHÔNG có khái niệm "ngày quay cố định" cho nhánh THÀNH CÔNG
  // (Keno/Bingo18 quay liên tục suốt ngày) — hành vi giống `continuous` thuần ở đây; giờ
  // hoạt động/night-mode CHỈ ảnh hưởng nhánh `unavailable`, xem {@link computeNextFetchAtOnUnavailable}.
  if (schedule.type === "continuous" || schedule.type === "continuous-daily-window") {
    return withJitter(new Date(now.getTime() + minIntervalMs), minIntervalMs * CONTINUOUS_JITTER_RATIO);
  }

  const nextSlot = findNextFixedSlotAfter(schedule, now);
  if (nextSlot === null) {
    // Lịch rỗng (drawTimesVn = [] hoặc drawDaysOfWeek loại hết mọi ngày trong 7 ngày tới) —
    // lỗi cấu hình, không phải trạng thái vận hành bình thường. Fallback an toàn để không
    // bao giờ trả về mốc không hợp lệ / gây hot-loop.
    return withJitter(new Date(now.getTime() + minIntervalMs), minIntervalMs * CONTINUOUS_JITTER_RATIO);
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
 * - `continuous`/`continuous-daily-window` → không có khái niệm "ngày quay cố định" cho
 *   nhánh THÀNH CÔNG (quay liên tục suốt ngày), hành vi giống {@link computeNextFetchAt}:
 *   `now + minIntervalMs` ± jitter 20%.
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
  if (schedule.type === "continuous" || schedule.type === "continuous-daily-window") {
    return withJitter(new Date(now.getTime() + minIntervalMs), minIntervalMs * CONTINUOUS_JITTER_RATIO);
  }

  const nextCalendarDaySlot = findNextFixedSlotAfter(schedule, toVNEndOfDay(confirmedDrawDate));
  if (nextCalendarDaySlot !== null && nextCalendarDaySlot.getTime() <= now.getTime()) {
    return withJitter(new Date(now.getTime() + minIntervalMs), minIntervalMs * CONTINUOUS_JITTER_RATIO);
  }
  return computeNextFetchAt(schedule, now, minIntervalMs);
}

/**
 * Vùng hoạt động trong NGÀY chứa `reference` (giờ VN) — `[firstDrawVn - drawIntervalMs,
 * lastDrawVn + drawIntervalMs]`. Nới ra 1 chu kỳ quay thật mỗi đầu so với giờ quay lý
 * thuyết — xem JSDoc field `drawIntervalMs` ở {@link GameFetchSchedule} và mục "GIÃN NHỊP
 * QUA ĐÊM" đầu file.
 */
function dailyActiveWindow(
  schedule: { firstDrawVn: string; lastDrawVn: string; drawIntervalMs: number },
  reference: Date,
): { start: Date; end: Date } {
  const dateStr = formatVNDate(reference);
  const firstDraw = toVNDate(dateStr, schedule.firstDrawVn);
  const lastDraw = toVNDate(dateStr, schedule.lastDrawVn);
  return {
    start: new Date(firstDraw.getTime() - schedule.drawIntervalMs),
    end: new Date(lastDraw.getTime() + schedule.drawIntervalMs),
  };
}

/**
 * `nextFetchAt` cho nhánh `result_unavailable` (bước 5 pipeline `fetch-and-parse.ts`,
 * `recordUnavailable`) — xem mục "GIÃN NHỊP QUA ĐÊM" đầu file cho rationale đầy đủ.
 *
 * - `continuous`/`fixed` → GIỮ NGUYÊN hành vi cũ, `now + minIntervalMs` ± jitter 20%. Lý do
 *   `fixed` không cần night-mode riêng: nhánh THÀNH CÔNG (`computeNextFetchAtAfterConfirm`)
 *   đã nhảy `nextFetchAt` thẳng tới slot kế tiếp, cursor "ngủ yên" giữa 2 kỳ — nhánh
 *   `unavailable` ở đây chỉ chạy trong vài phút quanh đúng giờ quay (catch-up ngắn), không
 *   phải nhiều giờ liền như `continuous-daily-window`.
 * - `continuous-daily-window` (Keno, Bingo18) → 4 giai đoạn theo đồng hồ tường (chi tiết đầy
 *   đủ ở JSDoc đầu file):
 *   1. Còn trong {@link dailyActiveWindow} hôm nay ⇒ `minIntervalMs` như cũ (bảo đảm "lấy
 *      chưa xong kỳ cuối vẫn lấy cho xong mới giãn nhịp" — biên đã nới rộng 1 chu kỳ).
 *   2. Vừa qua vùng hoạt động, còn trong `bufferDurationMs` ⇒ `bufferIntervalMs`.
 *   3. Đã hết đệm chờ ⇒ `nightIntervalMs`.
 *   4. Mốc tính ở (2)/(3) mà ≥ đầu vùng hoạt động NGÀY KẾ TIẾP ⇒ CHẶN TRẦN đúng bằng mốc đó
 *      (không jitter thêm — cần tỉnh ĐÚNG lúc, sớm hơn không sao nhưng trễ hơn là bỏ lỡ kỳ
 *      đầu ngày mới).
 */
export function computeNextFetchAtOnUnavailable(schedule: GameFetchSchedule, now: Date, minIntervalMs: number): Date {
  if (schedule.type !== "continuous-daily-window") {
    return withJitter(new Date(now.getTime() + minIntervalMs), minIntervalMs * CONTINUOUS_JITTER_RATIO);
  }

  const bufferIntervalMs = schedule.bufferIntervalMs ?? DEFAULT_BUFFER_INTERVAL_MS;
  const bufferDurationMs = schedule.bufferDurationMs ?? DEFAULT_BUFFER_DURATION_MS;
  const nightIntervalMs = schedule.nightIntervalMs ?? DEFAULT_NIGHT_INTERVAL_MS;

  const todayWindow = dailyActiveWindow(schedule, now);

  // Giai đoạn 1: còn trong vùng hoạt động (kể cả phần nới rộng trước/sau giờ lý thuyết) —
  // giữ nguyên nhịp nhanh, night-mode hoàn toàn không can thiệp.
  if (now.getTime() >= todayWindow.start.getTime() && now.getTime() <= todayWindow.end.getTime()) {
    return withJitter(new Date(now.getTime() + minIntervalMs), minIntervalMs * CONTINUOUS_JITTER_RATIO);
  }

  // Từ đây `now` nằm NGOÀI vùng hoạt động hôm nay — xác định "cửa vừa đóng" (`closedWindow`,
  // dùng để tính đệm chờ đã trôi bao lâu) và "cửa sắp mở" (`cutoff`, mốc CHẶN TRẦN).
  //
  // `now < todayWindow.start` (hiếm — cold start/deploy vào rạng sáng, TRƯỚC giờ mở hôm nay)
  // ⇒ cửa vừa đóng là của HÔM QUA (`todayWindow` của hôm nay chưa mở, dùng nó tính đệm chờ
  // sẽ SAI — `end` của nó còn ở tương lai), cửa sắp mở là `todayWindow.start` hôm nay.
  //
  // Ngược lại (`now > todayWindow.end`, ca thường gặp — sau khi đóng cửa buổi tối) ⇒ cửa vừa
  // đóng CHÍNH LÀ `todayWindow`, cửa sắp mở là đầu vùng hoạt động NGÀY MAI.
  const isBeforeTodayOpens = now.getTime() < todayWindow.start.getTime();
  const closedWindow = isBeforeTodayOpens ? dailyActiveWindow(schedule, addDays(now, -1)) : todayWindow;
  const cutoff = isBeforeTodayOpens ? todayWindow.start : dailyActiveWindow(schedule, addDays(now, 1)).start;

  const bufferEndsAt = new Date(closedWindow.end.getTime() + bufferDurationMs);
  const isBuffering = now.getTime() <= bufferEndsAt.getTime();
  const baseIntervalMs = isBuffering ? bufferIntervalMs : nightIntervalMs; // Giai đoạn 2 vs 3
  const candidate = new Date(now.getTime() + baseIntervalMs);

  // Giai đoạn 4: CHẶN TRẦN — không bao giờ vượt qua cutoff. Đến trước cutoff mới jitter (rồi
  // cap lại lần 2 sau jitter, đề phòng jitter đẩy vượt) — tick "nghỉ đêm"/"đệm chờ" CUỐI
  // CÙNG trước giờ mở luôn tỉnh ĐÚNG lúc hoặc SỚM hơn, không bao giờ trễ hơn.
  if (candidate.getTime() >= cutoff.getTime()) {
    return cutoff;
  }
  const jittered = withJitter(candidate, baseIntervalMs * CONTINUOUS_JITTER_RATIO);
  return jittered.getTime() >= cutoff.getTime() ? cutoff : jittered;
}

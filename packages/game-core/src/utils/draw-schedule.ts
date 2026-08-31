/**
 * Game Core – Draw Schedule Helpers (hàm toán thuần, KHÔNG I/O)
 *
 * Mọi phép tính về **lưới giờ quay trong ngày** cho game quay nhanh (Keno, Bingo 18) —
 * lịch quay kiểu A (lưới đều trong ngày, xem `vietlott-period.ts`
 * — `VietlottScheduleKind.Grid`):
 *
 * - {@link computeDrawsPerDay} — đếm số kỳ/ngày (hiển thị ở trang cấu hình game).
 * - {@link listDrawSlotMinutes} — liệt kê từng mốc giờ của lưới (nguồn chân lý).
 * - {@link isDrawSlotCreatable} — slot còn đủ cửa sổ bán để tạo kỳ hay không.
 * - {@link computeDrawDayCapacity} — sức chứa kỳ còn lại của một ngày cụ thể.
 *
 * `minutesToHHmm` re-export từ `@megawin/shared/utils` cho tiện dùng cùng bộ này.
 *
 * Tách riêng khỏi `@megawin/shared/utils` vì đây là khái niệm nghiệp vụ GAME (lịch quay),
 * không phải date util thuần chung cho toàn hệ thống.
 *
 * Toàn bộ hàm ở đây **thuần** (không đọc `new Date()`, không I/O): thời điểm hiện tại luôn
 * được truyền vào dưới dạng `nowSecondsOfDay` đã quy đổi sang giờ VN bởi caller. Nhờ vậy
 * test không cần fake timer và use-case kiểm soát được múi giờ ở một chỗ duy nhất.
 */

import { minutesToHHmm, parseHHMMToMinutes } from "@megawin/shared/utils";

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

/**
 * Đổi phút-trong-ngày thành `"HH:mm"` zero-padded.
 *
 * Re-export từ `@megawin/shared/utils` — hàm này là date util thuần (nghịch đảo của
 * `parseHHMMToMinutes`), không phải khái niệm nghiệp vụ lịch quay. Giữ export ở đây để
 * caller xử lý slot (`listDrawSlotMinutes` → `Date`) chỉ cần import 1 module.
 */
export { minutesToHHmm };

/**
 * Toàn bộ mốc giờ quay của MỘT ngày, tính theo **phút trong ngày** (0–1439), tăng dần.
 *
 * Lưới (grid): `firstDrawTime + k × intervalMinutes` với `k ≥ 0`, dừng khi vượt
 * `lastDrawTime`. Đây là **nguồn chân lý duy nhất** cho câu hỏi "mốc giờ nào là kỳ quay
 * hợp lệ trong ngày" — dùng ở cả 2 phía:
 * - Preview: lấy grid rồi trừ đi slot đã bị chiếm / đã hết giờ để gợi ý cho staff.
 * - Create: kiểm `drawTime` staff gửi lên có nằm trong grid không (chặn giờ lệch lưới,
 *   VD 20:03 khi chu kỳ 8 phút chỉ cho 20:00 / 20:08).
 *
 * Số phần tử **luôn khớp** {@link computeDrawsPerDay} với cùng input — 2 hàm là 2 cách
 * biểu diễn của cùng một công thức, có test khẳng định bất biến này.
 *
 * Trả `null` khi config chưa hợp lệ (giờ sai format, `intervalMinutes ≤ 0`, kỳ cuối sớm
 * hơn kỳ đầu) — cùng contract với {@link computeDrawsPerDay} để caller chỉ phải xử lý
 * một kiểu lỗi.
 *
 * @param firstDrawTime - Giờ kỳ đầu trong ngày, `"HH:mm"` (VD `"06:08"`)
 * @param lastDrawTime - Giờ kỳ cuối trong ngày, `"HH:mm"` (VD `"21:52"`)
 * @param intervalMinutes - Khoảng cách giữa 2 kỳ liên tiếp (phút)
 * @returns Mảng phút-trong-ngày tăng dần, hoặc `null` nếu config không hợp lệ
 *
 * @example
 *   listDrawSlotMinutes("06:08", "21:52", 8) → [368, 376, …, 1312] (119 phần tử — Keno)
 *   listDrawSlotMinutes("06:06", "21:53", 6) → [366, 372, …, 1308] (158 phần tử — Bingo 18)
 */
export function listDrawSlotMinutes(
  firstDrawTime: string,
  lastDrawTime: string,
  intervalMinutes: number,
): number[] | null {
  const first = parseHHMMToMinutes(firstDrawTime);
  const last = parseHHMMToMinutes(lastDrawTime);

  if (first === null || last === null || intervalMinutes <= 0 || last < first) {
    return null;
  }

  const slots: number[] = [];
  for (let m = first; m <= last; m += intervalMinutes) {
    slots.push(m);
  }

  return slots;
}

/**
 * Cửa sổ bán tối thiểu (giây) mà một kỳ phải còn lại — tính từ **bây giờ** đến **giờ đóng
 * bán** — để được phép tạo.
 *
 * Vì sao cần ngưỡng > 0: không có nó, staff bấm tạo lúc `closeAt − 3s` vẫn sinh ra kỳ mở
 * bán đúng 3 giây rồi đóng. Kỳ đó vô nghĩa với người chơi nhưng vẫn phải chạy đủ vòng
 * publish/settle (hoặc void) như kỳ thật — rác vận hành.
 *
 * Vì sao 60s mà không lớn hơn: mục tiêu là **không để trống mốc quay** trong dãy kỳ của
 * ngày. Kỳ còn đúng 1 phút bán thì thực tế gần như không ai kịp cược, nhưng vẫn nên tạo
 * rồi mở-đóng bình thường — thà có kỳ không ai cược hơn là thiếu một kỳ trong lịch.
 *
 * KHÔNG đưa vào GlobalConfig: đây là ngưỡng vận hành chung cho mọi game quay nhanh, không
 * phải tham số nghiệp vụ riêng từng game — để trong config thì mỗi game lệch một giá trị
 * mà không ai có lý do nghiệp vụ để lệch.
 */
export const MIN_SALES_WINDOW_SECONDS = 60;

/**
 * Slot này có còn **tạo được** tại thời điểm hiện tại không.
 *
 * Điều kiện: `closeAt − now ≥ MIN_SALES_WINDOW_SECONDS`, với
 * `closeAt = slotMinutes × 60 − salesCloseBeforeSeconds` (giây trong ngày).
 *
 * Đây là predicate **DUY NHẤT** trả lời câu hỏi này trong toàn hệ thống — dùng bởi cả
 * `PreviewDrawsUseCase` (lọc slot gợi ý) và `CreateDrawUseCase` (validate lô staff gửi
 * lên). KHÔNG viết lại điều kiện ở chỗ khác: lệch một chỗ là preview gợi ý slot mà create
 * từ chối (staff thấy "lỗi ngẫu nhiên"), hoặc create nhận slot preview không bao giờ đề
 * xuất (lọt kỳ rác vào DB).
 *
 * @param slotMinutes - Phút-trong-ngày của mốc quay (lấy từ {@link listDrawSlotMinutes})
 * @param salesCloseBeforeSeconds - Đóng bán trước giờ quay bao nhiêu giây (từ game config)
 * @param nowSecondsOfDay - Giây-trong-ngày hiện tại theo **giờ VN** (0–86399). Truyền
 *   `undefined` khi ngày cần tạo **không phải hôm nay**: ngày tương lai thì mọi slot đều
 *   còn nguyên cửa sổ bán nên luôn hợp lệ.
 * @returns `true` nếu slot còn đủ cửa sổ bán tối thiểu
 */
export function isDrawSlotCreatable(
  slotMinutes: number,
  salesCloseBeforeSeconds: number,
  nowSecondsOfDay?: number,
): boolean {
  // Ngày tương lai: chưa tới ngày đó nên không slot nào "đã qua giờ".
  if (nowSecondsOfDay === undefined) {
    return true;
  }

  const closeAtSeconds = slotMinutes * 60 - salesCloseBeforeSeconds;
  return closeAtSeconds - nowSecondsOfDay >= MIN_SALES_WINDOW_SECONDS;
}

/** Sức chứa kỳ quay còn lại của MỘT ngày — kết quả của {@link computeDrawDayCapacity}. */
export interface DrawDayCapacity {
  /**
   * Số kỳ tối đa/ngày theo lưới giờ trong game config (= `listDrawSlotMinutes().length`).
   * Dùng để hiển thị "còn N/`maxPerDay` kỳ" cho staff và làm mẫu số trong thông báo lỗi.
   */
  maxPerDay: number;
  /**
   * Phút-trong-ngày của các slot **CÒN TẠO ĐƯỢC**, tăng dần.
   *
   * Đây là output chính: use-case map trực tiếp mảng này thành danh sách kỳ gợi ý
   * (`drawTime` + `closeAt` + `drawNo` dự kiến). Rỗng ⇒ ngày đã hết slot, không cần biết
   * vì sao hết (đã qua giờ hay đã tạo đủ) — cách xử lý của staff giống nhau: chọn ngày khác.
   */
  availableMinutes: number[];
}

/** Input của {@link computeDrawDayCapacity}. */
export interface ComputeDrawDayCapacityInput {
  /** Giờ kỳ đầu trong ngày, `"HH:mm"` — từ game config (`play.firstDrawTime`). */
  firstDrawTime: string;
  /** Giờ kỳ cuối trong ngày, `"HH:mm"` — từ game config (`play.lastDrawTime`). */
  lastDrawTime: string;
  /** Khoảng cách 2 kỳ liên tiếp (phút) — từ game config (`play.drawIntervalMinutes`). */
  intervalMinutes: number;
  /** Đóng bán trước giờ quay bao nhiêu giây — từ game config (`play.salesCloseBeforeSeconds`). */
  salesCloseBeforeSeconds: number;
  /**
   * Phút-trong-ngày của các kỳ ĐÃ tồn tại, **chỉ tính từ mốc cắt trở đi** (không phải cả
   * ngày). Không cần sort, không cần unique — hàm tự dedupe bằng `Set`.
   *
   * Truyền cả ngày vẫn cho kết quả đúng (kỳ quá khứ đã bị loại bởi
   * {@link isDrawSlotCreatable} trước) nhưng tốn payload vô ích — với Keno buổi tối là
   * ~100 document không dùng đến. Xem `DrawRepository.listDrawTimesByDate(drawDate, fromDrawTime)`.
   */
  occupiedMinutes: number[];
  /**
   * Giây-trong-ngày hiện tại theo **giờ VN** (0–86399). Truyền `undefined` khi ngày cần
   * tạo không phải hôm nay ⇒ không lọc slot nào theo giờ.
   */
  nowSecondsOfDay?: number;
}

/**
 * Tính các slot **còn tạo được** của MỘT ngày:
 * `grid − (slot không còn đủ cửa sổ bán) − (slot đã có kỳ chiếm)`.
 *
 * Lọc theo **từng slot của grid**, KHÔNG trừ theo *số lượng*. Cách trừ số lượng
 * (`còn lại = slot chưa qua giờ − số kỳ đã có`) sai ở 2 điểm: kỳ **lệch lưới** không chiếm
 * slot nào trong grid nên trừ đi là mất oan 1 kỳ, và kỳ **đã qua giờ** bị trừ hai lần nên
 * kết quả có thể âm.
 *
 * @param input - Xem {@link ComputeDrawDayCapacityInput}
 * @returns Sức chứa còn lại, hoặc `null` khi config lịch quay không hợp lệ (cùng contract
 *   với {@link listDrawSlotMinutes} / {@link computeDrawsPerDay})
 */
export function computeDrawDayCapacity(input: ComputeDrawDayCapacityInput): DrawDayCapacity | null {
  const { firstDrawTime, lastDrawTime, intervalMinutes, salesCloseBeforeSeconds, occupiedMinutes, nowSecondsOfDay } =
    input;

  const grid = listDrawSlotMinutes(firstDrawTime, lastDrawTime, intervalMinutes);
  if (!grid) {
    return null;
  }

  // Set cho lookup O(1): grid có tới ~158 phần tử, occupied có thể tương đương — dùng
  // Array.includes sẽ thành O(n²) trên đường preview (gọi mỗi lần staff đổi ngày).
  const occupied = new Set(occupiedMinutes);

  const availableMinutes = grid.filter(
    (m) => isDrawSlotCreatable(m, salesCloseBeforeSeconds, nowSecondsOfDay) && !occupied.has(m),
  );

  return { maxPerDay: grid.length, availableMinutes };
}

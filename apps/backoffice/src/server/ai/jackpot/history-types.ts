/**
 * `getJackpotHistory` — types dispatcher cho 3 game có Jackpot (lotto535/mega645/power655).
 *
 * TÁCH KHỎI `types.ts` (dùng cho `getGameJackpot` — số ĐANG TÍCH LUỸ + config seed/ngưỡng).
 * File này phục vụ chiều LỊCH SỬ: các vòng Jackpot đã ĐÓNG (ai trúng/chia) và diễn biến từng kỳ
 * trong 1 vòng cụ thể — dữ liệu SỰ KIỆN đã chốt, không đổi nữa (khác `getGameJackpot` biến thiên
 * liên tục). Không gắn `ConfigItem` — RAW passthrough giống `reports/types.ts`, vì Power 6/55 có
 * shape khác 2 game kia (JP1/JP2 song song) nên không thể ép về 1 field name chung.
 */

import type { JackpotGameProduct } from "@megawin/game-core/entities";

/** `meta` của `getJackpotHistory` — model biết đang xem view nào, cycle nào. */
export interface JackpotHistoryMeta {
  game: JackpotGameProduct;
  /** Từ `GAME_LABELS`, KHÔNG tự map lại. */
  gameLabel: string;
  /** Không có `cycleNo`: liệt kê các vòng ĐÃ ĐÓNG. Có `cycleNo`: diễn biến từng kỳ trong vòng đó. */
  view: "cycles" | "cycle-detail";
  cycleNo?: number;
  /** Thời điểm tool đọc (ISO). */
  fetchedAt: string;
}

export interface GetJackpotHistoryDispatchInput {
  game: JackpotGameProduct;
  /** Có → xem diễn biến từng kỳ (draw-by-draw) trong ĐÚNG vòng này. Không có → liệt kê các vòng đã đóng. */
  cycleNo?: number;
  page?: number;
  limit?: number;
}

export interface GetJackpotHistoryDispatchOutput {
  meta: JackpotHistoryMeta;
  /**
   * Không có `cycleNo`: RAW `ListJackpotCyclesOutput` — các vòng đã đóng (ai trúng/chia, tổng đóng
   * góp), có `total`/`page`/`limit` để model biết có bị cắt.
   * Có `cycleNo`: RAW `ListJackpotHistoryByCycleOutput` — từng kỳ quay trong vòng đó (opening/
   * closing/contribution mỗi kỳ), có `total`/`page`/`size`.
   */
  result: unknown;
}

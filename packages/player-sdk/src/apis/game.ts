/**
 * Game API Module (cross-game aggregates)
 *
 * Các API GỘP không gắn với 1 game cụ thể — dùng chung cho mọi loại game.
 * Truy cập qua `client.game`.
 *
 * @module
 */

import { ENDPOINTS } from "../endpoints";
import type { JackpotSummaryListResponse } from "../game";
import type { HttpClient } from "../http-client";

/**
 * Nhóm API jackpot gộp cross-game — truy cập qua `client.game.jackpots`.
 */
export interface GameJackpotsApi {
  /**
   * Lấy jackpot hiện tại của TẤT CẢ game có jackpot trong 1 request.
   *
   * Thay cho việc gọi từng `client.lotto535.getJackpot()`, `client.mega645.getJackpot()`,
   * `client.power655.getJackpot()`. Phù hợp cho widget "Jackpot đang tích luỹ" ở trang chủ.
   *
   * Chỉ trả về game đang có active cycle — game chưa mở jackpot bị bỏ qua (không lỗi).
   *
   * **Endpoint:** `GET /games/jackpots`
   *
   * @returns Danh sách jackpot summary theo từng game
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { jackpots } = await client.game.jackpots.list();
   *
   * for (const jp of jackpots) {
   *   console.log(`${jp.displayName}: ${jp.primaryAmount.toLocaleString()} VND`);
   *
   *   // Narrow theo game để đọc field đặc thù
   *   if (jp.gameProduct === "power655") {
   *     console.log(`  JP2: ${jp.details.jackpot2CurrentAmount.toLocaleString()} VND`);
   *   } else if (jp.gameProduct === "lotto535") {
   *     const { percentage, reachedSplitThreshold } = jp.details.progress;
   *     console.log(`  Tiến trình chia: ${percentage}%`, reachedSplitThreshold ? "(đã chạm ngưỡng)" : "");
   *   }
   * }
   * ```
   */
  list(): Promise<JackpotSummaryListResponse>;
}

/**
 * Game API — các thao tác GỘP cross-game (dùng chung mọi loại game).
 *
 * Truy cập qua `client.game`.
 *
 * @example
 * ```ts
 * const { jackpots } = await client.game.jackpots.list();
 * console.log(jackpots.length); // số game đang có jackpot active
 * ```
 */
export interface GameApi {
  /** Jackpot gộp cross-game. */
  readonly jackpots: GameJackpotsApi;
}

// ─────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────

/** @internal */
export function createGameApi(http: HttpClient): GameApi {
  return {
    jackpots: {
      async list(): Promise<JackpotSummaryListResponse> {
        return http.get<JackpotSummaryListResponse>(ENDPOINTS.game.listJackpots);
      },
    },
  };
}

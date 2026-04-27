/**
 * Balance API — query số dư ví player từ tenant server.
 *
 * Endpoint: `GET /balance?playerId={id}&currency=VND`
 *
 * `currency` mặc định `"VND"` — luôn được gửi kèm trong query string.
 * Response theo {@link CallbackResponse} envelope: `success: boolean` + `data` / `error`.
 * Retry tích hợp sẵn trong HttpClient layer (exponential backoff, tối đa 3 lần).
 */

import type { HttpClient } from "@megawin/http-client";

import { CALLBACK_PATHS } from "../shared";
import type { GetBalanceRequest, GetBalanceResponse } from "./types";
import { DEFAULT_CURRENCY } from "@megawin/shared/types";

// ─────────────────────────────────────────────────────────────────────────────
// BalanceApi Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface cho Balance callback API.
 *
 * MegaWin dùng để query số dư ví player từ tenant server.
 * Kết quả hiển thị trên UI game cho player.
 *
 * Response theo {@link CallbackResponse} envelope — consumer check `response.success`.
 */
export interface BalanceApi {
  /**
   * Lấy số dư ví player hiện tại.
   *
   * **Endpoint:** `GET /balance?playerId={id}&currency=VND`
   *
   * `currency` mặc định `"VND"` — không cần truyền, client tự điền.
   *
   * Dùng để:
   * - Hiển thị balance trên UI game.
   * - Pre-check trước khi bet (optional).
   *
   * Tự động retry tối đa 3 lần với exponential backoff khi gặp lỗi tạm thời.
   *
   * @param req - Query params: `playerId` (bắt buộc), `currency` (optional, mặc định `"VND"`).
   * @returns {@link GetBalanceResponse} — `success: true` + `data: BalanceData` hoặc `success: false` + `error`.
   * @throws {@link ApiClientError} khi tenant server lỗi sau hết retry.
   *
   * @example
   * ```ts
   * // currency mặc định "VND", không cần truyền tường minh
   * const result = await api.getBalance({ playerId: "john_doe" });
   *
   * if (result.success) {
   *   console.log(`Balance: ${result.data!.balance} ${result.data!.currency}`);
   * } else {
   *   console.error(`Error: ${result.error?.code} — ${result.error?.message}`);
   * }
   * ```
   */
  getBalance(req: GetBalanceRequest): Promise<GetBalanceResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tạo BalanceApi instance từ HttpClient đã cấu hình.
 *
 * Dùng `rawResponse: true` để giữ envelope {@link CallbackResponse} — caller cần
 * phân biệt `success: true` + `data.balance` với `success: false` + `error.code`
 * (`PLAYER_NOT_FOUND`, `INVALID_CURRENCY`).
 *
 * @internal Dùng bởi `createTenantGatewayClient` — không export ra ngoài package.
 */
export function createBalanceApi(http: HttpClient): BalanceApi {
  return {
    getBalance: (req: GetBalanceRequest) =>
      http.get<GetBalanceResponse>(CALLBACK_PATHS.balance, {
        params: {
          playerId: req.playerId,
          currency: req.currency ?? DEFAULT_CURRENCY,
        },
        rawResponse: true,
      }),
  };
}

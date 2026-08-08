/**
 * Player API Module
 *
 * Các API chung cho player: số dư.
 *
 * @module
 */

import { ENDPOINTS } from "../endpoints";
import type { HttpClient } from "../http-client";

// ─────────────────────────────────────────────
// Response Types
// ─────────────────────────────────────────────

/**
 * Thông tin số dư của player.
 *
 * Trả về bởi {@link PlayerApi.getBalance}.
 *
 * @example
 * ```ts
 * const balance = await client.player.getBalance();
 * console.log(`${balance.balance} ${balance.currency}`); // "500000 VND"
 * ```
 */
export interface PlayerBalance {
  /** ID player trong hệ thống MegaWin. */
  playerId: string;
  /** ID tenant sở hữu player này. */
  tenantId: string;
  /** Số dư hiện tại (VND). */
  balance: number;
  /** Đơn vị tiền tệ. VD: `"VND"`. */
  currency: string;
}

// ─────────────────────────────────────────────
// API Interface
// ─────────────────────────────────────────────

/**
 * Player API — các thao tác chung không gắn với game cụ thể.
 *
 * Truy cập qua `client.player`.
 *
 * @example
 * ```ts
 * const balance = await client.player.getBalance();
 * console.log(balance.balance);  // 500000
 * console.log(balance.currency); // "VND"
 * ```
 */
export interface PlayerApi {
  /**
   * Lấy số dư hiện tại của player.
   *
   * **Endpoint:** `GET /me/balance`
   *
   * @returns Thông tin số dư và đơn vị tiền tệ
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const balance = await client.player.getBalance();
   * console.log(balance.balance);  // 500000
   * console.log(balance.currency); // "VND"
   * ```
   */
  getBalance(): Promise<PlayerBalance>;
}

// ─────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────

/**
 * @internal
 */
export function createPlayerApi(http: HttpClient): PlayerApi {
  return {
    async getBalance(): Promise<PlayerBalance> {
      return http.get<PlayerBalance>(ENDPOINTS.player.balance);
    },
  };
}

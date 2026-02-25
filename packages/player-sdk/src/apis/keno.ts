/**
 * Keno API Module
 *
 * Tất cả API liên quan đến game Keno.
 *
 * @module
 */

import type { HttpClient } from "../http-client";
import type { KenoTicketPurchaseInput } from "../keno";
import { ENDPOINTS } from "../endpoints";

// ─────────────────────────────────────────────
// Response Types
// ─────────────────────────────────────────────

/**
 * Response khi đặt cược Keno thành công.
 *
 * @example
 * ```ts
 * const result = await client.keno.placeBet({ ... });
 * console.log(result.ticketId);    // "TKT-ABC123"
 * console.log(result.ticketNo);    // "K-20260225-001-0001"
 * console.log(result.totalAmount); // 10000
 * ```
 */
export interface KenoPlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. */
  ticketNo: string;
  /** Tổng tiền cược (VND). */
  totalAmount: number;
}

// ─────────────────────────────────────────────
// API Interface
// ─────────────────────────────────────────────

/**
 * Keno API — các thao tác liên quan đến game Keno.
 *
 * Truy cập qua `client.keno`.
 *
 * @example
 * ```ts
 * import { createPlayerClient } from "@megawin/player-sdk";
 * import { KenoPlayType } from "@megawin/player-sdk/keno";
 *
 * const client = createPlayerClient({ baseUrl: "https://api.megawin.com" });
 *
 * // Đặt cược Keno
 * const result = await client.keno.placeBet({
 *   startDrawId: "2026-02-25-001",
 *   drawCount: 1,
 *   boards: [{ boardNo: "A", numbers: ["01", "15", "33", "44", "60"] }],
 * });
 * ```
 */
export interface KenoApi {
  /**
   * Đặt cược Keno.
   *
   * Gửi request mua vé Keno cho player đã xác thực.
   * Số Keno dạng string zero-padded `"01"` đến `"80"`.
   *
   * **Endpoint:** `POST /player/keno/bets`
   *
   * @param input - Thông tin đặt cược
   * @param input.boards - Boards chọn số (tối đa 2). Mỗi board chọn 1-10 số.
   * @param input.sideBets - Side bets tùy chọn (Lớn/Nhỏ, Chẵn/Lẻ)
   * @param input.startDrawId - DrawId kỳ đầu tiên. Format: `YYYY-MM-DD-NNN`
   * @param input.drawCount - Số kỳ tham gia liên tiếp (1-20)
   * @returns Thông tin vé vừa tạo
   *
   * @throws {@link ApiClientError} code `INSUFFICIENT_BALANCE` — không đủ số dư
   * @throws {@link ApiClientError} code `DRAW_CLOSED` — kỳ quay đã đóng bán
   * @throws {@link ApiClientError} code `VALIDATION_ERROR` — input không hợp lệ
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * // Cược cơ bản: chọn 5 số
   * const result = await client.keno.placeBet({
   *   startDrawId: "2026-02-25-001",
   *   drawCount: 1,
   *   boards: [
   *     { boardNo: "A", numbers: ["01", "15", "33", "44", "60"] },
   *   ],
   * });
   *
   * // Cược kèm side bet
   * const result2 = await client.keno.placeBet({
   *   startDrawId: "2026-02-25-001",
   *   drawCount: 5,
   *   boards: [
   *     { boardNo: "A", numbers: ["01", "15", "33"] },
   *     { boardNo: "B", numbers: ["22", "44", "66", "77"] },
   *   ],
   *   sideBets: [
   *     { playType: "bigSmall", bet: "big" },
   *     { playType: "evenOdd", bet: "even" },
   *   ],
   * });
   *
   * console.log(result2.ticketId);    // "TKT-..."
   * console.log(result2.totalAmount); // 70000
   * ```
   */
  placeBet(input: KenoTicketPurchaseInput): Promise<KenoPlaceBetResponse>;
}

// ─────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────

/**
 * @internal
 */
export function createKenoApi(http: HttpClient): KenoApi {
  return {
    async placeBet(input: KenoTicketPurchaseInput): Promise<KenoPlaceBetResponse> {
      return http.post<KenoPlaceBetResponse>(ENDPOINTS.keno.placeBet, input);
    },
  };
}

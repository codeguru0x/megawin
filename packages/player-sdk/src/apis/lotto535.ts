/**
 * Lotto 5/35 API Module
 *
 * Tất cả API liên quan đến game Lotto 5/35.
 *
 * @module
 */

import type { HttpClient } from "../http-client";
import type { Lotto535TicketPurchaseInput } from "../lotto535";
import { ENDPOINTS } from "../endpoints";

// ─────────────────────────────────────────────
// Response Types
// ─────────────────────────────────────────────

/**
 * Response khi đặt cược Lotto 5/35 thành công.
 *
 * @example
 * ```ts
 * const result = await client.lotto535.placeBet({ ... });
 * console.log(result.ticketId);    // "TKT-XYZ789"
 * console.log(result.ticketNo);    // "L-20260225-001-0001"
 * console.log(result.totalAmount); // 30000
 * ```
 */
export interface Lotto535PlaceBetResponse {
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
 * Lotto 5/35 API — các thao tác liên quan đến game Lotto 5/35.
 *
 * Truy cập qua `client.lotto535`.
 *
 * @example
 * ```ts
 * import { createPlayerClient } from "@megawin/player-sdk";
 * import { Lotto535PlayType } from "@megawin/player-sdk/lotto535";
 *
 * const client = createPlayerClient({ baseUrl: "https://api.megawin.com" });
 *
 * const result = await client.lotto535.placeBet({
 *   drawId: "2026-02-25-001",
 *   drawCount: 1,
 *   boards: [{
 *     boardNo: "A",
 *     playType: Lotto535PlayType.Standard,
 *     selection: {
 *       mainNumbers: ["01", "08", "15", "22", "35"],
 *       specialNumbers: ["07"],
 *     },
 *   }],
 * });
 * ```
 */
export interface Lotto535Api {
  /**
   * Đặt cược Lotto 5/35.
   *
   * Gửi request mua vé Lotto 5/35 cho player đã xác thực.
   * Số chính dạng string `"01"` đến `"35"`, số đặc biệt `"01"` đến `"12"`.
   *
   * **Endpoint:** `POST /player/lotto535/bets`
   *
   * @param input - Thông tin đặt cược
   * @param input.drawId - DrawId kỳ đầu tiên. Format: `YYYY-MM-DD-NNN`
   * @param input.drawCount - Số kỳ tham gia liên tiếp (1-6)
   * @param input.boards - Danh sách boards (tối đa 5, không trùng boardNo)
   * @returns Thông tin vé vừa tạo
   *
   * @throws {@link ApiClientError} code `INSUFFICIENT_BALANCE` — không đủ số dư
   * @throws {@link ApiClientError} code `DRAW_CLOSED` — kỳ quay đã đóng bán
   * @throws {@link ApiClientError} code `VALIDATION_ERROR` — input không hợp lệ
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * // Vé Standard: 5 số chính + 1 số đặc biệt
   * const result = await client.lotto535.placeBet({
   *   drawId: "2026-02-25-001",
   *   drawCount: 1,
   *   boards: [{
   *     boardNo: "A",
   *     playType: "standard",
   *     selection: {
   *       mainNumbers: ["01", "08", "15", "22", "35"],
   *       specialNumbers: ["07"],
   *     },
   *   }],
   * });
   *
   * // Vé Bao (MainCover): 8 số chính + 1 số đặc biệt
   * const result2 = await client.lotto535.placeBet({
   *   drawId: "2026-02-25-001",
   *   drawCount: 3,
   *   boards: [
   *     {
   *       boardNo: "A",
   *       playType: "mainCover",
   *       selection: {
   *         mainNumbers: ["01", "05", "10", "15", "20", "25", "30", "35"],
   *         specialNumbers: ["07"],
   *       },
   *     },
   *     {
   *       boardNo: "B",
   *       playType: "standard",
   *       selection: {
   *         mainNumbers: ["02", "11", "19", "27", "33"],
   *         specialNumbers: ["12"],
   *       },
   *     },
   *   ],
   * });
   *
   * console.log(result2.ticketId);    // "TKT-..."
   * console.log(result2.totalAmount); // 186000
   * ```
   */
  placeBet(input: Lotto535TicketPurchaseInput): Promise<Lotto535PlaceBetResponse>;
}

// ─────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────

/**
 * @internal
 */
export function createLotto535Api(http: HttpClient): Lotto535Api {
  return {
    async placeBet(input: Lotto535TicketPurchaseInput): Promise<Lotto535PlaceBetResponse> {
      return http.post<Lotto535PlaceBetResponse>(ENDPOINTS.lotto535.placeBet, input);
    },
  };
}

/**
 * Max 3D Pro API Module
 * @module
 */

import type { HttpClient } from "../http-client";
import type {
  Max3dproTicketPurchaseInput,
  Max3dproGameConfigResponse,
  Max3dproDrawInfo,
  Max3dproTicketSummary,
  Max3dproLineInfo,
  Max3dproDrawResultSummary,
  Max3dproDrawResultInfo,
  Max3dproPlaceBetResponse,
  Max3dproCurrentDrawResponse,
  Max3dproListPendingTicketsParams,
  Max3dproListAllTicketsParams,
  Max3dproListDrawResultsParams,
  Max3dproEntryLinesParams,
  Max3dproListTicketsResponse,
  Max3dproTicketEntriesResponse,
  Max3dproEntryLinesResponse,
  Max3dproListDrawResultsResponse,
} from "../max3dpro";
import { ENDPOINTS } from "../endpoints";

/**
 * API module cho game Max 3D Pro.
 *
 * Truy cập qua `client.max3dpro`.
 */
export interface Max3dproApi {
  /**
   * Lấy cấu hình game Max 3D Pro (giá vé, play types, cơ cấu giải thưởng).
   *
   * **Endpoint:** `GET /games/max3dpro/config`
   *
   * @returns Cấu hình game và tenant hiện tại
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const config = await client.max3dpro.getGameConfig();
   * console.log(config.game.unitPrice); // 10000
   * ```
   */
  getGameConfig(): Promise<Max3dproGameConfigResponse>;

  /**
   * Lấy kỳ quay Max 3D Pro hiện tại đang mở bán.
   *
   * **Endpoint:** `GET /games/max3dpro/draws/current`
   *
   * @returns Kỳ quay hiện tại và danh sách kỳ đang active
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { currentDraw } = await client.max3dpro.getCurrentDraw();
   * if (currentDraw) {
   *   console.log(currentDraw.drawId); // "2026-03-07.001"
   * }
   * ```
   */
  getCurrentDraw(): Promise<Max3dproCurrentDrawResponse>;

  /**
   * Đặt cược Max 3D Pro.
   *
   * Có 2 chế độ chơi:
   * - `multiNumber` — chọn N bộ ba (N >= 3), hệ thống expand thành C(N,2) cặp
   * - `multiDigit` — chọn 3 chữ số đầu + 3 chữ số cuối, hệ thống expand thành tổ hợp
   *
   * **Endpoint:** `POST /games/max3dpro/bets`
   *
   * @param input - Thông tin vé: drawId, drawCount, boards (tối đa 4 boards)
   * @returns Thông tin vé vừa tạo gồm ticketId, ticketNo, totalAmount, balance sau cược
   *
   * @throws {@link ApiClientError} code `INSUFFICIENT_BALANCE` — không đủ số dư
   * @throws {@link ApiClientError} code `DRAW_CLOSED` — kỳ quay đã đóng bán
   * @throws {@link ApiClientError} code `VALIDATION_ERROR` — input không hợp lệ
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * import type { Max3dproTicketPurchaseInput } from "@megawin/player-sdk/max3dpro";
   *
   * // multiNumber: 3 bộ ba → C(3,2) = 3 cặp
   * const result = await client.max3dpro.placeBet({
   *   drawId: "2026-03-07.001",
   *   drawCount: 1,
   *   boards: [{
   *     boardNo: "A",
   *     playMode: "multiNumber",
   *     triplets: ["123", "456", "789"],
   *   }],
   * });
   * console.log(result.ticketNo);    // "M3DP-20260307-00004"
   * console.log(result.totalAmount); // 30000
   * console.log(result.balance);     // 970000
   * ```
   */
  placeBet(input: Max3dproTicketPurchaseInput): Promise<Max3dproPlaceBetResponse>;

  /**
   * Lấy danh sách vé Max 3D Pro đang chờ kết quả.
   *
   * **Endpoint:** `GET /games/max3dpro/tickets/pending`
   *
   * @param params - Tham số phân trang (tùy chọn)
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { tickets } = await client.max3dpro.listPendingTickets({ size: 20 });
   * for (const ticket of tickets) {
   *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ`);
   * }
   * ```
   */
  listPendingTickets(
    params?: Max3dproListPendingTicketsParams,
  ): Promise<Max3dproListTicketsResponse>;

  /**
   * Lấy lịch sử vé Max 3D Pro đã kết thúc.
   *
   * **Endpoint:** `GET /games/max3dpro/tickets`
   *
   * @param params - Tham số lọc và phân trang (tùy chọn)
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const march = await client.max3dpro.listTickets({ from: "2026-03-01", to: "2026-03-31" });
   * for (const ticket of march.tickets) {
   *   const win = ticket.settlement?.totalWinAmount ?? 0;
   *   console.log(`${ticket.ticketNo}: thắng ${win} VND`);
   * }
   * ```
   */
  listTickets(params?: Max3dproListAllTicketsParams): Promise<Max3dproListTicketsResponse>;

  /**
   * Lấy chi tiết các lần tham gia kỳ quay của một vé Max 3D Pro.
   *
   * **Endpoint:** `GET /games/max3dpro/tickets/{ticketId}/entries`
   *
   * @param ticketId - ID vé (lấy từ `ticket.id` hoặc `placeBet` response)
   * @returns Thông tin vé và danh sách entries kèm kết quả/thưởng
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — ticketId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const data = await client.max3dpro.getTicketEntries("65abc123def456...");
   * console.log(data.ticket.ticketNo); // "M3DP-20260307-00004"
   * for (const entry of data.entries) {
   *   if (entry.result) {
   *     // result.special, result.first, result.second, result.third đều là string[]
   *     console.log(`Đặc biệt: ${entry.result.special.join(", ")}`);
   *   }
   * }
   * ```
   */
  getTicketEntries(ticketId: string): Promise<Max3dproTicketEntriesResponse>;

  /**
   * Lấy danh sách lines chi tiết của một entry Max 3D Pro.
   *
   * **Endpoint:** `GET /games/max3dpro/entries/{entryId}/lines`
   *
   * @param entryId - ID entry (lấy từ `entries[].id` trong `getTicketEntries`)
   * @param params - Tham số phân trang (tùy chọn)
   * @returns Danh sách lines kèm cursor và kết quả đối chiếu
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — entryId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { lines } = await client.max3dpro.getEntryLines("entry-abc...", { size: 50 });
   * for (const line of lines) {
   *   const tiers = line.matchResult?.tiers.map(t => t.tier).join(" + ") ?? "không trúng";
   *   console.log(`[${line.boardNo}][${line.playMode}]: ${line.triplets.join(" + ")} → giải: ${tiers}`);
   * }
   * ```
   */
  getEntryLines(
    entryId: string,
    params?: Max3dproEntryLinesParams,
  ): Promise<Max3dproEntryLinesResponse>;

  /**
   * Lấy danh sách kết quả kỳ quay Max 3D Pro đã công bố.
   *
   * **Endpoint:** `GET /games/max3dpro/draw-results`
   *
   * @param params - Tham số phân trang và lọc ngày (tùy chọn)
   * @returns Danh sách kết quả kỳ quay kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { draws } = await client.max3dpro.listDrawResults({ size: 10 });
   * for (const draw of draws) {
   *   console.log(`[${draw.drawId}] Đặc biệt: ${draw.result.special.join(", ")}`);
   * }
   * ```
   */
  listDrawResults(params?: Max3dproListDrawResultsParams): Promise<Max3dproListDrawResultsResponse>;

  /**
   * Lấy chi tiết kết quả 1 kỳ quay Max 3D Pro.
   *
   * **Endpoint:** `GET /games/max3dpro/draw-results/{drawId}`
   *
   * @param drawId - ID kỳ quay. Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.001"`.
   * @returns Chi tiết kỳ quay gồm 20 bộ ba chia 4 hạng và bảng giải 8 hạng (kể cả `specialSub`)
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — kỳ quay chưa settle hoặc drawId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const draw = await client.max3dpro.getDrawResult("2026-03-07.001");
   * console.log(`Đặc biệt: ${draw.result.special.join(", ")}`);
   * for (const prize of draw.prizes) {
   *   if (prize.winnerCount > 0) {
   *     console.log(`  ${prize.tier}: ${prize.winnerCount} người, ${prize.prizeAmount.toLocaleString()} VND`);
   *   }
   * }
   * ```
   */
  getDrawResult(drawId: string): Promise<Max3dproDrawResultInfo>;
}

/** @internal */
export function createMax3dproApi(http: HttpClient): Max3dproApi {
  return {
    async getGameConfig() {
      return http.get<Max3dproGameConfigResponse>(ENDPOINTS.max3dpro.getGameConfig);
    },
    async getCurrentDraw() {
      return http.get<Max3dproCurrentDrawResponse>(ENDPOINTS.max3dpro.getCurrentDraw);
    },
    async placeBet(input) {
      return http.post<Max3dproPlaceBetResponse>(ENDPOINTS.max3dpro.placeBet, input);
    },
    async listPendingTickets(params) {
      return http.get<Max3dproListTicketsResponse>(ENDPOINTS.max3dpro.listPendingTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async listTickets(params) {
      return http.get<Max3dproListTicketsResponse>(ENDPOINTS.max3dpro.listTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getTicketEntries(ticketId) {
      return http.get<Max3dproTicketEntriesResponse>(ENDPOINTS.max3dpro.getTicketEntries(ticketId));
    },
    async getEntryLines(entryId, params) {
      return http.get<Max3dproEntryLinesResponse>(ENDPOINTS.max3dpro.getEntryLines(entryId), {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async listDrawResults(params) {
      return http.get<Max3dproListDrawResultsResponse>(ENDPOINTS.max3dpro.listDrawResults, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getDrawResult(drawId) {
      return http.get<Max3dproDrawResultInfo>(ENDPOINTS.max3dpro.getDrawResult(drawId));
    },
  };
}

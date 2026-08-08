/**
 * Max 3D API Module
 * @module
 */

import { ENDPOINTS } from "../endpoints";
import type { HttpClient } from "../http-client";
import type {
  Max3dCurrentDrawResponse,
  Max3dDrawInfo,
  Max3dDrawResultInfo,
  Max3dDrawResultSummary,
  Max3dEntryLinesParams,
  Max3dEntryLinesResponse,
  Max3dGameConfigResponse,
  Max3dLineInfo,
  Max3dListAllTicketsParams,
  Max3dListDrawResultsParams,
  Max3dListDrawResultsResponse,
  Max3dListPendingTicketsParams,
  Max3dListTicketsResponse,
  Max3dPlaceBetResponse,
  Max3dTicketEntriesResponse,
  Max3dTicketPurchaseInput,
  Max3dTicketSummary,
} from "../max3d";

/**
 * API module cho game Max 3D.
 *
 * Truy cập qua `client.max3d`.
 */
export interface Max3dApi {
  /**
   * Lấy cấu hình game Max 3D (giá vé, play types, cơ cấu giải thưởng).
   *
   * **Endpoint:** `GET /games/max3d/config`
   *
   * @returns Cấu hình game và tenant hiện tại
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const config = await client.max3d.getGameConfig();
   * console.log(config.game.unitPrice); // 10000
   * ```
   */
  getGameConfig(): Promise<Max3dGameConfigResponse>;

  /**
   * Lấy kỳ quay Max 3D hiện tại đang mở bán.
   *
   * **Endpoint:** `GET /games/max3d/draws/current`
   *
   * @returns Kỳ quay hiện tại và danh sách kỳ đang active
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { currentDraw } = await client.max3d.getCurrentDraw();
   * if (currentDraw) {
   *   console.log(currentDraw.drawId); // "2026-03-07.001"
   * }
   * ```
   */
  getCurrentDraw(): Promise<Max3dCurrentDrawResponse>;

  /**
   * Đặt cược Max 3D.
   *
   * Mỗi board chọn 1 bộ ba (Basic) hoặc 2 bộ ba (Plus, chỉ `straight`).
   * Basic play types: `straight` | `combo3` | `combo6`.
   * Plus chỉ dùng `straight` với 2 bộ ba.
   *
   * **Endpoint:** `POST /games/max3d/bets`
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
   * import type { Max3dTicketPurchaseInput } from "@megawin/player-sdk/max3d";
   *
   * const result = await client.max3d.placeBet({
   *   drawId: "2026-03-07.001",
   *   drawCount: 2,
   *   boards: [
   *     { boardNo: "A", playMode: "basic", playType: "straight", triplets: ["123"] },
   *     { boardNo: "B", playMode: "plus",  playType: "straight", triplets: ["456", "789"] },
   *   ],
   * });
   * console.log(result.ticketNo);    // "M3D-20260307-00005"
   * console.log(result.totalAmount); // 40000
   * console.log(result.balance);     // 960000
   * ```
   */
  placeBet(input: Max3dTicketPurchaseInput): Promise<Max3dPlaceBetResponse>;

  /**
   * Lấy danh sách vé Max 3D đang chờ kết quả.
   *
   * **Endpoint:** `GET /games/max3d/tickets/pending`
   *
   * @param params - Tham số phân trang (tùy chọn)
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { tickets } = await client.max3d.listPendingTickets({ size: 20 });
   * for (const ticket of tickets) {
   *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ`);
   * }
   * ```
   */
  listPendingTickets(params?: Max3dListPendingTicketsParams): Promise<Max3dListTicketsResponse>;

  /**
   * Lấy lịch sử vé Max 3D đã kết thúc.
   *
   * **Endpoint:** `GET /games/max3d/tickets`
   *
   * @param params - Tham số lọc và phân trang (tùy chọn)
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const march = await client.max3d.listTickets({ from: "2026-03-01", to: "2026-03-31" });
   * for (const ticket of march.tickets) {
   *   const win = ticket.settlement?.totalWinAmount ?? 0;
   *   console.log(`${ticket.ticketNo}: thắng ${win} VND`);
   * }
   * ```
   */
  listTickets(params?: Max3dListAllTicketsParams): Promise<Max3dListTicketsResponse>;

  /**
   * Lấy chi tiết các lần tham gia kỳ quay của một vé Max 3D.
   *
   * **Endpoint:** `GET /games/max3d/tickets/{ticketId}/entries`
   *
   * @param ticketId - ID vé (lấy từ `ticket.id` hoặc `placeBet` response)
   * @returns Thông tin vé và danh sách entries kèm kết quả/thưởng
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — ticketId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const data = await client.max3d.getTicketEntries("65abc123def456...");
   * console.log(data.ticket.ticketNo); // "M3D-20260307-00005"
   * for (const entry of data.entries) {
   *   if (entry.result) {
   *     // result.special, result.first, result.second, result.third đều là string[]
   *     console.log(`Đặc biệt: ${entry.result.special.join(", ")}`);
   *   }
   * }
   * ```
   */
  getTicketEntries(ticketId: string): Promise<Max3dTicketEntriesResponse>;

  /**
   * Lấy danh sách lines chi tiết của một entry Max 3D.
   *
   * **Endpoint:** `GET /games/max3d/entries/{entryId}/lines`
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
   * const { lines } = await client.max3d.getEntryLines("entry-abc...", { size: 50 });
   * for (const line of lines) {
   *   const tiers = line.matchResult?.tiers.map(t => t.tier).join(" + ") ?? "không trúng";
   *   console.log(`[${line.boardNo}] ${line.triplets.join(" + ")} → giải: ${tiers}`);
   * }
   * ```
   */
  getEntryLines(entryId: string, params?: Max3dEntryLinesParams): Promise<Max3dEntryLinesResponse>;

  /**
   * Lấy danh sách kết quả kỳ quay Max 3D đã công bố.
   *
   * **Endpoint:** `GET /games/max3d/draw-results`
   *
   * @param params - Tham số phân trang và lọc ngày (tùy chọn)
   * @returns Danh sách kết quả kỳ quay kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { draws } = await client.max3d.listDrawResults({ size: 10 });
   * for (const draw of draws) {
   *   console.log(`[${draw.drawId}] Đặc biệt: ${draw.result.special.join(", ")}`);
   * }
   * ```
   */
  listDrawResults(params?: Max3dListDrawResultsParams): Promise<Max3dListDrawResultsResponse>;

  /**
   * Lấy chi tiết kết quả 1 kỳ quay Max 3D.
   *
   * **Endpoint:** `GET /games/max3d/draw-results/{drawId}`
   *
   * @param drawId - ID kỳ quay. Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.001"`.
   * @returns Chi tiết kỳ quay gồm 20 bộ ba chia 4 hạng, và bảng giải (Basic + Plus gộp chung)
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — kỳ quay chưa settle hoặc drawId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const draw = await client.max3d.getDrawResult("2026-03-07.001");
   * console.log(`Đặc biệt: ${draw.result.special.join(", ")}`);
   * console.log(`Nhất:     ${draw.result.first.join(", ")}`);
   * for (const prize of draw.prizes) {
   *   if (prize.winnerCount > 0) {
   *     console.log(`  ${prize.tier}: ${prize.winnerCount} người, ${prize.prizeAmount.toLocaleString()} VND`);
   *   }
   * }
   * ```
   */
  getDrawResult(drawId: string): Promise<Max3dDrawResultInfo>;
}

/** @internal */
export function createMax3dApi(http: HttpClient): Max3dApi {
  return {
    async getGameConfig() {
      return http.get<Max3dGameConfigResponse>(ENDPOINTS.max3d.getGameConfig);
    },
    async getCurrentDraw() {
      return http.get<Max3dCurrentDrawResponse>(ENDPOINTS.max3d.getCurrentDraw);
    },
    async placeBet(input) {
      return http.post<Max3dPlaceBetResponse>(ENDPOINTS.max3d.placeBet, input);
    },
    async listPendingTickets(params) {
      return http.get<Max3dListTicketsResponse>(ENDPOINTS.max3d.listPendingTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async listTickets(params) {
      return http.get<Max3dListTicketsResponse>(ENDPOINTS.max3d.listTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getTicketEntries(ticketId) {
      return http.get<Max3dTicketEntriesResponse>(ENDPOINTS.max3d.getTicketEntries(ticketId));
    },
    async getEntryLines(entryId, params) {
      return http.get<Max3dEntryLinesResponse>(ENDPOINTS.max3d.getEntryLines(entryId), {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async listDrawResults(params) {
      return http.get<Max3dListDrawResultsResponse>(ENDPOINTS.max3d.listDrawResults, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getDrawResult(drawId) {
      return http.get<Max3dDrawResultInfo>(ENDPOINTS.max3d.getDrawResult(drawId));
    },
  };
}

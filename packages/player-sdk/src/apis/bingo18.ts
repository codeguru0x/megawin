/**
 * Bingo 18 API Module
 * @module
 */

import type { HttpClient } from "../http-client";
import type {
  Bingo18TicketPurchaseInput,
  Bingo18GameConfigResponse,
  Bingo18DrawInfo,
  Bingo18TicketSummary,
  Bingo18DrawResultSummary,
  Bingo18DrawResultInfo,
  Bingo18PlaceBetResponse,
  Bingo18CurrentDrawResponse,
  Bingo18ListPendingTicketsParams,
  Bingo18ListAllTicketsParams,
  Bingo18ListDrawResultsParams,
  Bingo18ListTicketsResponse,
  Bingo18TicketEntriesResponse,
  Bingo18ListDrawResultsResponse,
} from "../bingo18";
import { ENDPOINTS } from "../endpoints";

/**
 * API module cho game Bingo 18.
 *
 * Truy cập qua `client.bingo18`.
 */
export interface Bingo18Api {
  /**
   * Lấy cấu hình game Bingo 18 (giá vé, play types, cơ cấu giải thưởng).
   *
   * **Endpoint:** `GET /games/bingo18/config`
   *
   * @returns Cấu hình game và tenant hiện tại
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const config = await client.bingo18.getGameConfig();
   * console.log(config.game.unitPrice);        // 10000
   * console.log(config.game.drawIntervalMinutes); // 6
   * ```
   */
  getGameConfig(): Promise<Bingo18GameConfigResponse>;

  /**
   * Lấy kỳ quay Bingo 18 hiện tại và kết quả gần nhất.
   *
   * **Endpoint:** `GET /games/bingo18/draws/current`
   *
   * @returns Kỳ quay hiện tại và danh sách kỳ active
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { currentDraw, activeDraws } = await client.bingo18.getCurrentDraw();
   * if (currentDraw) {
   *   console.log(currentDraw.drawId); // "2026-03-07.095"
   * }
   * ```
   */
  getCurrentDraw(): Promise<Bingo18CurrentDrawResponse>;

  /**
   * Đặt cược Bingo 18.
   *
   * Phải có ít nhất 1 board. Boards bao gồm cả cược cơ bản (singleNum, doubleMatch, tripleMatch)
   * lẫn cược bổ sung (sumTotal, bigSmallDraw).
   * Tối đa 20 kỳ quay mỗi vé.
   *
   * **Endpoint:** `POST /games/bingo18/bets`
   *
   * @param input - Thông tin vé: drawIds, boards
   * @returns Thông tin vé vừa tạo gồm ticketId, ticketNo, totalAmount
   *
   * @throws {@link ApiClientError} code `INSUFFICIENT_BALANCE` — không đủ số dư
   * @throws {@link ApiClientError} code `DRAW_CLOSED` — kỳ quay đã đóng bán
   * @throws {@link ApiClientError} code `VALIDATION_ERROR` — input không hợp lệ
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * import type { Bingo18TicketPurchaseInput } from "@megawin/player-sdk/bingo18";
   *
   * const result = await client.bingo18.placeBet({
   *   drawIds: ["2026-03-07.001", "2026-03-07.002"],
   *   boards: [
   *     { playType: "singleNum", number: 5 },
   *     { playType: "tripleMatch", tripleKind: "any" },
   *     { playType: "bigSmallDraw", bet: "big" },
   *   ],
   * });
   * console.log(result.ticketNo);    // "B18-20260307-00007"
   * console.log(result.pricing.totalAmount); // 60000
   * ```
   */
  placeBet(input: Bingo18TicketPurchaseInput): Promise<Bingo18PlaceBetResponse>;

  /**
   * Lấy danh sách vé Bingo 18 đang chờ kết quả.
   *
   * **Endpoint:** `GET /games/bingo18/tickets/pending`
   *
   * @param params - Tham số phân trang (tùy chọn)
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { tickets } = await client.bingo18.listPendingTickets({ size: 20 });
   * for (const ticket of tickets) {
   *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ`);
   * }
   * ```
   */
  listPendingTickets(params?: Bingo18ListPendingTicketsParams): Promise<Bingo18ListTicketsResponse>;

  /**
   * Lấy lịch sử vé Bingo 18 đã kết thúc.
   *
   * **Endpoint:** `GET /games/bingo18/tickets`
   *
   * @param params - Tham số lọc và phân trang (tùy chọn)
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const march = await client.bingo18.listTickets({ from: "2026-03-01", to: "2026-03-31" });
   * for (const ticket of march.tickets) {
   *   const win = ticket.settlement?.totalWinAmount ?? 0;
   *   console.log(`${ticket.ticketNo}: thắng ${win} VND`);
   * }
   * ```
   */
  listTickets(params?: Bingo18ListAllTicketsParams): Promise<Bingo18ListTicketsResponse>;

  /**
   * Lấy chi tiết các lần tham gia kỳ quay của một vé Bingo 18.
   *
   * **Endpoint:** `GET /games/bingo18/tickets/{ticketId}/entries`
   *
   * @param ticketId - ID vé (lấy từ `ticket.id` hoặc `placeBet` response)
   * @returns Thông tin vé và danh sách entries kèm kết quả/thưởng
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — ticketId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const data = await client.bingo18.getTicketEntries("65abc123def456...");
   * console.log(data.ticket.ticketNo); // "B18-20260307-00007"
   * for (const entry of data.entries) {
   *   if (entry.result) {
   *     console.log(`Số: ${entry.result.numbers.join(", ")} — Tổng: ${entry.result.sum}`);
   *   }
   * }
   * ```
   */
  getTicketEntries(ticketId: string): Promise<Bingo18TicketEntriesResponse>;

  /**
   * Lấy danh sách kết quả kỳ quay Bingo 18 đã công bố.
   *
   * Bingo 18 có ~240 kỳ/ngày, mỗi 6 phút quay 1 lần.
   *
   * **Endpoint:** `GET /games/bingo18/draw-results`
   *
   * @param params - Tham số phân trang và lọc ngày (tùy chọn)
   * @returns Danh sách kết quả kỳ quay kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { draws } = await client.bingo18.listDrawResults({ size: 20 });
   * for (const draw of draws) {
   *   console.log(`[${draw.drawId}] ${draw.result.numbers.join(", ")} — Tổng: ${draw.result.sum}`);
   * }
   * ```
   */
  listDrawResults(params?: Bingo18ListDrawResultsParams): Promise<Bingo18ListDrawResultsResponse>;

  /**
   * Lấy chi tiết kết quả 1 kỳ quay Bingo 18.
   *
   * Trả về bảng giải thống nhất `prizes` chứa cả giải board cơ bản
   * (singleNum, doubleMatch, tripleMatch) và cược bổ sung (sumTotal, bigSmallDraw).
   *
   * **Endpoint:** `GET /games/bingo18/draw-results/{drawId}`
   *
   * @param drawId - ID kỳ quay. Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.095"`.
   * @returns Chi tiết kỳ quay gồm 3 số xúc xắc và bảng giải thống nhất
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — kỳ quay chưa settle hoặc drawId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const draw = await client.bingo18.getDrawResult("2026-03-07.095");
   * console.log(`Số: ${draw.result.numbers.join(", ")} — Tổng: ${draw.result.sum}`);
   *
   * for (const prize of draw.prizes) {
   *   if (prize.sum !== undefined) {
   *     console.log(`  sumTotal (tổng ${prize.sum}): ${prize.winnerCount} lượt`);
   *   } else if (prize.bet) {
   *     console.log(`  bigSmallDraw (${prize.bet}): ${prize.winnerCount} lượt`);
   *   } else {
   *     console.log(`  ${prize.playType} x${prize.matchCount}: ${prize.winnerCount} lượt, ${prize.prizePerUnit.toLocaleString()} VND/lượt`);
   *   }
   * }
   * ```
   */
  getDrawResult(drawId: string): Promise<Bingo18DrawResultInfo>;
}

/** @internal */
export function createBingo18Api(http: HttpClient): Bingo18Api {
  return {
    async getGameConfig() {
      return http.get<Bingo18GameConfigResponse>(ENDPOINTS.bingo18.getGameConfig);
    },
    async getCurrentDraw() {
      return http.get<Bingo18CurrentDrawResponse>(ENDPOINTS.bingo18.getCurrentDraw);
    },
    async placeBet(input) {
      return http.post<Bingo18PlaceBetResponse>(ENDPOINTS.bingo18.placeBet, input);
    },
    async listPendingTickets(params) {
      return http.get<Bingo18ListTicketsResponse>(ENDPOINTS.bingo18.listPendingTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async listTickets(params) {
      return http.get<Bingo18ListTicketsResponse>(ENDPOINTS.bingo18.listTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getTicketEntries(ticketId) {
      return http.get<Bingo18TicketEntriesResponse>(ENDPOINTS.bingo18.getTicketEntries(ticketId));
    },
    async listDrawResults(params) {
      return http.get<Bingo18ListDrawResultsResponse>(ENDPOINTS.bingo18.listDrawResults, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getDrawResult(drawId) {
      return http.get<Bingo18DrawResultInfo>(ENDPOINTS.bingo18.getDrawResult(drawId));
    },
  };
}

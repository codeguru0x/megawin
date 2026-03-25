/**
 * Mega 6/45 API Module
 * @module
 */

import type { HttpClient } from "../http-client";
import type {
  Mega645TicketPurchaseInput,
  Mega645GameConfigResponse,
  Mega645DrawInfo,
  Mega645TicketSummary,
  Mega645EntryResult,
  Mega645DrawResultDetail,
  Mega645DrawResultSummary,
  Mega645PlaceBetResponse,
  Mega645CurrentDrawResponse,
  Mega645JackpotResponse,
  Mega645ListPendingTicketsParams,
  Mega645ListAllTicketsParams,
  Mega645ListDrawResultsParams,
  Mega645ListTicketsResponse,
  Mega645TicketEntriesResponse,
  Mega645EntryLinesResponse,
  Mega645ListDrawResultsResponse,
} from "../mega645";
import { ENDPOINTS } from "../endpoints";

/**
 * API module cho game Mega 6/45.
 *
 * Truy cập qua `client.mega645`.
 */
export interface Mega645Api {
  /**
   * Lấy cấu hình game Mega 6/45 (giá vé, play types, cơ cấu giải thưởng).
   *
   * **Endpoint:** `GET /games/mega645/config`
   *
   * @returns Cấu hình game và tenant hiện tại
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const config = await client.mega645.getGameConfig();
   * console.log(config.game.unitPrice); // 10000
   * ```
   */
  getGameConfig(): Promise<Mega645GameConfigResponse>;

  /**
   * Lấy kỳ quay Mega 6/45 hiện tại đang mở bán.
   *
   * **Endpoint:** `GET /games/mega645/draws/current`
   *
   * @returns Kỳ quay hiện tại và danh sách kỳ đang active
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { currentDraw } = await client.mega645.getCurrentDraw();
   * if (currentDraw) {
   *   console.log(currentDraw.drawId);        // "2026-03-07.001"
   *   console.log(currentDraw.sales.closeAt); // "2026-03-07T12:30:00.000Z"
   * }
   * ```
   */
  getCurrentDraw(): Promise<Mega645CurrentDrawResponse>;

  /**
   * Lấy thông tin Jackpot Mega 6/45 hiện tại.
   *
   * **Endpoint:** `GET /games/mega645/jackpot`
   *
   * @returns Giá trị Jackpot và ID cycle đang chạy
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const jackpot = await client.mega645.getJackpot();
   * console.log(jackpot.jackpotAmount); // 8500000000
   * ```
   */
  getJackpot(): Promise<Mega645JackpotResponse>;

  /**
   * Đặt cược Mega 6/45.
   *
   * **Endpoint:** `POST /games/mega645/bets`
   *
   * @param input - Thông tin vé: drawId, drawCount, boards
   * @returns Thông tin vé vừa tạo gồm ticketId, ticketNo, totalAmount
   *
   * @throws {@link ApiClientError} code `INSUFFICIENT_BALANCE` — không đủ số dư
   * @throws {@link ApiClientError} code `DRAW_CLOSED` — kỳ quay đã đóng bán
   * @throws {@link ApiClientError} code `VALIDATION_ERROR` — input không hợp lệ (số sai range, thiếu field...)
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * import type { Mega645TicketPurchaseInput } from "@megawin/player-sdk/mega645";
   *
   * const result = await client.mega645.placeBet({
   *   drawId: "2026-03-07.001",
   *   drawCount: 1,
   *   boards: [{
   *     boardNo: "A",
   *     playType: "standard",
   *     selection: { numbers: ["05", "12", "22", "31", "40", "45"] },
   *   }],
   * });
   * console.log(result.ticketNo);    // "M645-20260307-00003"
   * console.log(result.totalAmount); // 10000
   * ```
   */
  placeBet(input: Mega645TicketPurchaseInput): Promise<Mega645PlaceBetResponse>;

  /**
   * Lấy danh sách vé Mega 6/45 đang chờ kết quả.
   *
   * Trả về các vé mà kỳ quay chưa kết thúc hoặc chưa settle xong.
   *
   * **Endpoint:** `GET /games/mega645/tickets/pending`
   *
   * @param params - Tham số phân trang (tùy chọn)
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { tickets } = await client.mega645.listPendingTickets({ size: 20 });
   * for (const ticket of tickets) {
   *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ`);
   * }
   * ```
   */
  listPendingTickets(params?: Mega645ListPendingTicketsParams): Promise<Mega645ListTicketsResponse>;

  /**
   * Lấy lịch sử vé Mega 6/45 đã kết thúc.
   *
   * Hỗ trợ lọc theo ngày và phân trang cursor-based.
   *
   * **Endpoint:** `GET /games/mega645/tickets`
   *
   * @param params - Tham số lọc và phân trang (tùy chọn)
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const march = await client.mega645.listTickets({ from: "2026-03-01", to: "2026-03-31" });
   * for (const ticket of march.tickets) {
   *   const win = ticket.settlement?.totalWinAmount ?? 0;
   *   console.log(`${ticket.ticketNo}: thắng ${win} VND`);
   * }
   * ```
   */
  listTickets(params?: Mega645ListAllTicketsParams): Promise<Mega645ListTicketsResponse>;

  /**
   * Lấy chi tiết các lần tham gia kỳ quay của một vé Mega 6/45.
   *
   * **Endpoint:** `GET /games/mega645/tickets/{ticketId}/entries`
   *
   * @param ticketId - ID vé (lấy từ `ticket.id` hoặc `placeBet` response)
   * @returns Thông tin vé và danh sách entries kèm kết quả/thưởng
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — ticketId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const data = await client.mega645.getTicketEntries("65abc123def456...");
   * console.log(data.ticket.ticketNo); // "M645-20260307-00003"
   * console.log(data.entries.length);   // 1 (mua 1 kỳ)
   * ```
   */
  getTicketEntries(ticketId: string): Promise<Mega645TicketEntriesResponse>;

  /**
   * Lấy danh sách lines chi tiết của một entry Mega 6/45.
   *
   * Chỉ có sau khi entry đã được settle.
   *
   * **Endpoint:** `GET /games/mega645/entries/{entryId}/lines`
   *
   * @param entryId - ID entry (lấy từ `entries[].id` trong `getTicketEntries`)
   * @returns Danh sách lines đã expand từ boards
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — entryId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { lines } = await client.mega645.getEntryLines("entry-abc...");
   * for (const line of lines) {
   *   console.log(line.numbers.join(", "));
   * }
   * ```
   */
  getEntryLines(entryId: string): Promise<Mega645EntryLinesResponse>;

  /**
   * Lấy danh sách kết quả kỳ quay Mega 6/45 đã settle.
   *
   * Chỉ trả các kỳ đã settle có kết quả.
   * Hỗ trợ lọc từ ngày và phân trang cursor-based.
   *
   * **Endpoint:** `GET /games/mega645/draw-results`
   *
   * @param params - Tham số truy vấn: from, size, cursor
   * @returns Danh sách kết quả (6 số + jackpot snapshot) kèm cursor
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const results = await client.mega645.listDrawResults({
   *   from: "2026-03-01",
   *   size: 10,
   * });
   *
   * for (const draw of results.draws) {
   *   console.log(`Kỳ ${draw.drawId}: ${draw.result.winningNumbers.join(", ")}`);
   *   console.log(`JP: ${draw.jackpot.closingAmount.toLocaleString()} VND`);
   * }
   * ```
   */
  listDrawResults(params?: Mega645ListDrawResultsParams): Promise<Mega645ListDrawResultsResponse>;

  /**
   * Lấy chi tiết kết quả 1 kỳ quay Mega 6/45.
   *
   * Trả về 6 số chính, Jackpot snapshot, và bảng giải thưởng chi tiết (4 tiers).
   *
   * **Endpoint:** `GET /games/mega645/draw-results/{drawId}`
   *
   * @param drawId - Mã kỳ quay (format: YYYY-MM-DD.NNN)
   * @returns Chi tiết kết quả kỳ quay
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — draw không tồn tại hoặc chưa settle
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const result = await client.mega645.getDrawResult("2026-03-08.001");
   *
   * console.log(`Số: ${result.result.winningNumbers.join(", ")}`);
   * // "Số: 06, 12, 13, 25, 31, 32"
   *
   * console.log(`JP: ${result.jackpot.closingAmount.toLocaleString()} VND`);
   * // "JP: 18,851,320,000 VND"
   *
   * for (const prize of result.prizes) {
   *   console.log(`${prize.tier}: ${prize.winnerCount} lượt, ${prize.prizeAmount.toLocaleString()} VND`);
   * }
   * ```
   */
  getDrawResult(drawId: string): Promise<Mega645DrawResultDetail>;
}

/** @internal */
export function createMega645Api(http: HttpClient): Mega645Api {
  return {
    async getGameConfig() {
      return http.get<Mega645GameConfigResponse>(ENDPOINTS.mega645.getGameConfig);
    },
    async getCurrentDraw() {
      return http.get<Mega645CurrentDrawResponse>(ENDPOINTS.mega645.getCurrentDraw);
    },
    async getJackpot() {
      return http.get<Mega645JackpotResponse>(ENDPOINTS.mega645.getJackpot);
    },
    async placeBet(input) {
      return http.post<Mega645PlaceBetResponse>(ENDPOINTS.mega645.placeBet, input);
    },
    async listPendingTickets(params) {
      return http.get<Mega645ListTicketsResponse>(ENDPOINTS.mega645.listPendingTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async listTickets(params) {
      return http.get<Mega645ListTicketsResponse>(ENDPOINTS.mega645.listTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getTicketEntries(ticketId) {
      return http.get<Mega645TicketEntriesResponse>(ENDPOINTS.mega645.getTicketEntries(ticketId));
    },
    async getEntryLines(entryId) {
      return http.get<Mega645EntryLinesResponse>(ENDPOINTS.mega645.getEntryLines(entryId));
    },
    async listDrawResults(params) {
      return http.get<Mega645ListDrawResultsResponse>(ENDPOINTS.mega645.listDrawResults, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getDrawResult(drawId) {
      return http.get<Mega645DrawResultDetail>(ENDPOINTS.mega645.getDrawResult(drawId));
    },
  };
}

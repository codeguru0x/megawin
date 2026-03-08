/**
 * Power 6/55 API Module
 * @module
 */

import type { HttpClient } from "../http-client";
import type {
  Power655TicketPurchaseInput,
  Power655GameConfigResponse,
  Power655DrawInfo,
  Power655TicketSummary,
  Power655EntryResult,
} from "../power655";
import { ENDPOINTS } from "../endpoints";

/**
 * Tham số phân trang cho danh sách vé Power 6/55 đang chờ.
 *
 * Cursor-based pagination.
 *
 * @example
 * ```ts
 * const page1 = await client.power655.listPendingTickets({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.power655.listPendingTickets({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Power655ListTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
  /** Lọc từ ngày (YYYY-MM-DD). */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD). */
  to?: string;
}

/**
 * Response khi đặt cược Power 6/55 thành công.
 *
 * Trả về bởi {@link Power655Api.placeBet}.
 */
export interface Power655PlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. VD: `"P655-20260307-00002"`. */
  ticketNo: string;
  /** Tổng tiền cược (VND). */
  totalAmount: number;
}

/**
 * Thông tin kỳ quay Power 6/55 hiện tại.
 *
 * Trả về bởi {@link Power655Api.getCurrentDraw}.
 */
export interface Power655CurrentDrawResponse {
  /** Kỳ quay đang mở bán, hoặc `null` nếu chưa có. */
  currentDraw: Power655DrawInfo | null;
  /** Tất cả kỳ quay đang active. */
  activeDraws: Power655DrawInfo[];
}

/**
 * Thông tin Jackpot Power 6/55 hiện tại.
 *
 * Power 6/55 có 2 mức Jackpot.
 *
 * Trả về bởi {@link Power655Api.getJackpot}.
 */
export interface Power655JackpotResponse {
  /** Giá trị Jackpot 1 (VND). */
  jackpot1Amount: number;
  /** Giá trị Jackpot 2 (VND). */
  jackpot2Amount: number;
  /** ID chu kỳ Jackpot đang chạy. */
  cycleId: string;
  /** Thời điểm mở cycle (ISO 8601). */
  openedAt: string;
}

/**
 * Danh sách vé Power 6/55 (cursor-based).
 *
 * Trả về bởi {@link Power655Api.listPendingTickets} và {@link Power655Api.listTickets}.
 */
export interface Power655ListTicketsResponse {
  /** Danh sách vé trong trang hiện tại. */
  tickets: Power655TicketSummary[];
  /** Cursor để lấy trang tiếp theo, `null` nếu đã hết. */
  nextCursor: string | null;
  /** Số vé thực tế trả về. */
  size: number;
}

/**
 * Chi tiết vé và các lần tham gia kỳ quay của vé Power 6/55.
 *
 * Trả về bởi {@link Power655Api.getTicketEntries}.
 */
export interface Power655TicketEntriesResponse {
  /** Thông tin tóm tắt vé. */
  ticket: Power655TicketSummary;
  /** Danh sách entries (1 entry = 1 kỳ quay). */
  entries: Power655EntryResult[];
}

/**
 * Danh sách lines chi tiết của một entry Power 6/55.
 *
 * Trả về bởi {@link Power655Api.getEntryLines}.
 */
export interface Power655EntryLinesResponse {
  /** ID entry. */
  entryId: string;
  /** Danh sách lines đã expand từ boards. */
  lines: Array<{ mainNumbers: number[] }>;
}

/**
 * API module cho game Power 6/55.
 *
 * Truy cập qua `client.power655`.
 */
export interface Power655Api {
  /**
   * Lấy cấu hình game Power 6/55 (giá vé, play types, cơ cấu giải thưởng).
   *
   * **Endpoint:** `GET /games/power655/config`
   *
   * @returns Cấu hình game và tenant hiện tại
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const config = await client.power655.getGameConfig();
   * console.log(config.game.unitPrice); // 10000
   * ```
   */
  getGameConfig(): Promise<Power655GameConfigResponse>;

  /**
   * Lấy kỳ quay Power 6/55 hiện tại đang mở bán.
   *
   * **Endpoint:** `GET /games/power655/draws/current`
   *
   * @returns Kỳ quay hiện tại và danh sách kỳ đang active
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { currentDraw } = await client.power655.getCurrentDraw();
   * if (currentDraw) {
   *   console.log(currentDraw.drawId);        // "2026-03-07.001"
   *   console.log(currentDraw.sales.closeAt); // "2026-03-07T12:30:00.000Z"
   * }
   * ```
   */
  getCurrentDraw(): Promise<Power655CurrentDrawResponse>;

  /**
   * Lấy thông tin Jackpot Power 6/55 hiện tại.
   *
   * **Endpoint:** `GET /games/power655/jackpot`
   *
   * @returns Giá trị Jackpot 1, Jackpot 2 và ID cycle đang chạy
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const jackpot = await client.power655.getJackpot();
   * console.log(jackpot.jackpot1Amount); // 45000000000
   * console.log(jackpot.jackpot2Amount); // 2000000000
   * ```
   */
  getJackpot(): Promise<Power655JackpotResponse>;

  /**
   * Đặt cược Power 6/55.
   *
   * **Endpoint:** `POST /games/power655/bets`
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
   * import type { Power655TicketPurchaseInput } from "@megawin/player-sdk/power655";
   *
   * const result = await client.power655.placeBet({
   *   drawId: "2026-03-07.001",
   *   drawCount: 1,
   *   boards: [{
   *     boardNo: "A",
   *     playType: "standard",
   *     selection: { mainNumbers: ["03", "11", "25", "38", "49", "55"] },
   *   }],
   * });
   * console.log(result.ticketNo);    // "P655-20260307-00002"
   * console.log(result.totalAmount); // 10000
   * ```
   */
  placeBet(input: Power655TicketPurchaseInput): Promise<Power655PlaceBetResponse>;

  /**
   * Lấy danh sách vé Power 6/55 đang chờ kết quả.
   *
   * **Endpoint:** `GET /games/power655/tickets/pending`
   *
   * @param params - Tham số phân trang (tùy chọn)
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { tickets } = await client.power655.listPendingTickets({ size: 20 });
   * for (const ticket of tickets) {
   *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ`);
   * }
   * ```
   */
  listPendingTickets(params?: Power655ListTicketsParams): Promise<Power655ListTicketsResponse>;

  /**
   * Lấy lịch sử vé Power 6/55 đã kết thúc.
   *
   * **Endpoint:** `GET /games/power655/tickets`
   *
   * @param params - Tham số lọc và phân trang (tùy chọn)
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const march = await client.power655.listTickets({ from: "2026-03-01", to: "2026-03-31" });
   * for (const ticket of march.tickets) {
   *   const win = ticket.settlement?.totalWinAmount ?? 0;
   *   console.log(`${ticket.ticketNo}: thắng ${win} VND`);
   * }
   * ```
   */
  listTickets(params?: Power655ListTicketsParams): Promise<Power655ListTicketsResponse>;

  /**
   * Lấy chi tiết các lần tham gia kỳ quay của một vé Power 6/55.
   *
   * **Endpoint:** `GET /games/power655/tickets/{ticketId}/entries`
   *
   * @param ticketId - ID vé (lấy từ `ticket.id` hoặc `placeBet` response)
   * @returns Thông tin vé và danh sách entries kèm kết quả/thưởng
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — ticketId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const data = await client.power655.getTicketEntries("65abc123def456...");
   * console.log(data.ticket.ticketNo); // "P655-20260307-00002"
   * console.log(data.entries.length);   // 1
   * ```
   */
  getTicketEntries(ticketId: string): Promise<Power655TicketEntriesResponse>;

  /**
   * Lấy danh sách lines chi tiết của một entry Power 6/55.
   *
   * **Endpoint:** `GET /games/power655/entries/{entryId}/lines`
   *
   * @param entryId - ID entry (lấy từ `entries[].id` trong `getTicketEntries`)
   * @returns Danh sách lines đã expand từ boards
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — entryId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { lines } = await client.power655.getEntryLines("entry-abc...");
   * for (const line of lines) {
   *   console.log(line.mainNumbers.join(", "));
   * }
   * ```
   */
  getEntryLines(entryId: string): Promise<Power655EntryLinesResponse>;
}

/** @internal */
export function createPower655Api(http: HttpClient): Power655Api {
  return {
    async getGameConfig() {
      return http.get<Power655GameConfigResponse>(ENDPOINTS.power655.getGameConfig);
    },
    async getCurrentDraw() {
      return http.get<Power655CurrentDrawResponse>(ENDPOINTS.power655.getCurrentDraw);
    },
    async getJackpot() {
      return http.get<Power655JackpotResponse>(ENDPOINTS.power655.getJackpot);
    },
    async placeBet(input) {
      return http.post<Power655PlaceBetResponse>(ENDPOINTS.power655.placeBet, input);
    },
    async listPendingTickets(params) {
      return http.get<Power655ListTicketsResponse>(ENDPOINTS.power655.listPendingTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async listTickets(params) {
      return http.get<Power655ListTicketsResponse>(ENDPOINTS.power655.listTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getTicketEntries(ticketId) {
      return http.get<Power655TicketEntriesResponse>(ENDPOINTS.power655.getTicketEntries(ticketId));
    },
    async getEntryLines(entryId) {
      return http.get<Power655EntryLinesResponse>(ENDPOINTS.power655.getEntryLines(entryId));
    },
  };
}

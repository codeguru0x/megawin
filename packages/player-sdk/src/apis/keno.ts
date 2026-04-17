/**
 * Keno API Module
 *
 * Tất cả API liên quan đến game Keno.
 *
 * @module
 */

import type { HttpClient } from "../http-client";
import type {
  KenoTicketPurchaseInput,
  KenoPlaceBetResponse,
  KenoCurrentDrawResponse,
  KenoListTicketsParams,
  KenoListAllTicketsParams,
  KenoListTicketsResponse,
  KenoTicketEntriesResponse,
  KenoGameConfigResponse,
  KenoListDrawResultsParams,
  KenoListDrawResultsResponse,
  KenoDrawResultDetail,
} from "../keno";
import { ENDPOINTS } from "../endpoints";

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
 *
 * const client = createPlayerClient({
 *   baseUrl: "https://api.domain.com",
 *   tokens: tokensFromServer,
 * });
 *
 * // Lấy kỳ quay hiện tại
 * const draw = await client.keno.getCurrentDraw();
 *
 * // Đặt cược
 * const bet = await client.keno.placeBet({
 *   drawIds: [draw.currentDraw!.drawId],
 *   boards: [{ boardNo: "A", numbers: ["01", "15", "33", "44", "60"] }],
 * });
 *
 * // Xem danh sách vé
 * const tickets = await client.keno.listTickets({ size: 10 });
 *
 * // Xem chi tiết vé
 * const detail = await client.keno.getTicketEntries(tickets.tickets[0].id);
 * ```
 */
export interface KenoApi {
  /**
   * Lấy cấu hình game Keno cho player.
   *
   * Trả về luật chơi, bảng giải thưởng, giới hạn trả thưởng,
   * và trạng thái tenant (có được phép chơi không).
   * Gọi 1 lần khi khởi động để cache lại cho frontend.
   *
   * **Endpoint:** `GET /games/keno/config`
   *
   * @returns Cấu hình đầy đủ để render UI game Keno
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const config = await client.keno.getGameConfig();
   *
   * // Kiểm tra tenant có được chơi không
   * if (!config.tenant.isEnabled) {
   *   showDisabledMessage();
   *   return;
   * }
   *
   * // Mệnh giá 1 bet
   * console.log(config.game.unitPrice); // 10000
   *
   * // Tra giải: pick5, trùng 3 số
   * console.log(config.prizes.basic[5][3]); // 50000
   *
   * // Tối đa số kỳ liên tiếp
   * console.log(config.game.maxDrawCount); // 20
   * ```
   */
  getGameConfig(): Promise<KenoGameConfigResponse>;

  /**
   * Lấy kỳ quay Keno hiện tại + kết quả gần nhất.
   *
   * Trả về kỳ quay đang mở bán (currentDraw), tất cả kỳ active,
   * và kết quả kỳ quay gần nhất đã settle.
   *
   * **Endpoint:** `GET /games/keno/draws/current`
   *
   * @returns Thông tin kỳ quay hiện tại và danh sách kỳ đang active
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const data = await client.keno.getCurrentDraw();
   *
   * if (data.currentDraw) {
   *   console.log("Kỳ hiện tại:", data.currentDraw.drawId);
   *   console.log("Đóng bán lúc:", data.currentDraw.sales.closeAt);
   * }
   *
   * console.log("Số kỳ đang active:", data.activeDraws.length);
   * ```
   */
  getCurrentDraw(): Promise<KenoCurrentDrawResponse>;

  /**
   * Đặt cược Keno.
   *
   * Gửi request mua vé Keno cho player đã xác thực.
   * Số Keno dạng string zero-padded `"01"` đến `"80"`.
   * Phải có ít nhất 1 board (bao gồm cả board chọn số và cược bổ sung).
   *
   * **Endpoint:** `POST /games/keno/bets`
   *
   * @param input - Thông tin đặt cược
   * @param input.drawIds - Danh sách drawId kỳ quay tham gia (1-30, không trùng)
   * @param input.boards - Boards cược — bao gồm board chọn số (tối đa 2) và cược bổ sung (Lớn/Nhỏ, Chẵn/Lẻ)
   * @returns Thông tin vé vừa tạo gồm ticketId, pricing, balance sau cược, và counts
   *
   * @throws {@link ApiClientError} code `INSUFFICIENT_BALANCE` — không đủ số dư
   * @throws {@link ApiClientError} code `DRAW_CLOSED` — kỳ quay đã đóng bán
   * @throws {@link ApiClientError} code `VALIDATION_ERROR` — input không hợp lệ
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * // Cược cơ bản: chọn 5 số, 1 kỳ
   * const result = await client.keno.placeBet({
   *   drawIds: ["2026-02-25.001"],
   *   boards: [
   *     { boardNo: "A", numbers: ["01", "15", "33", "44", "60"] },
   *   ],
   * });
   * console.log(result.ticketNo);            // "KENO-20260307-00001"
   * console.log(result.pricing.totalAmount);  // 10000
   * console.log(result.balance);              // 990000
   *
   * // Cược nhiều kỳ + cược bổ sung
   * const result2 = await client.keno.placeBet({
   *   drawIds: ["2026-02-25.001", "2026-02-25.002", "2026-02-25.003"],
   *   boards: [
   *     { boardNo: "A", numbers: ["01", "15", "33"] },
   *     { boardNo: "B", numbers: ["22", "44", "66", "77"] },
   *     { playType: "bigSmall", bet: "big" },
   *     { playType: "evenOdd", bet: "even" },
   *   ],
   * });
   * console.log(result2.entryCount); // 3
   * ```
   */
  placeBet(input: KenoTicketPurchaseInput): Promise<KenoPlaceBetResponse>;

  /**
   * Lấy danh sách vé Keno đang chờ xử lý.
   *
   * Trả về các vé mà kỳ quay chưa kết thúc hoặc chưa settle xong.
   * Hỗ trợ phân trang cursor-based và lọc theo ngày cược.
   *
   * **Endpoint:** `GET /games/keno/tickets/pending`
   *
   * @param params - Tham số phân trang và lọc ngày (tùy chọn)
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * // Lấy trang đầu
   * const page1 = await client.keno.listPendingTickets({ size: 10 });
   * console.log(page1.tickets.length); // tối đa 10
   *
   * // Lọc theo ngày cược
   * const filtered = await client.keno.listPendingTickets({
   *   size: 10,
   *   from: "2026-03-01",
   *   to: "2026-03-05",
   * });
   *
   * // Lấy trang tiếp theo
   * if (page1.nextCursor) {
   *   const page2 = await client.keno.listPendingTickets({
   *     size: 10,
   *     cursor: page1.nextCursor,
   *   });
   * }
   * ```
   */
  listPendingTickets(params?: KenoListTicketsParams): Promise<KenoListTicketsResponse>;

  /**
   * Lấy danh sách tất cả vé Keno (pending + completed).
   *
   * Trả về cả vé đang chờ xử lý và vé đã hoàn thành (settled, refunded, void).
   * Sắp xếp theo ngày cược (mới nhất trước). Hỗ trợ lọc theo khoảng ngày cược.
   *
   * **Endpoint:** `GET /games/keno/tickets`
   *
   * @param params - Tham số truy vấn: phân trang, lọc ngày
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * // Lấy tất cả vé
   * const result = await client.keno.listTickets({ size: 20 });
   *
   * // Lọc theo khoảng thời gian
   * const feb = await client.keno.listTickets({
   *   from: "2026-02-01",
   *   to: "2026-02-28",
   * });
   *
   * for (const ticket of feb.tickets) {
   *   const win = ticket.settlement?.totalWinAmount ?? 0;
   *   console.log(`${ticket.ticketNo}: thắng ${win} VND`);
   * }
   * ```
   */
  listTickets(params?: KenoListAllTicketsParams): Promise<KenoListTicketsResponse>;

  /**
   * Lấy chi tiết vé Keno + tất cả entries theo kỳ quay.
   *
   * Mỗi entry chứa thông tin cược, kết quả kỳ quay (nếu đã quay),
   * và chi tiết trả thưởng (nếu đã settle).
   *
   * **Endpoint:** `GET /games/keno/tickets/{ticketId}/entries`
   *
   * @param ticketId - ID vé Keno (MongoDB ObjectId string)
   * @returns Thông tin vé kèm danh sách entries
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — vé không tồn tại hoặc không thuộc player
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const data = await client.keno.getTicketEntries("65abc123def456...");
   *
   * console.log(data.ticket.ticketNo); // "KENO-20260307-00001"
   * console.log(data.entries.length);   // 5 (mua 5 kỳ = 5 entries)
   *
   * for (const entry of data.entries) {
   *   console.log(`Kỳ ${entry.drawId}: ${entry.status}`);
   *
   *   if (entry.result) {
   *     console.log("  Kết quả:", entry.result.winningNumbers);
   *   }
   *   if (entry.payout) {
   *     console.log(`  Thắng: ${entry.payout.winAmount} VND`);
   *     for (const bp of entry.payout.boardPayouts) {
   *       console.log(`    Board ${bp.boardNo}: ${bp.matchCount}/${bp.pickCount} trùng`);
   *     }
   *   }
   * }
   * ```
   */
  getTicketEntries(ticketId: string): Promise<KenoTicketEntriesResponse>;

  /**
   * Lấy danh sách kết quả kỳ quay Keno đã settle.
   *
   * Hỗ trợ phân trang cursor-based và lọc theo ngày bắt đầu.
   * Chỉ trả về kỳ quay đã settle có kết quả.
   *
   * **Endpoint:** `GET /games/keno/draw-results`
   *
   * @param params - Tham số phân trang và lọc ngày
   * @returns Danh sách kết quả kỳ quay kèm cursor
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const page1 = await client.keno.listDrawResults({ size: 10 });
   * for (const draw of page1.draws) {
   *   console.log(`Kỳ ${draw.drawId}: ${draw.result.winningNumbers.join(", ")}`);
   *   console.log(`Chẵn: ${draw.result.evenCount}, Lẻ: ${draw.result.oddCount}`);
   * }
   * ```
   */
  listDrawResults(params?: KenoListDrawResultsParams): Promise<KenoListDrawResultsResponse>;

  /**
   * Lấy chi tiết kết quả 1 kỳ quay Keno.
   *
   * Trả về 20 số trúng, stats, và bảng giải thưởng thống nhất với số lượng người trúng.
   *
   * **Endpoint:** `GET /games/keno/draw-results/{drawId}`
   *
   * @param drawId - ID kỳ quay (format `YYYY-MM-DD.NNN`)
   * @returns Chi tiết kết quả kỳ quay
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — kỳ quay không tồn tại hoặc chưa settle
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const draw = await client.keno.getDrawResult("2026-03-07.050");
   * console.log(draw.result.winningNumbers); // ["02", "10", ...]
   * for (const prize of draw.prizes) {
   *   if (prize.pickCount !== undefined) {
   *     console.log(`Pick${prize.pickCount} trúng ${prize.matchCount}: ${prize.winnerCount} bộ`);
   *   } else {
   *     console.log(`${prize.playType} ${prize.bet}: ${prize.winnerCount} bộ`);
   *   }
   * }
   * ```
   */
  getDrawResult(drawId: string): Promise<KenoDrawResultDetail>;
}

// ─────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────

/** @internal */
export function createKenoApi(http: HttpClient): KenoApi {
  return {
    async getGameConfig(): Promise<KenoGameConfigResponse> {
      return http.get<KenoGameConfigResponse>(ENDPOINTS.keno.getGameConfig);
    },

    async getCurrentDraw(): Promise<KenoCurrentDrawResponse> {
      return http.get<KenoCurrentDrawResponse>(ENDPOINTS.keno.getCurrentDraw);
    },

    async placeBet(input: KenoTicketPurchaseInput): Promise<KenoPlaceBetResponse> {
      return http.post<KenoPlaceBetResponse>(ENDPOINTS.keno.placeBet, input);
    },

    async listPendingTickets(params?: KenoListTicketsParams): Promise<KenoListTicketsResponse> {
      return http.get<KenoListTicketsResponse>(ENDPOINTS.keno.listPendingTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },

    async listTickets(params?: KenoListAllTicketsParams): Promise<KenoListTicketsResponse> {
      return http.get<KenoListTicketsResponse>(ENDPOINTS.keno.listTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },

    async getTicketEntries(ticketId: string): Promise<KenoTicketEntriesResponse> {
      return http.get<KenoTicketEntriesResponse>(ENDPOINTS.keno.getTicketEntries(ticketId));
    },

    async listDrawResults(
      params?: KenoListDrawResultsParams,
    ): Promise<KenoListDrawResultsResponse> {
      return http.get<KenoListDrawResultsResponse>(ENDPOINTS.keno.listDrawResults, {
        params: params as Record<string, string | number | undefined>,
      });
    },

    async getDrawResult(drawId: string): Promise<KenoDrawResultDetail> {
      return http.get<KenoDrawResultDetail>(ENDPOINTS.keno.getDrawResult(drawId));
    },
  };
}

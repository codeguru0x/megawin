/**
 * Lotto 5/35 API Module
 *
 * Tất cả API liên quan đến game Lotto 5/35.
 *
 * @module
 */

import { ENDPOINTS } from "../endpoints";
import type { HttpClient } from "../http-client";
import type {
  Lotto535ComboPopularityParams,
  Lotto535ComboPopularityResponse,
  Lotto535CurrentDrawResponse,
  Lotto535DrawInfo,
  Lotto535DrawResultDetail,
  Lotto535DrawResultSummary,
  Lotto535EntryLinesResponse,
  Lotto535EntryResult,
  Lotto535GameConfigResponse,
  Lotto535JackpotResponse,
  Lotto535ListAllTicketsParams,
  Lotto535ListDrawResultsParams,
  Lotto535ListDrawResultsResponse,
  Lotto535ListTicketsParams,
  Lotto535ListTicketsResponse,
  Lotto535PlaceBetResponse,
  Lotto535TicketEntriesResponse,
  Lotto535TicketPurchaseInput,
  Lotto535TicketSummary,
} from "../lotto535";

/**
 * Lotto 5/35 API — các thao tác liên quan đến game Lotto 5/35.
 *
 * Truy cập qua `client.lotto535`.
 *
 * @example
 * ```ts
 * import { createPlayerClient } from "@megawin/player-sdk";
 * import type { Lotto535TicketPurchaseInput } from "@megawin/player-sdk/lotto535";
 *
 * const client = createPlayerClient({
 *   baseUrl: "https://api.domain.com",
 *   tokens: tokensFromServer,
 * });
 *
 * // Lấy kỳ quay hiện tại + Jackpot
 * const draw = await client.lotto535.getCurrentDraw();
 * const jackpot = await client.lotto535.getJackpot();
 *
 * // Đặt cược
 * const bet = await client.lotto535.placeBet({
 *   drawIds: [draw.currentDraw!.drawId],
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
 * // Xem danh sách vé
 * const tickets = await client.lotto535.listTickets({ size: 10 });
 *
 * // Xem chi tiết vé
 * const detail = await client.lotto535.getTicketEntries(tickets.tickets[0].ticketId);
 * ```
 */
export interface Lotto535Api {
  /**
   * Lấy cấu hình game Lotto 5/35 cho player.
   *
   * Trả về luật chơi, bảng giải thưởng, thông tin Jackpot,
   * và trạng thái tenant (có được phép chơi không).
   * Gọi 1 lần khi khởi động để cache lại cho frontend.
   *
   * **Endpoint:** `GET /games/lotto535/config`
   *
   * @returns Cấu hình đầy đủ để render UI game Lotto 5/35
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const config = await client.lotto535.getGameConfig();
   *
   * if (!config.tenant.isEnabled) {
   *   showDisabledMessage();
   *   return;
   * }
   *
   * console.log(config.game.unitPrice);          // 10000
   * console.log(config.prizes.tier1);            // 10000000
   * console.log(config.jackpot.splitThreshold);  // 12000000000
   * ```
   */
  getGameConfig(): Promise<Lotto535GameConfigResponse>;

  /**
   * Lấy kỳ quay Lotto 5/35 hiện tại.
   *
   * Trả về kỳ quay đang mở bán (currentDraw) và tất cả kỳ active.
   *
   * **Endpoint:** `GET /games/lotto535/draws/current`
   *
   * @returns Thông tin kỳ quay hiện tại và danh sách kỳ active
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const data = await client.lotto535.getCurrentDraw();
   *
   * if (data.currentDraw) {
   *   console.log("Kỳ hiện tại:", data.currentDraw.drawId);
   *   console.log("Jackpot:", data.currentDraw.jackpotAmount);
   *   console.log("Đóng bán lúc:", data.currentDraw.salesCloseAt);
   * }
   *
   * console.log("Số kỳ đang active:", data.activeDraws.length);
   * ```
   */
  getCurrentDraw(): Promise<Lotto535CurrentDrawResponse>;

  /**
   * Lấy giá trị Jackpot Lotto 5/35 hiện tại.
   *
   * Giá trị Jackpot tích lũy — tăng theo doanh thu bán vé,
   * reset khi có người trúng Jackpot.
   *
   * **Endpoint:** `GET /games/lotto535/jackpot`
   *
   * @returns Giá trị Jackpot hiện tại (VND)
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const data = await client.lotto535.getJackpot();
   * console.log(`Jackpot: ${data.jackpotAmount.toLocaleString()} VND`);
   * // "Jackpot: 12,000,000,000 VND"
   * ```
   */
  getJackpot(): Promise<Lotto535JackpotResponse>;

  /**
   * Đặt cược Lotto 5/35.
   *
   * Gửi request mua vé Lotto 5/35 cho player đã xác thực.
   * Số chính dạng string `"01"` đến `"35"`, số đặc biệt `"01"` đến `"12"`.
   *
   * **Endpoint:** `POST /games/lotto535/bets`
   *
   * @param input - Thông tin đặt cược
   * @param input.drawIds - Danh sách drawId các kỳ tham gia. Format mỗi ID: `YYYY-MM-DD.NNN`
   * @param input.boards - Danh sách boards (tối đa 5, không trùng boardNo)
   * @returns Thông tin vé vừa tạo gồm ticketId, ticketNo, totalAmount, balance sau cược
   *
   * @throws {@link ApiClientError} code `INSUFFICIENT_BALANCE` — không đủ số dư
   * @throws {@link ApiClientError} code `DRAW_CLOSED` — kỳ quay đã đóng bán
   * @throws {@link ApiClientError} code `VALIDATION_ERROR` — input không hợp lệ
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * // Vé Standard: 5 số chính + 1 số đặc biệt, 1 kỳ
   * const result = await client.lotto535.placeBet({
   *   drawIds: ["2026-03-05.001"],
   *   boards: [{
   *     boardNo: "A",
   *     playType: "standard",
   *     selection: {
   *       mainNumbers: ["01", "08", "15", "22", "35"],
   *       specialNumbers: ["07"],
   *     },
   *   }],
   * });
   * console.log(result.ticketNo);    // "L535-20260307-00008"
   * console.log(result.totalAmount); // 30000
   * console.log(result.balance);     // 970000
   *
   * // Vé Bao (MainCover): 8 số chính + 1 số đặc biệt, 3 kỳ
   * const result2 = await client.lotto535.placeBet({
   *   drawIds: ["2026-03-05.001", "2026-03-12.001", "2026-03-19.001"],
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
   * console.log(result2.totalAmount); // 186000
   * ```
   */
  placeBet(input: Lotto535TicketPurchaseInput): Promise<Lotto535PlaceBetResponse>;

  /**
   * Lấy danh sách vé Lotto 5/35 đang chờ xử lý.
   *
   * Trả về các vé mà chưa settle xong tất cả kỳ quay.
   * Hỗ trợ phân trang cursor-based.
   *
   * **Endpoint:** `GET /games/lotto535/tickets/pending`
   *
   * @param params - Tham số phân trang (tùy chọn)
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const page1 = await client.lotto535.listPendingTickets({ size: 10 });
   * console.log(page1.tickets.length); // tối đa 10
   *
   * if (page1.nextCursor) {
   *   const page2 = await client.lotto535.listPendingTickets({
   *     size: 10,
   *     cursor: page1.nextCursor,
   *   });
   * }
   * ```
   */
  listPendingTickets(params?: Lotto535ListTicketsParams): Promise<Lotto535ListTicketsResponse>;

  /**
   * Lấy danh sách tất cả vé Lotto 5/35 (pending + completed).
   *
   * Trả về cả vé đang chờ và vé đã hoàn thành.
   * Sắp xếp theo ngày cược (mới nhất trước). Hỗ trợ lọc theo khoảng ngày.
   *
   * **Endpoint:** `GET /games/lotto535/tickets`
   *
   * @param params - Tham số truy vấn: phân trang, lọc ngày
   * @returns Danh sách vé kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * // Lấy tất cả vé
   * const result = await client.lotto535.listTickets({ size: 20 });
   *
   * // Lọc theo khoảng thời gian
   * const march = await client.lotto535.listTickets({
   *   from: "2026-03-01",
   *   to: "2026-03-31",
   * });
   *
   * for (const ticket of march.tickets) {
   *   const win = ticket.totalWinAmount ?? 0;
   *   console.log(`${ticket.ticketNo}: thắng ${win} VND`);
   * }
   * ```
   */
  listTickets(params?: Lotto535ListAllTicketsParams): Promise<Lotto535ListTicketsResponse>;

  /**
   * Lấy chi tiết vé Lotto 5/35 + tất cả entries theo kỳ quay.
   *
   * Mỗi entry chứa thông tin cược, kết quả kỳ quay (nếu đã quay),
   * và chi tiết trả thưởng theo hạng giải (nếu đã settle).
   *
   * **Endpoint:** `GET /games/lotto535/tickets/{ticketId}/entries`
   *
   * @param ticketId - ID vé Lotto 5/35
   * @returns Thông tin vé kèm danh sách entries
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — vé không tồn tại hoặc không thuộc player
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const data = await client.lotto535.getTicketEntries("TKT-L01...");
   *
   * console.log(data.ticket.ticketNo); // "L535-20260307-00008"
   * console.log(data.entries.length);   // 3 (mua 3 kỳ = 3 entries)
   *
   * for (const entry of data.entries) {
   *   console.log(`Kỳ ${entry.drawId}: ${entry.status}`);
   *
   *   if (entry.result) {
   *     console.log("  Số chính:", entry.result.winningMain);
   *     console.log("  Số ĐB:", entry.result.winningSpecial);
   *   }
   *   if (entry.payout) {
   *     console.log(`  Thắng: ${entry.payout.winAmount} VND`);
   *     for (const tier of entry.payout.tiers) {
   *       console.log(`    ${tier.label}: ${tier.hitCount} line, ${tier.amount} VND`);
   *     }
   *   }
   * }
   * ```
   */
  getTicketEntries(ticketId: string): Promise<Lotto535TicketEntriesResponse>;

  /**
   * Lấy chi tiết các lines mở rộng của entry (dùng cho vé bao).
   *
   * Với play type `standard`, chỉ có 1 line.
   * Với `mainCover`, số lines = C(N, 5) — ví dụ chọn 8 số → 56 lines.
   * Với `specialCover`, số lines = số đặc biệt đã chọn.
   *
   * **Endpoint:** `GET /games/lotto535/entries/{entryId}/lines`
   *
   * @param entryId - ID entry
   * @returns Danh sách lines mở rộng
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — entry không tồn tại hoặc không thuộc player
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const data = await client.lotto535.getEntryLines("ENT-001...");
   * console.log(`${data.lines.length} lines`);
   *
   * for (const line of data.lines) {
   *   const main = line.mainNumbers.join(", ");
   *   console.log(`Chính: [${main}], ĐB: ${line.specialNumber}`);
   * }
   * ```
   */
  getEntryLines(entryId: string): Promise<Lotto535EntryLinesResponse>;

  /**
   * Lấy danh sách kết quả kỳ quay Lotto 5/35 đã settle.
   *
   * Chỉ trả các kỳ đã settle có kết quả.
   * Hỗ trợ lọc từ ngày và phân trang cursor-based.
   *
   * **Endpoint:** `GET /games/lotto535/draw-results`
   *
   * @param params - Tham số truy vấn: from, size, cursor
   * @returns Danh sách kết quả kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const results = await client.lotto535.listDrawResults({
   *   from: "2026-03-01",
   *   size: 10,
   * });
   *
   * for (const draw of results.draws) {
   *   console.log(`Kỳ ${draw.drawId}:`);
   *   console.log(`  Số: ${draw.result.winningMain.join(", ")} + ${draw.result.winningSpecial}`);
   *   console.log(`  JP: ${draw.jackpot.closingAmount.toLocaleString()} VND`);
   *   for (const prize of draw.prizes) {
   *     console.log(`  ${prize.tier}: ${prize.winnerCount} người, ${prize.prizeAmount} VND`);
   *   }
   * }
   * ```
   */
  listDrawResults(params?: Lotto535ListDrawResultsParams): Promise<Lotto535ListDrawResultsResponse>;

  /**
   * Lấy chi tiết kết quả 1 kỳ quay Lotto 5/35.
   *
   * Trả kết quả quay, jackpot snapshot, và bảng giải thưởng chi tiết.
   *
   * **Endpoint:** `GET /games/lotto535/draw-results/{drawId}`
   *
   * @param drawId - Mã kỳ quay (format: YYYY-MM-DD.NNN)
   * @returns Chi tiết kết quả kỳ quay
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — draw không tồn tại hoặc chưa settle
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const result = await client.lotto535.getDrawResult("2026-03-05.001");
   * console.log(`Số chính: ${result.result.winningMain.join(", ")}`);
   * console.log(`Số ĐB: ${result.result.winningSpecial}`);
   * console.log(`Jackpot cuối kỳ: ${result.jackpot.closingAmount.toLocaleString()} VND`);
   * ```
   */
  getDrawResult(drawId: string): Promise<Lotto535DrawResultDetail>;

  /**
   * Kiểm tra độ đông + mẫu số chia Jackpot cho bộ số bạn ĐÃ cược (minh bạch chia thưởng).
   *
   * **Ownership-gate:** chỉ tra được bộ số CHÍNH BẠN đã cược trong kỳ. Bộ chưa cược —
   * hoặc bộ chưa ai chơi — trả về y hệt `{ found: false }`, không phân biệt 2 trường hợp.
   *
   * Khi tra ĐÚNG bộ CHUẨN (5 chính + 1 ĐB), response còn trả `jackpotUnits` (mẫu số chia
   * Jackpot thật nếu bộ đó trúng) và `splitEligibleDraw` (mô tả — không phải con số dự
   * tính — cơ chế chia Jackpot khi không ai trúng, xem JSDoc {@link Lotto535ComboPopularityResponse}).
   *
   * **Endpoint:** `GET /games/lotto535/draws/{drawId}/combo-popularity`
   *
   * @param params - `drawId` + bộ số (`numbers` 4-15 số chính, `specials` 1-12 số ĐB)
   * @returns Độ đông (`sets`), giá board, và (nếu bộ chuẩn) mẫu số chia Jackpot + cờ split
   *
   * @throws {@link ApiClientError} code `VALIDATION_ERROR` — số lượng không khớp playType nào
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * // Tra bộ chuẩn bạn đã cược — có jackpotUnits nếu sở hữu
   * const res = await client.lotto535.getComboPopularity({
   *   drawId: "2026-03-07.001",
   *   numbers: ["01", "08", "15", "22", "35"],
   *   specials: ["07"],
   * });
   *
   * if (res.found) {
   *   console.log(`${res.sets} bộ đang cược combo này`);
   *   if (res.jackpotUnits) {
   *     console.log(`Nếu trúng JP, chia cho ${res.jackpotUnits} đơn vị`);
   *   }
   * } else {
   *   // Bạn chưa cược bộ này, hoặc bộ chưa ai chơi — không phân biệt.
   *   console.log("Không có dữ liệu cho bộ này.");
   * }
   *
   * // Tra bộ bao (mainCover9) — không có jackpotUnits (không phải bộ chuẩn)
   * const cover = await client.lotto535.getComboPopularity({
   *   drawId: "2026-03-07.001",
   *   numbers: ["01", "05", "10", "15", "20", "25", "30", "33", "35"],
   *   specials: ["07"],
   * });
   * console.log(cover.boardPrice); // 1.260.000 (C(9,5) × 10.000)
   * ```
   */
  getComboPopularity(params: Lotto535ComboPopularityParams): Promise<Lotto535ComboPopularityResponse>;
}

// ─────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────

/** @internal */
export function createLotto535Api(http: HttpClient): Lotto535Api {
  return {
    async getGameConfig(): Promise<Lotto535GameConfigResponse> {
      return http.get<Lotto535GameConfigResponse>(ENDPOINTS.lotto535.getGameConfig);
    },

    async getCurrentDraw(): Promise<Lotto535CurrentDrawResponse> {
      return http.get<Lotto535CurrentDrawResponse>(ENDPOINTS.lotto535.getCurrentDraw);
    },

    async getJackpot(): Promise<Lotto535JackpotResponse> {
      return http.get<Lotto535JackpotResponse>(ENDPOINTS.lotto535.getJackpot);
    },

    async placeBet(input: Lotto535TicketPurchaseInput): Promise<Lotto535PlaceBetResponse> {
      return http.post<Lotto535PlaceBetResponse>(ENDPOINTS.lotto535.placeBet, input);
    },

    async listPendingTickets(params?: Lotto535ListTicketsParams): Promise<Lotto535ListTicketsResponse> {
      return http.get<Lotto535ListTicketsResponse>(ENDPOINTS.lotto535.listPendingTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },

    async listTickets(params?: Lotto535ListAllTicketsParams): Promise<Lotto535ListTicketsResponse> {
      return http.get<Lotto535ListTicketsResponse>(ENDPOINTS.lotto535.listTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },

    async getTicketEntries(ticketId: string): Promise<Lotto535TicketEntriesResponse> {
      return http.get<Lotto535TicketEntriesResponse>(ENDPOINTS.lotto535.getTicketEntries(ticketId));
    },

    async getEntryLines(entryId: string): Promise<Lotto535EntryLinesResponse> {
      return http.get<Lotto535EntryLinesResponse>(ENDPOINTS.lotto535.getEntryLines(entryId));
    },

    async listDrawResults(params?: Lotto535ListDrawResultsParams): Promise<Lotto535ListDrawResultsResponse> {
      return http.get<Lotto535ListDrawResultsResponse>(ENDPOINTS.lotto535.listDrawResults, {
        params: params as Record<string, string | number | undefined>,
      });
    },

    async getDrawResult(drawId: string): Promise<Lotto535DrawResultDetail> {
      return http.get<Lotto535DrawResultDetail>(ENDPOINTS.lotto535.getDrawResult(drawId));
    },

    async getComboPopularity(params: Lotto535ComboPopularityParams): Promise<Lotto535ComboPopularityResponse> {
      // numbers/specials gửi dạng CSV zero-padded "01,05,..." — handler tự split + validate.
      return http.get<Lotto535ComboPopularityResponse>(ENDPOINTS.lotto535.getComboPopularity(params.drawId), {
        params: { numbers: params.numbers.join(","), specials: params.specials.join(",") },
      });
    },
  };
}

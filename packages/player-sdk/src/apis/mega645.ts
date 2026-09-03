/**
 * Mega 6/45 API Module
 * @module
 */

import { ENDPOINTS } from "../endpoints";
import type { HttpClient } from "../http-client";
import type {
  Mega645ComboPopularityParams,
  Mega645ComboPopularityResponse,
  Mega645CurrentDrawResponse,
  Mega645DrawResultDetail,
  Mega645EntryLinesResponse,
  Mega645GameConfigResponse,
  Mega645JackpotResponse,
  Mega645ListAllTicketsParams,
  Mega645ListDrawResultsParams,
  Mega645ListDrawResultsResponse,
  Mega645ListPendingTicketsParams,
  Mega645ListTicketsResponse,
  Mega645PlaceBetResponse,
  Mega645TicketEntriesResponse,
  Mega645TicketPurchaseInput,
} from "../mega645";

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
   * console.log(jackpot.currentAmount); // 8500000000
   * ```
   */
  getJackpot(): Promise<Mega645JackpotResponse>;

  /**
   * Đặt cược Mega 6/45.
   *
   * **Endpoint:** `POST /games/mega645/bets`
   *
   * @param input - Thông tin vé: drawIds, boards
   * @returns Thông tin vé vừa tạo gồm ticketId, ticketNo, pricing, balance sau cược
   *
   * @throws {@link ApiClientError} code `BAD_REQUEST` — kỳ quay đã đóng bán/không tồn tại, vượt số board/kỳ tối đa, không đủ số dư
   * @throws {@link ApiClientError} code `VALIDATION` — input không đúng schema (số sai range, thiếu field...)
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * import type { Mega645TicketPurchaseInput } from "@megawin/player-sdk/mega645";
   *
   * const result = await client.mega645.placeBet({
   *   drawIds: ["2026-03-07.001"],
   *   boards: [{
   *     boardNo: "A",
   *     playType: "standard",
   *     selection: { numbers: ["05", "12", "22", "31", "40", "45"] },
   *   }],
   * });
   * console.log(result.ticketNo);              // "M645-20260307-00003"
   * console.log(result.pricing.totalAmount);   // 10000
   * console.log(result.balance);                // 990000
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
   * @returns Danh sách entries kèm kết quả/thưởng của vé
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — ticketId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const data = await client.mega645.getTicketEntries("65abc123def456...");
   * console.log(data.entries.length);       // 1 (mua 1 kỳ)
   * console.log(data.entries[0].drawId);    // "2026-03-07.001"
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

  /**
   * Tra độ đông 1 bộ số bạn đã cược trong kỳ — minh bạch chia jackpot.
   *
   * **Endpoint:** `GET /games/mega645/draws/{drawId}/combo-popularity`
   *
   * **Ownership-gate:** chỉ trả `found: true` khi bạn ĐÃ cược đúng bộ số này trong kỳ. Nếu
   * bạn chưa cược (hoặc bộ chưa ai chơi), API trả `{ found: false }` — hai trường hợp cố ý
   * KHÔNG phân biệt để bảo vệ dữ liệu cược của người khác. `found: false` KHÔNG phải lỗi.
   *
   * **`sets` vs `jackpotUnits`:** `sets` là số bộ cùng cược — tín hiệu tham khảo (jackpot chia
   * theo betCount toàn line trúng của kỳ, không phải trực tiếp theo `sets`). `jackpotUnits`
   * CHỈ có khi tra bộ **6 số standard** — là mẫu số chia jackpot.
   *
   * **Tính tiền jackpot TẠM TÍNH:** `Math.floor(currentAmount / jackpotUnits) * betCount` —
   * kết hợp {@link Mega645Api.getJackpot} để lấy `currentAmount`. Đây là con số TẠM TÍNH tại
   * thời điểm tra, pool còn thay đổi đến giờ đóng bán — KHÔNG dùng để cam kết với player,
   * chỉ hiển thị dạng ước tính.
   *
   * @param params - `drawId` + bộ số (5/6/7–15/18 số distinct `"01".."45"`)
   * @returns Độ đông bộ số (`found`, `sets?`, `jackpotUnits?`)
   *
   * @throws {@link ApiClientError} `UNAUTHORIZED` — token thiếu hoặc hết hạn
   *
   * @example
   * ```ts
   * const res = await client.mega645.getComboPopularity({
   *   drawId: "2026-03-08.001",
   *   numbers: ["01", "05", "12", "23", "34", "45"], // standard 6 số
   * });
   *
   * if (res.found) {
   *   console.log(`${res.sets} bộ đang cược cùng bộ số này`);
   *   if (res.jackpotUnits) {
   *     const { currentAmount } = await client.mega645.getJackpot();
   *     const betCount = 2; // số lần cược của board này
   *     const soTienTamTinh = Math.floor(currentAmount / res.jackpotUnits) * betCount;
   *     console.log(`Tạm tính nếu trúng jackpot ngay bây giờ: ${soTienTamTinh} VND`);
   *   }
   * } else {
   *   // Bạn chưa cược bộ này, hoặc chưa ai chơi — không phân biệt.
   *   console.log("Không có dữ liệu cho bộ số này.");
   * }
   * ```
   */
  getComboPopularity(params: Mega645ComboPopularityParams): Promise<Mega645ComboPopularityResponse>;
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
    async getComboPopularity(params) {
      // numbers gửi dạng CSV zero-padded "01,05,..." — handler tự split + validate.
      return http.get<Mega645ComboPopularityResponse>(ENDPOINTS.mega645.getComboPopularity(params.drawId), {
        params: { numbers: params.numbers.join(",") },
      });
    },
  };
}

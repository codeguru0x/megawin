/**
 * Power 6/55 API Module
 * @module
 */

import { ENDPOINTS } from "../endpoints";
import type { HttpClient } from "../http-client";
import type {
  Power655ComboPopularityParams,
  Power655ComboPopularityResponse,
  Power655CurrentDrawResponse,
  Power655DrawInfo,
  Power655DrawResultInfo,
  Power655DrawResultSummary,
  Power655EntryLinesParams,
  Power655EntryLinesResponse,
  Power655EntryResult,
  Power655GameConfigResponse,
  Power655JackpotResponse,
  Power655LineInfo,
  Power655ListAllTicketsParams,
  Power655ListDrawResultsParams,
  Power655ListDrawResultsResponse,
  Power655ListPendingTicketsParams,
  Power655ListTicketsResponse,
  Power655PlaceBetResponse,
  Power655TicketEntriesResponse,
  Power655TicketPurchaseInput,
  Power655TicketSummary,
} from "../power655";

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
   * Mỗi board chọn 6-18 số chính (zero-padded `"01"`-`"55"`).
   * Standard = chọn đúng 6 số, BaoN = chọn N số (N=7-18), sinh C(N,6) lines.
   *
   * **Endpoint:** `POST /games/power655/bets`
   *
   * @param input - Thông tin vé: drawId, drawCount, boards (tối đa 5 boards)
   * @returns Thông tin vé vừa tạo gồm ticketId, ticketNo, totalAmount, balance sau cược
   *
   * @throws {@link ApiClientError} code `INSUFFICIENT_BALANCE` — không đủ số dư
   * @throws {@link ApiClientError} code `DRAW_CLOSED` — kỳ quay đã đóng bán
   * @throws {@link ApiClientError} code `VALIDATION_ERROR` — input không hợp lệ (số sai range, thiếu field, playType không được chấp nhận...)
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
   * console.log(result.balance);     // 990000
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
   *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDrawCount}/${ticket.drawPlan.drawCount} kỳ`);
   * }
   * ```
   */
  listPendingTickets(params?: Power655ListPendingTicketsParams): Promise<Power655ListTicketsResponse>;

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
  listTickets(params?: Power655ListAllTicketsParams): Promise<Power655ListTicketsResponse>;

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
   * console.log(data.entries.length);  // 1
   * for (const entry of data.entries) {
   *   if (entry.result) {
   *     console.log(`Kết quả: ${entry.result.winningMain.join(", ")} | Bonus: ${entry.result.bonusNumber}`);
   *   }
   * }
   * ```
   */
  getTicketEntries(ticketId: string): Promise<Power655TicketEntriesResponse>;

  /**
   * Lấy danh sách lines chi tiết của một entry Power 6/55.
   *
   * Hữu ích khi vé dùng Bao play type (BaoN sinh C(N,6) lines).
   * Kết quả đối chiếu (`matchResult`) có sau khi kỳ quay settle.
   *
   * **Endpoint:** `GET /games/power655/entries/{entryId}/lines`
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
   * const { lines, nextCursor } = await client.power655.getEntryLines("entry-abc...", { size: 50 });
   * for (const line of lines) {
   *   console.log(`Board ${line.boardNo} line #${line.lineIndex}: ${line.main.join(", ")}`);
   *   if (line.matchResult) {
   *     const { mainMatchCount, bonusMatched, tier } = line.matchResult;
   *     console.log(`  Khớp: ${mainMatchCount} số${bonusMatched ? " + bonus" : ""}, giải: ${tier ?? "không"}`);
   *   }
   * }
   * ```
   */
  getEntryLines(entryId: string, params?: Power655EntryLinesParams): Promise<Power655EntryLinesResponse>;

  /**
   * Lấy danh sách kết quả kỳ quay Power 6/55 đã công bố.
   *
   * **Endpoint:** `GET /games/power655/draw-results`
   *
   * @param params - Tham số phân trang và lọc ngày (tùy chọn)
   * @returns Danh sách kết quả kỳ quay kèm cursor cho trang tiếp theo
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { draws } = await client.power655.listDrawResults({ size: 10 });
   * for (const draw of draws) {
   *   const main = draw.result.winningMain.join(", ");
   *   console.log(`[${draw.drawId}] ${main} | Bonus: ${draw.result.bonusNumber}`);
   *   console.log(`  JP1: ${draw.jackpot.closingJackpot1.toLocaleString()} VND`);
   * }
   * ```
   */
  listDrawResults(params?: Power655ListDrawResultsParams): Promise<Power655ListDrawResultsResponse>;

  /**
   * Lấy chi tiết kết quả 1 kỳ quay Power 6/55.
   *
   * **Endpoint:** `GET /games/power655/draw-results/{drawId}`
   *
   * @param drawId - ID kỳ quay. Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.001"`.
   * @returns Chi tiết kỳ quay gồm số quay, Jackpot snapshot, và bảng giải theo 5 hạng
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — kỳ quay chưa settle hoặc drawId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const draw = await client.power655.getDrawResult("2026-03-07.001");
   * const main = draw.result.winningMain.join(", ");
   * console.log(`Kết quả: ${main} | Bonus: ${draw.result.bonusNumber}`);
   * for (const prize of draw.prizes) {
   *   if (prize.winnerCount > 0) {
   *     console.log(`  ${prize.tier}: ${prize.winnerCount} người, ${prize.prizeAmount.toLocaleString()} VND`);
   *   }
   * }
   * ```
   */
  getDrawResult(drawId: string): Promise<Power655DrawResultInfo>;

  /**
   * Tra độ đông 1 bộ số bạn đã cược trong kỳ — minh bạch chia jackpot.
   *
   * **Endpoint:** `GET /games/power655/draws/{drawId}/combo-popularity`
   *
   * **Ownership-gate:** chỉ trả `found: true` khi bạn ĐÃ cược đúng bộ số này trong kỳ. Nếu
   * bạn chưa cược (hoặc bộ chưa ai chơi), API trả `{ found: false }` — hai trường hợp cố ý
   * KHÔNG phân biệt để bảo vệ dữ liệu cược của người khác. `found: false` KHÔNG phải lỗi.
   *
   * **`sets` vs `jackpotUnits`:** `sets` là số bộ cùng cược — tín hiệu tham khảo (jackpot chia
   * theo betCount toàn line trúng của kỳ, không phải trực tiếp theo `sets`). `jackpotUnits`
   * CHỈ có khi tra bộ **6 số standard** — là mẫu số chia **Jackpot 1** (6/6). KHÔNG áp dụng
   * cho Jackpot 2 (5/6 + bonus).
   *
   * **Tính tiền jackpot TẠM TÍNH:** `Math.floor(jackpot1CurrentAmount / jackpotUnits) *
   * betCount` — kết hợp {@link Power655Api.getJackpot} để lấy `jackpot1CurrentAmount`.
   * Đây là con số TẠM TÍNH tại thời điểm tra, pool còn thay đổi đến giờ đóng bán — KHÔNG
   * dùng để cam kết với player, chỉ hiển thị dạng ước tính.
   *
   * @param params - `drawId` + bộ số (5/6/7–15/18 số distinct `"01".."55"`)
   * @returns Độ đông bộ số (`found`, `sets?`, `jackpotUnits?`)
   *
   * @throws {@link ApiClientError} `UNAUTHORIZED` — token thiếu hoặc hết hạn
   *
   * @example
   * ```ts
   * const res = await client.power655.getComboPopularity({
   *   drawId: "2026-03-08.001",
   *   numbers: ["01", "05", "12", "23", "34", "45"], // standard 6 số
   * });
   *
   * if (res.found) {
   *   console.log(`${res.sets} bộ đang cược cùng bộ số này`);
   *   if (res.jackpotUnits) {
   *     const { jackpot1CurrentAmount } = await client.power655.getJackpot();
   *     const betCount = 2; // số lần cược của board này
   *     const soTienTamTinh = Math.floor(jackpot1CurrentAmount / res.jackpotUnits) * betCount;
   *     console.log(`Tạm tính nếu trúng Jackpot 1 ngay bây giờ: ${soTienTamTinh} VND`);
   *   }
   * } else {
   *   // Bạn chưa cược bộ này, hoặc chưa ai chơi — không phân biệt.
   *   console.log("Không có dữ liệu cho bộ số này.");
   * }
   * ```
   */
  getComboPopularity(params: Power655ComboPopularityParams): Promise<Power655ComboPopularityResponse>;
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
    async getEntryLines(entryId, params) {
      return http.get<Power655EntryLinesResponse>(ENDPOINTS.power655.getEntryLines(entryId), {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async listDrawResults(params) {
      return http.get<Power655ListDrawResultsResponse>(ENDPOINTS.power655.listDrawResults, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getDrawResult(drawId) {
      return http.get<Power655DrawResultInfo>(ENDPOINTS.power655.getDrawResult(drawId));
    },
    async getComboPopularity(params) {
      // numbers gửi dạng CSV zero-padded "01,05,..." — handler tự split + validate.
      return http.get<Power655ComboPopularityResponse>(ENDPOINTS.power655.getComboPopularity(params.drawId), {
        params: { numbers: params.numbers.join(",") },
      });
    },
  };
}

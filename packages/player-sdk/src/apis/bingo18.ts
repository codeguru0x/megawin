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
} from "../bingo18";
import { ENDPOINTS } from "../endpoints";

/**
 * Tham số phân trang cho danh sách vé Bingo 18 đang chờ xử lý.
 *
 * Cursor-based pagination. Không hỗ trợ lọc ngày — chỉ trả vé đang active.
 *
 * @example
 * ```ts
 * const page1 = await client.bingo18.listPendingTickets({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.bingo18.listPendingTickets({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Bingo18ListPendingTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
}

/**
 * Tham số lọc và phân trang cho lịch sử vé Bingo 18 (tất cả trạng thái).
 *
 * Hỗ trợ lọc theo khoảng ngày đặt cược (giờ Việt Nam).
 *
 * @example
 * ```ts
 * const march = await client.bingo18.listTickets({
 *   from: "2026-03-01",
 *   to: "2026-03-31",
 * });
 *
 * if (march.nextCursor) {
 *   const page2 = await client.bingo18.listTickets({
 *     size: 20,
 *     cursor: march.nextCursor,
 *   });
 * }
 * ```
 */
export interface Bingo18ListAllTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
  /** Lọc từ ngày đặt cược (YYYY-MM-DD). */
  from?: string;
  /** Lọc đến ngày đặt cược (YYYY-MM-DD). */
  to?: string;
}

/**
 * Tham số phân trang cho danh sách kết quả kỳ quay Bingo 18.
 *
 * Bingo 18 có ~240 kỳ quay/ngày (mỗi 6 phút), nên cần phân trang cẩn thận.
 *
 * @example
 * ```ts
 * // Lấy 20 kết quả gần nhất hôm nay
 * const page1 = await client.bingo18.listDrawResults({ size: 20 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.bingo18.listDrawResults({
 *     size: 20,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Bingo18ListDrawResultsParams {
  /** Số lượng kỳ mỗi trang (mặc định 20). */
  size?: number;
  /**
   * Lọc kết quả từ ngày này trở về quá khứ (YYYY-MM-DD).
   * Mặc định: ngày hôm nay (giờ Việt Nam).
   */
  from?: string;
  /**
   * Cursor cho trang tiếp theo.
   * Là drawId của kỳ cuối cùng trong trang trước. Format `YYYY-MM-DD.NNN`.
   */
  cursor?: string;
}

/**
 * Response khi đặt cược Bingo 18 thành công.
 *
 * Trả về bởi {@link Bingo18Api.placeBet}.
 */
export interface Bingo18PlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. VD: `"B18-20260307-00007"`. */
  ticketNo: string;
  /** Tổng tiền cược (VND). */
  totalAmount: number;
}

/**
 * Thông tin kỳ quay Bingo 18 hiện tại và kết quả gần nhất.
 *
 * Trả về bởi {@link Bingo18Api.getCurrentDraw}.
 */
export interface Bingo18CurrentDrawResponse {
  /** Kỳ quay đang mở bán, hoặc `null` nếu chưa có. */
  currentDraw: Bingo18DrawInfo | null;
  /** Tất cả kỳ quay đang active. */
  activeDraws: Bingo18DrawInfo[];
  /** Kết quả kỳ quay gần nhất đã công bố, hoặc `null`. */
  lastResult: {
    /** ID kỳ quay. Format `YYYY-MM-DD.NNN`. */
    drawId: string;
    /** Ngày kỳ quay (YYYY-MM-DD). */
    drawDate: string;
    /** Số thứ tự trong ngày. */
    drawNo: number;
    /**
     * 3 giá trị xúc xắc (mỗi giá trị 1-6).
     * VD: `[3, 5, 6]`.
     */
    numbers: number[];
    /**
     * Tổng 3 xúc xắc (3-18).
     * VD: `14`.
     */
    sum: number;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  } | null;
}

/**
 * Danh sách vé Bingo 18 (cursor-based).
 *
 * Trả về bởi {@link Bingo18Api.listPendingTickets} và {@link Bingo18Api.listTickets}.
 */
export interface Bingo18ListTicketsResponse {
  /** Danh sách vé trong trang hiện tại. */
  tickets: Bingo18TicketSummary[];
  /** Cursor để lấy trang tiếp theo, `null` nếu đã hết. */
  nextCursor: string | null;
  /** Số vé thực tế trả về. */
  size: number;
}

/**
 * Chi tiết vé và các lần tham gia kỳ quay của vé Bingo 18.
 *
 * Trả về bởi {@link Bingo18Api.getTicketEntries}.
 */
export interface Bingo18TicketEntriesResponse {
  /** Thông tin tóm tắt vé. */
  ticket: Bingo18TicketSummary;
  /** Danh sách entries (1 entry = 1 kỳ quay). */
  entries: Array<{
    /** ID entry. */
    id: string;
    /** ID kỳ quay. Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.095"`. */
    drawId: string;
    /** Ngày kỳ quay (YYYY-MM-DD). */
    drawDate: string;
    /** Trạng thái entry. */
    status: string;
    /** Tiền cược cho entry này (VND). */
    amount: number;
    /** Số lượng board + side bet trong entry. */
    betCount: number;
    /** Kết quả quay số (chỉ có sau khi kỳ quay đã công bố). */
    result?: {
      /**
       * 3 giá trị xúc xắc (mỗi giá trị 1-6).
       * VD: `[3, 5, 6]`.
       */
      numbers: number[];
      /**
       * Tổng 3 xúc xắc (3-18).
       * VD: `14`.
       */
      sum: number;
      /** Thời điểm công bố kết quả (ISO 8601). */
      publishedAt: string;
    };
    /** Kết quả trúng thưởng của entry. */
    outcome?: string;
    /** Thông tin trả thưởng (chỉ có nếu trúng). */
    payout?: {
      /** Tổng tiền thắng (VND). */
      winAmount: number;
      /** Tổng tiền thực nhận sau các khoản khấu trừ (VND). */
      payoutAmount: number;
      /** Chi tiết thưởng theo từng board chính. */
      boardPayouts: Array<{
        /** Ký hiệu board. VD: `"A"`. */
        boardNo: string;
        /**
         * Kiểu chơi.
         * `"singleNum"` | `"doubleMatch"` | `"tripleMatch"`.
         */
        playType: string;
        /** Số lần trùng (1-3). */
        matchCount: number;
        /** Tiền thắng của board này (VND). */
        winAmount: number;
      }>;
      /** Chi tiết thưởng theo từng side bet. */
      sideBetPayouts: Array<{
        /**
         * Kiểu side bet.
         * `"sumTotal"` | `"bigSmallDraw"`.
         */
        playType: string;
        /** Tổng các số kết quả (cho loại `sumTotal`). */
        sum?: number;
        /** Lựa chọn Tài/Xỉu/Hoà (cho loại `bigSmallDraw`). */
        bet?: string;
        /** Kết quả thực tế. */
        outcome: string;
        /** Có trúng hay không. */
        isWin: boolean;
        /** Tiền thắng (VND). */
        winAmount: number;
      }>;
    };
  }>;
}

/**
 * Danh sách kết quả kỳ quay Bingo 18 (cursor-based).
 *
 * Trả về bởi {@link Bingo18Api.listDrawResults}.
 */
export interface Bingo18ListDrawResultsResponse {
  /** Danh sách kết quả kỳ quay trong trang hiện tại. */
  draws: Bingo18DrawResultSummary[];
  /**
   * Cursor để lấy trang tiếp theo, `null` nếu đã hết.
   * Là `drawId` của kỳ cuối cùng trong trang này. Format `YYYY-MM-DD.NNN`.
   */
  nextCursor: string | null;
  /** Số kỳ quay thực tế trả về. */
  size: number;
}

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
   * @returns Kỳ quay hiện tại, danh sách kỳ active, và kết quả kỳ gần nhất
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { currentDraw, lastResult } = await client.bingo18.getCurrentDraw();
   * if (currentDraw) {
   *   console.log(currentDraw.drawId); // "2026-03-07.095"
   * }
   * if (lastResult) {
   *   console.log(`Số: ${lastResult.numbers.join(", ")} — Tổng: ${lastResult.sum}`);
   * }
   * ```
   */
  getCurrentDraw(): Promise<Bingo18CurrentDrawResponse>;

  /**
   * Đặt cược Bingo 18.
   *
   * Phải có ít nhất 1 board HOẶC 1 side bet.
   * - `boards`: chọn số xúc xắc, đoán bộ đôi/bộ ba
   * - `sideBets`: đoán tổng hoặc Tài/Xỉu/Hoà
   * Tối đa 20 kỳ quay mỗi vé.
   *
   * **Endpoint:** `POST /games/bingo18/bets`
   *
   * @param input - Thông tin vé: drawIds, boards, sideBets
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
   *     { playType: "tripleMatch", kind: "any" },
   *   ],
   *   sideBets: [{ playType: "bigSmallDraw", bet: "big" }],
   * });
   * console.log(result.ticketNo);    // "B18-20260307-00007"
   * console.log(result.totalAmount); // 40000
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
   * Trả về bảng giải 2 phần riêng biệt:
   * - `basicPrizes` — giải cho các loại board (singleNum, doubleMatch, tripleMatch)
   * - `sideBetPrizes` — giải cho side bets (sumTotal, bigSmallDraw)
   *
   * **Endpoint:** `GET /games/bingo18/draw-results/{drawId}`
   *
   * @param drawId - ID kỳ quay. Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.095"`.
   * @returns Chi tiết kỳ quay gồm 3 số xúc xắc và bảng giải
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — kỳ quay chưa settle hoặc drawId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const draw = await client.bingo18.getDrawResult("2026-03-07.095");
   * console.log(`Số: ${draw.result.numbers.join(", ")} — Tổng: ${draw.result.sum}`);
   *
   * for (const prize of draw.basicPrizes) {
   *   console.log(`  ${prize.playType} x${prize.matchCount}: ${prize.winnerCount} lượt, ${prize.prizePerUnit.toLocaleString()} VND/lượt`);
   * }
   * for (const prize of draw.sideBetPrizes) {
   *   const label = prize.sum !== undefined ? `tổng ${prize.sum}` : prize.bet;
   *   console.log(`  ${prize.playType} (${label}): ${prize.winnerCount} lượt`);
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

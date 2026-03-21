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
} from "../max3dpro";
import { ENDPOINTS } from "../endpoints";

/**
 * Tham số phân trang cho danh sách vé Max 3D Pro đang chờ xử lý.
 *
 * Cursor-based pagination. Không hỗ trợ lọc ngày — chỉ trả vé đang active.
 *
 * @example
 * ```ts
 * const page1 = await client.max3dpro.listPendingTickets({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.max3dpro.listPendingTickets({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Max3dproListPendingTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
}

/**
 * Tham số lọc và phân trang cho lịch sử vé Max 3D Pro (tất cả trạng thái).
 *
 * Hỗ trợ lọc theo khoảng ngày đặt cược (giờ Việt Nam).
 *
 * @example
 * ```ts
 * const march = await client.max3dpro.listTickets({
 *   from: "2026-03-01",
 *   to: "2026-03-31",
 * });
 *
 * if (march.nextCursor) {
 *   const page2 = await client.max3dpro.listTickets({
 *     size: 20,
 *     cursor: march.nextCursor,
 *   });
 * }
 * ```
 */
export interface Max3dproListAllTicketsParams {
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
 * Tham số phân trang cho danh sách kết quả kỳ quay Max 3D Pro.
 *
 * @example
 * ```ts
 * const page1 = await client.max3dpro.listDrawResults({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.max3dpro.listDrawResults({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Max3dproListDrawResultsParams {
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
 * Tham số phân trang cho lines của một entry Max 3D Pro.
 */
export interface Max3dproEntryLinesParams {
  /** Số lượng lines mỗi trang (mặc định 50). */
  size?: number;
  /**
   * Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước).
   * Là `lineIndex` (integer) của line cuối trang trước.
   */
  cursor?: number;
}

/**
 * Response khi đặt cược Max 3D Pro thành công.
 *
 * Trả về bởi {@link Max3dproApi.placeBet}.
 */
export interface Max3dproPlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. VD: `"M3DP-20260307-00004"`. */
  ticketNo: string;
  /** Tổng tiền cược (VND). */
  totalAmount: number;
}

/**
 * Thông tin kỳ quay Max 3D Pro hiện tại.
 *
 * Trả về bởi {@link Max3dproApi.getCurrentDraw}.
 */
export interface Max3dproCurrentDrawResponse {
  /** Kỳ quay đang mở bán, hoặc `null` nếu chưa có. */
  currentDraw: Max3dproDrawInfo | null;
  /** Tất cả kỳ quay đang active. */
  activeDraws: Max3dproDrawInfo[];
}

/**
 * Danh sách vé Max 3D Pro (cursor-based).
 *
 * Trả về bởi {@link Max3dproApi.listPendingTickets} và {@link Max3dproApi.listTickets}.
 */
export interface Max3dproListTicketsResponse {
  /** Danh sách vé trong trang hiện tại. */
  tickets: Max3dproTicketSummary[];
  /** Cursor để lấy trang tiếp theo, `null` nếu đã hết. */
  nextCursor: string | null;
  /** Số vé thực tế trả về. */
  size: number;
}

/**
 * Chi tiết vé và các lần tham gia kỳ quay của vé Max 3D Pro.
 *
 * Trả về bởi {@link Max3dproApi.getTicketEntries}.
 */
export interface Max3dproTicketEntriesResponse {
  /** Thông tin tóm tắt vé. */
  ticket: Max3dproTicketSummary;
  /** Danh sách entries (1 entry = 1 kỳ quay). */
  entries: Array<{
    /** ID entry. */
    id: string;
    /** ID kỳ quay. Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.001"`. */
    drawId: string;
    /** Ngày kỳ quay (YYYY-MM-DD). */
    drawDate: string;
    /** Trạng thái entry. */
    status: string;
    /** Tiền cược cho entry này (VND). */
    amount: number;
    /**
     * Kết quả quay số (chỉ có sau khi kỳ quay đã công bố).
     *
     * Max 3D Pro quay ra 20 bộ ba chia thành 4 hạng:
     * - `special` — Giải Đặc Biệt
     * - `first`   — Giải Nhất
     * - `second`  — Giải Nhì
     * - `third`   — Giải Ba
     *
     * Mỗi hạng là mảng bộ ba số string `"000"`-`"999"`.
     */
    result?: {
      /** Các bộ ba Giải Đặc Biệt. */
      special: string[];
      /** Các bộ ba Giải Nhất. */
      first: string[];
      /** Các bộ ba Giải Nhì. */
      second: string[];
      /** Các bộ ba Giải Ba. */
      third: string[];
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
      /** Chi tiết thưởng theo từng board. */
      boardPayouts: Array<{
        /** Ký hiệu board. VD: `"A"`. */
        boardNo: string;
        /** Chế độ chơi. `"multiNumber"` hoặc `"multiDigit"`. */
        playMode: string;
        /** Kiểu chơi. Luôn là `"straight"` cho Max 3D Pro. */
        playType: string;
        /** Mức giải trúng. */
        prizeLevel: string;
        /** Kết quả đối chiếu số. */
        matchResult: string;
        /** Tiền thắng của board này (VND). */
        winAmount: number;
      }>;
    };
  }>;
}

/**
 * Danh sách lines chi tiết của một entry Max 3D Pro (cursor-based).
 *
 * Trả về bởi {@link Max3dproApi.getEntryLines}.
 *
 * Mỗi line là 1 cặp bộ ba số, được expand từ multiNumber hoặc multiDigit input.
 * Pagination dùng integer line index làm cursor.
 *
 * @example
 * ```ts
 * const { lines, nextCursor } = await client.max3dpro.getEntryLines("entry-abc...", { size: 50 });
 * for (const line of lines) {
 *   console.log(`[${line.boardNo}][${line.playMode}]: ${line.triplets.join(" + ")}`);
 *   if (line.matchResult && line.matchResult.tiers.length > 0) {
 *     const tierNames = line.matchResult.tiers.map(t => t.tier).join(" + ");
 *     console.log(`  Giải: ${tierNames}, tổng thưởng: ${line.matchResult.winAmount} VND`);
 *   } else {
 *     console.log("  Không trúng");
 *   }
 * }
 * ```
 */
export interface Max3dproEntryLinesResponse {
  /** ID entry. */
  entryId: string;
  /**
   * ID kỳ quay mà entry này tham gia.
   * Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.001"`.
   */
  drawId: string;
  /** Danh sách lines trong trang hiện tại. */
  lines: Max3dproLineInfo[];
  /**
   * Cursor để lấy trang tiếp theo, `null` nếu đã hết.
   * Là `lineIndex` của line cuối trong trang này (integer).
   */
  nextCursor: number | null;
  /** Số lines thực tế trả về trong trang này. */
  size: number;
}

/**
 * Danh sách kết quả kỳ quay Max 3D Pro (cursor-based).
 *
 * Trả về bởi {@link Max3dproApi.listDrawResults}.
 */
export interface Max3dproListDrawResultsResponse {
  /** Danh sách kết quả kỳ quay trong trang hiện tại. */
  draws: Max3dproDrawResultSummary[];
  /**
   * Cursor để lấy trang tiếp theo, `null` nếu đã hết.
   * Là `drawId` của kỳ cuối cùng trong trang này. Format `YYYY-MM-DD.NNN`.
   */
  nextCursor: string | null;
  /** Số kỳ quay thực tế trả về. */
  size: number;
}

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
   * @returns Thông tin vé vừa tạo gồm ticketId, ticketNo, totalAmount
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

/**
 * Max 3D API Module
 * @module
 */

import type { HttpClient } from "../http-client";
import type {
  Max3dTicketPurchaseInput,
  Max3dGameConfigResponse,
  Max3dDrawInfo,
  Max3dTicketSummary,
  Max3dLineInfo,
  Max3dDrawResultSummary,
  Max3dDrawResultInfo,
} from "../max3d";
import { ENDPOINTS } from "../endpoints";

/**
 * Tham số phân trang cho danh sách vé Max 3D đang chờ xử lý.
 *
 * Cursor-based pagination. Không hỗ trợ lọc ngày — chỉ trả vé đang active.
 *
 * @example
 * ```ts
 * const page1 = await client.max3d.listPendingTickets({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.max3d.listPendingTickets({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Max3dListPendingTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
}

/**
 * Tham số lọc và phân trang cho lịch sử vé Max 3D (tất cả trạng thái).
 *
 * Hỗ trợ lọc theo khoảng ngày đặt cược (giờ Việt Nam).
 *
 * @example
 * ```ts
 * const march = await client.max3d.listTickets({
 *   from: "2026-03-01",
 *   to: "2026-03-31",
 * });
 *
 * if (march.nextCursor) {
 *   const page2 = await client.max3d.listTickets({
 *     size: 20,
 *     cursor: march.nextCursor,
 *   });
 * }
 * ```
 */
export interface Max3dListAllTicketsParams {
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
 * Tham số phân trang cho danh sách kết quả kỳ quay Max 3D.
 *
 * @example
 * ```ts
 * const page1 = await client.max3d.listDrawResults({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.max3d.listDrawResults({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Max3dListDrawResultsParams {
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
 * Tham số phân trang cho lines của một entry Max 3D.
 */
export interface Max3dEntryLinesParams {
  /** Số lượng lines mỗi trang (mặc định 50). */
  size?: number;
  /**
   * Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước).
   * Là `lineIndex` (integer) của line cuối trang trước.
   */
  cursor?: number;
}

/**
 * Response khi đặt cược Max 3D thành công.
 *
 * Trả về bởi {@link Max3dApi.placeBet}.
 */
export interface Max3dPlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. VD: `"M3D-20260307-00005"`. */
  ticketNo: string;
  /** Tổng tiền cược (VND). */
  totalAmount: number;
}

/**
 * Thông tin kỳ quay Max 3D hiện tại.
 *
 * Trả về bởi {@link Max3dApi.getCurrentDraw}.
 */
export interface Max3dCurrentDrawResponse {
  /** Kỳ quay đang mở bán, hoặc `null` nếu chưa có. */
  currentDraw: Max3dDrawInfo | null;
  /** Tất cả kỳ quay đang active. */
  activeDraws: Max3dDrawInfo[];
}

/**
 * Danh sách vé Max 3D (cursor-based).
 *
 * Trả về bởi {@link Max3dApi.listPendingTickets} và {@link Max3dApi.listTickets}.
 */
export interface Max3dListTicketsResponse {
  /** Danh sách vé trong trang hiện tại. */
  tickets: Max3dTicketSummary[];
  /** Cursor để lấy trang tiếp theo, `null` nếu đã hết. */
  nextCursor: string | null;
  /** Số vé thực tế trả về. */
  size: number;
}

/**
 * Chi tiết vé và các lần tham gia kỳ quay của vé Max 3D.
 *
 * Trả về bởi {@link Max3dApi.getTicketEntries}.
 */
export interface Max3dTicketEntriesResponse {
  /** Thông tin tóm tắt vé. */
  ticket: Max3dTicketSummary;
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
     * Max 3D quay ra 20 bộ ba chia thành 4 hạng:
     * - `special` — Đặc Biệt
     * - `first`   — Giải Nhất
     * - `second`  — Giải Nhì
     * - `third`   — Giải Ba
     *
     * Mỗi hạng là mảng bộ ba số string `"000"`-`"999"`.
     * VD: `special: ["123"]`, `first: ["456", "789"]`.
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
        /** Chế độ chơi. `"basic"` hoặc `"plus"`. */
        playMode: string;
        /** Kiểu chơi. `"straight"`, `"combo3"`, hoặc `"combo6"`. */
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
 * Danh sách lines chi tiết của một entry Max 3D (cursor-based).
 *
 * Trả về bởi {@link Max3dApi.getEntryLines}.
 *
 * Mỗi line là 1 bộ ba (Basic) hoặc 1 cặp bộ ba (Plus).
 * Pagination dùng integer line index làm cursor.
 *
 * @example
 * ```ts
 * const { lines, nextCursor } = await client.max3d.getEntryLines("entry-abc...", { size: 50 });
 * for (const line of lines) {
 *   console.log(`Board ${line.boardNo} [${line.playMode}/${line.playType}]: ${line.triplets.join(" + ")}`);
 *   if (line.matchResult) {
 *     console.log(`  Giải: ${line.matchResult.tier ?? "không trúng"}, thưởng: ${line.matchResult.winAmount} VND`);
 *   }
 * }
 * ```
 */
export interface Max3dEntryLinesResponse {
  /** ID entry. */
  entryId: string;
  /**
   * ID kỳ quay mà entry này tham gia.
   * Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.001"`.
   */
  drawId: string;
  /** Danh sách lines trong trang hiện tại. */
  lines: Max3dLineInfo[];
  /**
   * Cursor để lấy trang tiếp theo, `null` nếu đã hết.
   * Là `lineIndex` của line cuối trong trang này (integer).
   */
  nextCursor: number | null;
  /** Số lines thực tế trả về trong trang này. */
  size: number;
}

/**
 * Danh sách kết quả kỳ quay Max 3D (cursor-based).
 *
 * Trả về bởi {@link Max3dApi.listDrawResults}.
 */
export interface Max3dListDrawResultsResponse {
  /** Danh sách kết quả kỳ quay trong trang hiện tại. */
  draws: Max3dDrawResultSummary[];
  /**
   * Cursor để lấy trang tiếp theo, `null` nếu đã hết.
   * Là `drawId` của kỳ cuối cùng trong trang này. Format `YYYY-MM-DD.NNN`.
   */
  nextCursor: string | null;
  /** Số kỳ quay thực tế trả về. */
  size: number;
}

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
   * @returns Thông tin vé vừa tạo gồm ticketId, ticketNo, totalAmount
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
   *   console.log(`[${line.boardNo}] ${line.triplets.join(" + ")} → giải: ${line.matchResult?.tier ?? "không"}`);
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

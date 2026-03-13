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
} from "../max3dpro";
import { ENDPOINTS } from "../endpoints";

/**
 * Tham số phân trang cho danh sách vé Max 3D Pro.
 *
 * Cursor-based pagination.
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
export interface Max3dproListTicketsParams {
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
    /** ID kỳ quay. Format `YYYY-MM-DD.NNN`. */
    drawId: string;
    /** Ngày kỳ quay (YYYY-MM-DD). */
    drawDate: string;
    /** Trạng thái entry. */
    status: string;
    /** Tiền cược cho entry này (VND). */
    amount: number;
    /** Kết quả quay số (chỉ có sau khi published). */
    result?: {
      /** Bộ số giải nhất. */
      firstPrize: string;
      /** Bộ số giải nhì. */
      secondPrize: string;
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
        /** Chế độ chơi. */
        playMode: string;
        /** Kiểu chơi. */
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
 * Danh sách lines chi tiết của một entry Max 3D Pro.
 *
 * Trả về bởi {@link Max3dproApi.getEntryLines}.
 */
export interface Max3dproEntryLinesResponse {
  /** ID entry. */
  entryId: string;
  /** Danh sách lines — mỗi line gồm 2 bộ số 3 chữ số (chế độ plus). */
  lines: Array<{ first: string; second: string }>;
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
   * **Endpoint:** `POST /games/max3dpro/bets`
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
   * import type { Max3dproTicketPurchaseInput } from "@megawin/player-sdk/max3dpro";
   *
   * const result = await client.max3dpro.placeBet({
   *   drawId: "2026-03-07.001",
   *   drawCount: 1,
   *   boards: [{ boardNo: "A", playMode: "plus", playType: "straight", triplets: ["123", "456"] }],
   * });
   * console.log(result.ticketNo);    // "M3DP-20260307-00004"
   * console.log(result.totalAmount); // 20000
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
  listPendingTickets(params?: Max3dproListTicketsParams): Promise<Max3dproListTicketsResponse>;

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
  listTickets(params?: Max3dproListTicketsParams): Promise<Max3dproListTicketsResponse>;

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
   * console.log(data.entries.length);  // 1
   * ```
   */
  getTicketEntries(ticketId: string): Promise<Max3dproTicketEntriesResponse>;

  /**
   * Lấy danh sách lines chi tiết của một entry Max 3D Pro.
   *
   * **Endpoint:** `GET /games/max3dpro/entries/{entryId}/lines`
   *
   * @param entryId - ID entry (lấy từ `entries[].id` trong `getTicketEntries`)
   * @returns Danh sách lines đã expand
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — entryId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { lines } = await client.max3dpro.getEntryLines("entry-abc...");
   * for (const line of lines) {
   *   console.log(`${line.first} + ${line.second}`); // "123 + 456"
   * }
   * ```
   */
  getEntryLines(entryId: string): Promise<Max3dproEntryLinesResponse>;
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
    async getEntryLines(entryId) {
      return http.get<Max3dproEntryLinesResponse>(ENDPOINTS.max3dpro.getEntryLines(entryId));
    },
  };
}

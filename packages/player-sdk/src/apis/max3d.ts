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
} from "../max3d";
import { ENDPOINTS } from "../endpoints";

/**
 * Tham số phân trang cho danh sách vé Max 3D.
 *
 * Cursor-based pagination.
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
export interface Max3dListTicketsParams {
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
 * Danh sách lines chi tiết của một entry Max 3D.
 *
 * Trả về bởi {@link Max3dApi.getEntryLines}.
 */
export interface Max3dEntryLinesResponse {
  /** ID entry. */
  entryId: string;
  /** Danh sách lines — mỗi line là 1 bộ số 3 chữ số. */
  lines: Array<{ triplet: string }>;
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
   * **Endpoint:** `POST /games/max3d/bets`
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
   * import type { Max3dTicketPurchaseInput } from "@megawin/player-sdk/max3d";
   *
   * const result = await client.max3d.placeBet({
   *   drawId: "2026-03-07.001",
   *   drawCount: 2,
   *   boards: [
   *     { boardNo: "A", playMode: "basic", playType: "straight", triplets: ["123"] },
   *     { boardNo: "B", playMode: "basic", playType: "permutation", triplets: ["456"] },
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
  listPendingTickets(params?: Max3dListTicketsParams): Promise<Max3dListTicketsResponse>;

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
  listTickets(params?: Max3dListTicketsParams): Promise<Max3dListTicketsResponse>;

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
   * console.log(data.entries.length);  // 2 (mua 2 kỳ)
   * ```
   */
  getTicketEntries(ticketId: string): Promise<Max3dTicketEntriesResponse>;

  /**
   * Lấy danh sách lines chi tiết của một entry Max 3D.
   *
   * **Endpoint:** `GET /games/max3d/entries/{entryId}/lines`
   *
   * @param entryId - ID entry (lấy từ `entries[].id` trong `getTicketEntries`)
   * @returns Danh sách lines đã expand
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — entryId không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * const { lines } = await client.max3d.getEntryLines("entry-abc...");
   * for (const line of lines) {
   *   console.log(line.triplet); // "123"
   * }
   * ```
   */
  getEntryLines(entryId: string): Promise<Max3dEntryLinesResponse>;
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
    async getEntryLines(entryId) {
      return http.get<Max3dEntryLinesResponse>(ENDPOINTS.max3d.getEntryLines(entryId));
    },
  };
}

/**
 * Player API Module
 *
 * Các API chung cho player: số dư, lịch sử cược, kết quả game.
 *
 * @module
 */

import type { HttpClient } from "../http-client";
import { ENDPOINTS } from "../endpoints";

// ─────────────────────────────────────────────
// Response Types
// ─────────────────────────────────────────────

/**
 * Thông tin số dư của player.
 *
 * @example
 * ```ts
 * const balance = await client.player.getBalance();
 * console.log(`${balance.balance} ${balance.currency}`); // "500000 VND"
 * ```
 */
export interface PlayerBalance {
  /** ID player. */
  playerId: string;
  /** ID tenant. */
  tenantId: string;
  /** Số dư hiện tại. */
  balance: number;
  /** Đơn vị tiền tệ. */
  currency: string;
}

/**
 * Tham số query lịch sử cược.
 */
export interface GetBetHistoryParams {
  /** Lọc theo game. */
  gameId?: string;
  /** Trang hiện tại (bắt đầu từ 1). */
  page?: number;
  /** Số item mỗi trang. Mặc định: 20. */
  pageSize?: number;
}

/**
 * Response lịch sử cược (paginated).
 */
export interface BetHistoryResponse {
  /** Danh sách vé cược. */
  bets: BetHistoryItem[];
  /** Tổng số vé. */
  total: number;
  /** Trang hiện tại. */
  page: number;
  /** Số item mỗi trang. */
  pageSize: number;
}

/**
 * Một item trong lịch sử cược.
 */
export interface BetHistoryItem {
  /** ID vé. */
  ticketId: string;
  /** Mã vé hiển thị. */
  ticketNo: string;
  /** Loại game: `"keno"` | `"lotto535"`. */
  gameId: string;
  /** Tổng tiền cược (VND). */
  totalAmount: number;
  /** Tổng tiền thắng (VND). `0` nếu chưa settle. */
  totalWinAmount: number;
  /** Trạng thái vé. */
  status: string;
  /** Thời điểm mua vé (ISO 8601). */
  createdAt: string;
}

/**
 * Kết quả một lượt quay game.
 */
export interface GameResult {
  /** ID game. */
  gameId: string;
  /** ID lượt quay / kỳ quay. */
  roundId: string;
  /** Trạng thái. */
  status: string;
  /** Kết quả quay (format tùy game). */
  result: unknown;
  /** Thời điểm công bố (ISO 8601). */
  publishedAt?: string;
}

// ─────────────────────────────────────────────
// API Interface
// ─────────────────────────────────────────────

/**
 * Player API — các thao tác chung cho player.
 *
 * Truy cập qua `client.player`.
 *
 * @example
 * ```ts
 * const client = createPlayerClient({ baseUrl: "https://api.megawin.com" });
 *
 * const balance = await client.player.getBalance();
 * const history = await client.player.getBetHistory({ page: 1, pageSize: 10 });
 * const result = await client.player.getGameResult("keno", "2026-02-25-001");
 * ```
 */
export interface PlayerApi {
  /**
   * Lấy số dư hiện tại của player.
   *
   * **Endpoint:** `GET /player/balance`
   *
   * @returns Thông tin số dư
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực
   *
   * @example
   * ```ts
   * const balance = await client.player.getBalance();
   * console.log(balance.balance);  // 500000
   * console.log(balance.currency); // "VND"
   * ```
   */
  getBalance(): Promise<PlayerBalance>;

  /**
   * Lấy lịch sử đặt cược của player.
   *
   * **Endpoint:** `GET /player/bets`
   *
   * Hỗ trợ phân trang và lọc theo game.
   *
   * @param params - Tham số query (tùy chọn)
   * @returns Danh sách vé cược (paginated)
   *
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực
   *
   * @example
   * ```ts
   * // Lấy trang 1, 20 items
   * const history = await client.player.getBetHistory();
   *
   * // Lọc theo game Keno, trang 2
   * const kenoHistory = await client.player.getBetHistory({
   *   gameId: "keno",
   *   page: 2,
   *   pageSize: 10,
   * });
   *
   * for (const bet of kenoHistory.bets) {
   *   console.log(bet.ticketNo, bet.totalAmount, bet.status);
   * }
   * ```
   */
  getBetHistory(params?: GetBetHistoryParams): Promise<BetHistoryResponse>;

  /**
   * Lấy kết quả một lượt quay game.
   *
   * **Endpoint:** `GET /player/games/{gameId}/results/{roundId}`
   *
   * @param gameId - ID game (vd `"keno"`, `"lotto535"`)
   * @param roundId - ID lượt quay / kỳ quay (vd `"2026-02-25-001"`)
   * @returns Kết quả lượt quay
   *
   * @throws {@link ApiClientError} code `NOT_FOUND` — kỳ quay không tồn tại
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực
   *
   * @example
   * ```ts
   * const result = await client.player.getGameResult("keno", "2026-02-25-001");
   * console.log(result.status);      // "completed"
   * console.log(result.publishedAt); // "2026-02-25T13:05:00Z"
   * ```
   */
  getGameResult(gameId: string, roundId: string): Promise<GameResult>;
}

// ─────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────

/**
 * @internal
 */
export function createPlayerApi(http: HttpClient): PlayerApi {
  return {
    async getBalance(): Promise<PlayerBalance> {
      return http.get<PlayerBalance>(ENDPOINTS.player.balance);
    },

    async getBetHistory(params?: GetBetHistoryParams): Promise<BetHistoryResponse> {
      return http.get<BetHistoryResponse>(ENDPOINTS.player.betHistory, {
        params: params as Record<string, string | number | boolean | undefined>,
      });
    },

    async getGameResult(gameId: string, roundId: string): Promise<GameResult> {
      return http.get<GameResult>(ENDPOINTS.player.gameResult(gameId, roundId));
    },
  };
}

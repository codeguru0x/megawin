/**
 * Lotto 5/35 API Module
 *
 * Tất cả API liên quan đến game Lotto 5/35.
 *
 * @module
 */

import type { HttpClient } from "../http-client";
import type {
  Lotto535TicketPurchaseInput,
  Lotto535DrawInfo,
  Lotto535TicketSummary,
  Lotto535EntryResult,
  Lotto535GameConfigResponse,
} from "../lotto535";
import { ENDPOINTS } from "../endpoints";

// ─────────────────────────────────────────────
// Query Params
// ─────────────────────────────────────────────

/**
 * Tham số phân trang cho danh sách vé Lotto 5/35 đang chờ.
 *
 * Cursor-based pagination — hiệu quả hơn offset pagination cho dataset lớn.
 *
 * @example
 * ```ts
 * // Trang đầu tiên
 * const page1 = await client.lotto535.listPendingTickets({ size: 10 });
 *
 * // Trang tiếp theo
 * if (page1.nextCursor) {
 *   const page2 = await client.lotto535.listPendingTickets({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Lotto535ListTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
}

/**
 * Tham số truy vấn danh sách tất cả vé Lotto 5/35 (pending + completed).
 *
 * Hỗ trợ lọc theo khoảng ngày cược (giờ Việt Nam).
 *
 * @example
 * ```ts
 * // Lấy tất cả vé trong tháng 3/2026
 * const result = await client.lotto535.listTickets({
 *   size: 20,
 *   from: "2026-03-01",
 *   to: "2026-03-31",
 * });
 *
 * // Phân trang
 * if (result.nextCursor) {
 *   const page2 = await client.lotto535.listTickets({
 *     size: 20,
 *     cursor: result.nextCursor,
 *   });
 * }
 * ```
 */
export interface Lotto535ListAllTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
  /** Lọc từ ngày cược (ISO date `YYYY-MM-DD`, giờ Việt Nam). */
  from?: string;
  /** Lọc đến ngày cược (ISO date `YYYY-MM-DD`, giờ Việt Nam). */
  to?: string;
}

// ─────────────────────────────────────────────
// Response Types
// ─────────────────────────────────────────────

/**
 * Response khi đặt cược Lotto 5/35 thành công.
 *
 * Trả về từ `POST /games/lotto535/bets` qua `client.lotto535.placeBet()`.
 *
 * @example
 * ```ts
 * const result = await client.lotto535.placeBet({ ... });
 * console.log(result.ticketId);    // "TKT-XYZ789"
 * console.log(result.ticketNo);    // "L-20260225-001-0001"
 * console.log(result.totalAmount); // 30000
 * ```
 */
export interface Lotto535PlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. VD: `"L-20260305-001-0001"`. */
  ticketNo: string;
  /** Tổng tiền cược (VND). */
  totalAmount: number;
}

/**
 * Response từ `GET /games/lotto535/draws/current`.
 *
 * Chứa thông tin kỳ quay hiện tại và danh sách kỳ đang active.
 *
 * @example
 * ```ts
 * const data = await client.lotto535.getCurrentDraw();
 *
 * if (data.currentDraw) {
 *   console.log(data.currentDraw.drawId);       // "2026-03-05-001"
 *   console.log(data.currentDraw.jackpotAmount); // 12_000_000_000
 *   console.log(data.currentDraw.salesCloseAt);  // "2026-03-05T12:50:00Z"
 * }
 * ```
 */
export interface Lotto535CurrentDrawResponse {
  /** Kỳ quay đang mở bán gần nhất. `null` nếu không có kỳ nào mở. */
  currentDraw: Lotto535DrawInfo | null;
  /** Tất cả kỳ quay đang trong trạng thái active (mở bán hoặc đóng bán). */
  activeDraws: Lotto535DrawInfo[];
}

/**
 * Response từ `GET /games/lotto535/jackpot`.
 *
 * @example
 * ```ts
 * const data = await client.lotto535.getJackpot();
 * console.log(`Jackpot: ${data.jackpotAmount.toLocaleString()} VND`);
 * ```
 */
export interface Lotto535JackpotResponse {
  /** Giá trị Jackpot hiện tại (VND). */
  jackpotAmount: number;
}

/**
 * Response phân trang danh sách vé Lotto 5/35.
 *
 * Dùng cho cả `listPendingTickets` và `listTickets`.
 *
 * @example
 * ```ts
 * const page = await client.lotto535.listPendingTickets({ size: 10 });
 * console.log(page.tickets);    // Lotto535TicketSummary[]
 * console.log(page.nextCursor); // "65abc..." hoặc null nếu hết
 * console.log(page.size);       // 10
 * ```
 */
export interface Lotto535ListTicketsResponse {
  /** Danh sách vé trang hiện tại. */
  tickets: Lotto535TicketSummary[];
  /** Cursor để lấy trang tiếp theo. `null` nếu không còn trang nào. */
  nextCursor: string | null;
  /** Số lượng vé yêu cầu (echo lại `size` từ request). */
  size: number;
}

/**
 * Response từ `GET /games/lotto535/tickets/{ticketId}/entries`.
 *
 * Chứa thông tin vé và tất cả entries (mỗi kỳ quay 1 entry).
 *
 * @example
 * ```ts
 * const data = await client.lotto535.getTicketEntries("TKT-L01...");
 * console.log(data.ticket.ticketNo); // "L-20260305-001-0001"
 * console.log(data.entries.length);   // 3 (mua 3 kỳ)
 *
 * const settled = data.entries.filter(e => e.payout);
 * const totalWin = settled.reduce((sum, e) => sum + e.payout!.winAmount, 0);
 * ```
 */
export interface Lotto535TicketEntriesResponse {
  /** Thông tin tóm tắt vé. */
  ticket: Lotto535TicketSummary;
  /** Danh sách entries theo kỳ quay (sắp xếp theo drawTime tăng dần). */
  entries: Lotto535EntryResult[];
}

/**
 * Response từ `GET /games/lotto535/entries/{entryId}/lines`.
 *
 * Chứa danh sách tất cả lines mở rộng (bao) của entry.
 * Với play type `standard`, chỉ có 1 line.
 * Với `mainCover`, số lines = C(N, 5) với N = số chính đã chọn.
 *
 * @example
 * ```ts
 * const data = await client.lotto535.getEntryLines("ENT-001...");
 * console.log(`${data.lines.length} lines`);
 *
 * for (const line of data.lines) {
 *   console.log(`Chính: ${line.mainNumbers}, ĐB: ${line.specialNumber}`);
 * }
 * ```
 */
export interface Lotto535EntryLinesResponse {
  /** ID entry trong hệ thống. */
  entryId: string;
  /** Danh sách lines mở rộng. */
  lines: Array<{
    /** 5 số chính (1-35). */
    mainNumbers: number[];
    /** 1 số đặc biệt (1-12). */
    specialNumber: number;
  }>;
}

// ─────────────────────────────────────────────
// API Interface
// ─────────────────────────────────────────────

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
 *   drawId: draw.currentDraw!.drawId,
 *   drawCount: 1,
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
   * @param input.drawId - DrawId kỳ đầu tiên. Format: `YYYY-MM-DD-NNN`
   * @param input.drawCount - Số kỳ tham gia liên tiếp (1-6)
   * @param input.boards - Danh sách boards (tối đa 5, không trùng boardNo)
   * @returns Thông tin vé vừa tạo gồm ticketId, ticketNo, totalAmount
   *
   * @throws {@link ApiClientError} code `INSUFFICIENT_BALANCE` — không đủ số dư
   * @throws {@link ApiClientError} code `DRAW_CLOSED` — kỳ quay đã đóng bán
   * @throws {@link ApiClientError} code `VALIDATION_ERROR` — input không hợp lệ
   * @throws {@link ApiClientError} code `UNAUTHORIZED` — chưa xác thực hoặc token hết hạn
   *
   * @example
   * ```ts
   * // Vé Standard: 5 số chính + 1 số đặc biệt
   * const result = await client.lotto535.placeBet({
   *   drawId: "2026-03-05-001",
   *   drawCount: 1,
   *   boards: [{
   *     boardNo: "A",
   *     playType: "standard",
   *     selection: {
   *       mainNumbers: ["01", "08", "15", "22", "35"],
   *       specialNumbers: ["07"],
   *     },
   *   }],
   * });
   * console.log(result.ticketNo);    // "L-20260305-001-0001"
   * console.log(result.totalAmount); // 30000
   *
   * // Vé Bao (MainCover): 8 số chính + 1 số đặc biệt, 3 kỳ
   * const result2 = await client.lotto535.placeBet({
   *   drawId: "2026-03-05-001",
   *   drawCount: 3,
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
   * console.log(data.ticket.ticketNo); // "L-20260305-001-0001"
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
   * Với play type `standard` / `quickPick`, chỉ có 1 line.
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

    async listPendingTickets(
      params?: Lotto535ListTicketsParams,
    ): Promise<Lotto535ListTicketsResponse> {
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
  };
}

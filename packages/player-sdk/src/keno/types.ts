/**
 * Keno SDK – Public Types
 *
 * Types cho game Keno — dùng trong player client.
 * Số Keno là string zero-padded `"01"` đến `"80"` (khớp API contract).
 *
 * @module
 */

import type {
  KenoBigSmallBet,
  KenoEvenOddBet,
  KenoPlayType,
  KenoTicketDisplayStatus,
} from "./enums";

// ─────────────────────────────────────────────
// Input Types (mua vé)
// ─────────────────────────────────────────────

/**
 * Input board cơ bản — chọn 1-10 số.
 *
 * Số Keno dạng string zero-padded `"01"` đến `"80"`.
 *
 * @example
 * ```ts
 * const board: KenoBasicBoardInput = {
 *   boardNo: "A",
 *   numbers: ["01", "15", "33", "44", "60"],
 * };
 * ```
 */
export interface KenoBasicBoardInput {
  /**
   * Mã board: `"A"` hoặc `"B"`.
   */
  boardNo: string;

  /**
   * Danh sách số Keno đã chọn.
   *
   * - String zero-padded: `"01"` đến `"80"`
   * - Tối thiểu 1 số, tối đa 10 số
   * - Không trùng nhau
   */
  numbers: string[];
}

/**
 * Input side bet (cược bổ sung).
 *
 * @example
 * ```ts
 * const sideBet: KenoSideBetInput = {
 *   playType: "bigSmall",
 *   bet: "big",
 * };
 * ```
 */
export interface KenoSideBetInput {
  /**
   * Loại side bet: `"bigSmall"` hoặc `"evenOdd"`.
   */
  playType: typeof KenoPlayType.BigSmall | typeof KenoPlayType.EvenOdd;

  /**
   * Lựa chọn cược:
   *
   * - Big/Small: `"big"` | `"bigSmallDraw"` | `"small"`
   * - Even/Odd: `"even"` | `"even1112"` | `"evenOddDraw"` | `"odd1112"` | `"odd"`
   */
  bet: KenoBigSmallBet | KenoEvenOddBet;
}

/**
 * Input mua vé Keno.
 *
 * Gửi lên `POST /player/keno/bets` qua `client.keno.placeBet()`.
 *
 * Phải có ít nhất 1 board hoặc 1 side bet.
 *
 * @example
 * ```ts
 * import type { KenoTicketPurchaseInput } from "@megawin/player-sdk/keno";
 *
 * // Cược cơ bản 1 kỳ
 * const input: KenoTicketPurchaseInput = {
 *   drawIds: ["2026-02-25-001"],
 *   boards: [
 *     { boardNo: "A", numbers: ["01", "15", "33", "44", "60"] },
 *   ],
 * };
 *
 * // Cược nhiều kỳ + side bet
 * const input2: KenoTicketPurchaseInput = {
 *   drawIds: ["2026-02-25-001", "2026-02-25-002", "2026-02-25-003"],
 *   boards: [
 *     { boardNo: "A", numbers: ["01", "15", "33", "44", "60"] },
 *     { boardNo: "B", numbers: ["22", "44", "66"] },
 *   ],
 *   sideBets: [
 *     { playType: "bigSmall", bet: "big" },
 *     { playType: "evenOdd", bet: "even" },
 *   ],
 * };
 * ```
 */
export interface KenoTicketPurchaseInput {
  /**
   * Danh sách drawId các kỳ quay tham gia.
   *
   * - Format mỗi ID: `YYYY-MM-DD-NNN` (vd `"2026-02-25-001"`)
   * - Tối thiểu 1, tối đa 30 kỳ
   * - Không được trùng lặp
   */
  drawIds: string[];

  /**
   * Boards chọn số cơ bản (Panel A/B).
   *
   * Tối đa 2 boards, boardNo không trùng nhau.
   * Có thể để mảng rỗng nếu chỉ cược side bet.
   */
  boards: KenoBasicBoardInput[];

  /**
   * Side bets tùy chọn (Panel C).
   *
   * Có thể cược Lớn/Nhỏ và/hoặc Chẵn/Lẻ.
   * Có thể bỏ qua nếu chỉ cược board cơ bản.
   */
  sideBets?: KenoSideBetInput[];
}

// ─────────────────────────────────────────────
// Query Params
// ─────────────────────────────────────────────

/**
 * Tham số phân trang cho danh sách vé Keno đang chờ.
 *
 * Cursor-based pagination — hiệu quả hơn offset pagination cho dataset lớn.
 *
 * @example
 * ```ts
 * // Trang đầu tiên
 * const page1 = await client.keno.listPendingTickets({ size: 10 });
 *
 * // Trang tiếp theo
 * const page2 = await client.keno.listPendingTickets({
 *   size: 10,
 *   cursor: page1.nextCursor!,
 * });
 * ```
 */
export interface KenoListTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
}

/**
 * Tham số truy vấn danh sách vé Keno đã hoàn thành.
 *
 * Hỗ trợ lọc theo khoảng thời gian và sắp xếp.
 *
 * @example
 * ```ts
 * // Lọc vé đã hoàn thành trong tháng 2/2026, sắp xếp theo ngày quay
 * const result = await client.keno.listCompletedTickets({
 *   size: 20,
 *   sortBy: "drawDate",
 *   from: "2026-02-01",
 *   to: "2026-02-28",
 * });
 * ```
 */
export interface KenoListCompletedTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
  /**
   * Tiêu chí sắp xếp.
   *
   * - `"betDate"` — theo ngày đặt cược (mặc định)
   * - `"drawDate"` — theo ngày kỳ quay
   */
  sortBy?: "betDate" | "drawDate";
  /** Lọc từ ngày (ISO date `YYYY-MM-DD`). */
  from?: string;
  /** Lọc đến ngày (ISO date `YYYY-MM-DD`). */
  to?: string;
}

// ─────────────────────────────────────────────
// Response Types — Draw
// ─────────────────────────────────────────────

/**
 * Thông tin kỳ quay Keno cho UI.
 *
 * Khớp với `PlayerDrawInfo` từ API.
 */
export interface KenoDrawInfo {
  /** ID kỳ quay. Format: `YYYY-MM-DD-NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Thời điểm quay (ISO 8601). */
  drawTime: string;
  /** Trạng thái kỳ quay. */
  status: string;

  /** Thời gian bán vé. */
  sales: {
    /** Thời điểm mở bán (ISO 8601). Có thể `undefined` nếu chưa xác định. */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
}

/**
 * Kết quả kỳ quay gần nhất.
 */
export interface KenoLastResult {
  /** ID kỳ quay. Format: `YYYY-MM-DD-NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** 20 số trúng thưởng (1-80). */
  winningNumbers: number[];
  /** Thời điểm công bố kết quả (ISO 8601). */
  publishedAt: string;
}

/**
 * Response từ `GET /player/keno/draws/current`.
 *
 * Chứa thông tin kỳ quay hiện tại, danh sách kỳ đang mở bán, và kết quả gần nhất.
 *
 * @example
 * ```ts
 * const data = await client.keno.getCurrentDraw();
 *
 * if (data.currentDraw) {
 *   console.log(data.currentDraw.drawId);           // "2026-02-25-100"
 *   console.log(data.currentDraw.sales.closeAt);     // "2026-02-25T13:05:00Z"
 * }
 *
 * if (data.lastResult) {
 *   console.log(data.lastResult.winningNumbers);     // [3, 7, 12, ...]
 * }
 * ```
 */
export interface KenoCurrentDrawResponse {
  /** Kỳ quay đang mở bán gần nhất. `null` nếu không có kỳ nào mở. */
  currentDraw: KenoDrawInfo | null;
  /** Tất cả kỳ quay đang trong trạng thái active (mở bán hoặc đóng bán). */
  activeDraws: KenoDrawInfo[];
  /** Kết quả kỳ quay gần nhất đã settle. `null` nếu chưa có kết quả nào. */
  lastResult: KenoLastResult | null;
}

// ─────────────────────────────────────────────
// Response Types — Ticket
// ─────────────────────────────────────────────

/**
 * Tóm tắt vé Keno cho UI.
 *
 * Khớp với `PlayerTicketSummary` từ API.
 *
 * @example
 * ```ts
 * const { tickets } = await client.keno.listPendingTickets();
 * for (const ticket of tickets) {
 *   console.log(`${ticket.ticketNo}: ${ticket.pricing.totalAmount} VND`);
 *   console.log(`Tiến độ: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws}`);
 * }
 * ```
 */
export interface KenoTicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. VD: `"K-20260225-001-0001"`. */
  ticketNo: string;
  /** Trạng thái vé. */
  status: string;

  /** Kế hoạch kỳ quay. */
  drawPlan: {
    /** Danh sách drawId đã đăng ký. */
    drawIds: string[];
    /** Tổng số kỳ tham gia. */
    drawCount: number;
  };

  /** Thông tin giá cược. */
  pricing: {
    /** Đơn giá 1 bet (VND). */
    unitPrice: number;
    /** Số bets mỗi kỳ. */
    betsPerDraw: number;
    /** Tiền cược mỗi kỳ (VND). */
    amountPerDraw: number;
    /** Tổng tiền cược toàn vé (VND). */
    totalAmount: number;
  };

  /** Danh sách boards đã chọn. */
  boards: KenoBasicBoardSummary[];
  /** Danh sách side bets. */
  sideBets: KenoSideBetSummary[];

  /** Tiến độ settle. */
  progress: {
    /** Tổng số kỳ quay. */
    totalDraws: number;
    /** Số kỳ đã settle. */
    settledDraws: number;
  };

  /** Thông tin trả thưởng tổng. `undefined` nếu chưa có kỳ nào settle. */
  settlement?: {
    /** Tổng tiền thắng toàn vé (VND). */
    totalWinAmount: number;
  };

  /** Thời điểm mua vé (ISO 8601). */
  createdAt: string;
}

/**
 * Tóm tắt board trong vé Keno.
 */
export interface KenoBasicBoardSummary {
  /** Mã board: `"A"` hoặc `"B"`. */
  boardNo: string;
  /** Kiểu chơi: `"pick1"` đến `"pick10"`. */
  playType: string;
  /** Danh sách số đã chọn (zero-padded string `"01"`-`"80"`). */
  numbers: string[];
}

/**
 * Tóm tắt side bet trong vé Keno.
 */
export interface KenoSideBetSummary {
  /** Loại side bet: `"bigSmall"` hoặc `"evenOdd"`. */
  playType: string;
  /** Lựa chọn cược. VD: `"big"`, `"even"`, `"odd1112"`. */
  bet: string;
}

/**
 * Response phân trang danh sách vé Keno.
 *
 * Dùng cho cả `listPendingTickets` và `listCompletedTickets`.
 *
 * @example
 * ```ts
 * const page = await client.keno.listPendingTickets({ size: 10 });
 * console.log(page.tickets);    // KenoTicketSummary[]
 * console.log(page.nextCursor); // "65abc..." hoặc null nếu hết
 * console.log(page.size);       // 10
 * ```
 */
export interface KenoListTicketsResponse {
  /** Danh sách vé trang hiện tại. */
  tickets: KenoTicketSummary[];
  /** Cursor để lấy trang tiếp theo. `null` nếu không còn trang nào. */
  nextCursor: string | null;
  /** Số lượng vé yêu cầu (echo lại `size` từ request). */
  size: number;
}

// ─────────────────────────────────────────────
// Response Types — Entry (chi tiết vé theo kỳ)
// ─────────────────────────────────────────────

/**
 * Kết quả kỳ quay trong entry Keno.
 */
export interface KenoDrawResult {
  /** 20 số trúng thưởng (1-80). */
  winningNumbers: number[];
  /** Thời điểm công bố (ISO 8601). */
  publishedAt: string;
  /** Số lượng số lớn (41-80) trong kết quả. */
  bigCount: number;
  /** Số lượng số nhỏ (1-40) trong kết quả. */
  smallCount: number;
  /** Số lượng số chẵn trong kết quả. */
  evenCount: number;
  /** Số lượng số lẻ trong kết quả. */
  oddCount: number;
}

/**
 * Chi tiết trả thưởng entry Keno.
 */
export interface KenoEntryPayoutSummary {
  /** Tổng tiền thắng kỳ này (VND). */
  winAmount: number;
  /** Tổng tiền trả thưởng (VND). */
  payoutAmount: number;

  /** Kết quả từng board. */
  boardPayouts: Array<{
    /** Mã board. */
    boardNo: string;
    /** Kiểu chơi (pick1-pick10). */
    playType: string;
    /** Số trùng khớp với kết quả. */
    matchCount: number;
    /** Tổng số đã chọn. */
    pickCount: number;
    /** Tiền thưởng board này (VND). */
    winAmount: number;
  }>;

  /** Kết quả từng side bet. */
  sideBetPayouts: Array<{
    /** Loại side bet. */
    playType: string;
    /** Lựa chọn cược. VD: `"big"`, `"even"`. */
    bet: string;
    /** Kết quả thực tế của kỳ quay. VD: `"big"`, `"even"`. */
    outcome: string;
    /** Thắng hay thua. */
    isWin: boolean;
    /** Tiền thưởng side bet này (VND). */
    winAmount: number;
  }>;
}

/**
 * Chi tiết entry (vé 1 kỳ quay) cho UI.
 *
 * Mỗi entry đại diện cho 1 kỳ quay trong vé Keno.
 * Khớp với `PlayerEntryInfo` từ API.
 *
 * @example
 * ```ts
 * const { entries } = await client.keno.getTicketEntries("65abc123...");
 * for (const entry of entries) {
 *   console.log(`Kỳ ${entry.drawId}: ${entry.status}`);
 *   if (entry.result) {
 *     console.log("Kết quả:", entry.result.winningNumbers);
 *   }
 *   if (entry.payout) {
 *     console.log(`Thắng: ${entry.payout.winAmount} VND`);
 *   }
 * }
 * ```
 */
export interface KenoEntryInfo {
  /** ID entry trong hệ thống. */
  id: string;
  /** ID kỳ quay. Format: `YYYY-MM-DD-NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Trạng thái entry. */
  status: string;
  /** Tiền cược kỳ này (VND). */
  amount: number;
  /** Số lượng bets trong entry. */
  betCount: number;

  /** Bản sao thông tin cược tại thời điểm đặt. */
  entrySummary: {
    /** Mã vé. */
    ticketNo: string;
    /** Boards đã cược. */
    boards: Array<{
      boardNo: string;
      playType: string;
      numbers: string[];
    }>;
    /** Side bets đã cược. */
    sideBets: Array<{
      playType: string;
      bet: string;
    }>;
  };

  /** Kết quả kỳ quay. `undefined` nếu chưa quay. */
  result?: KenoDrawResult;
  /** Kết quả tổng: thắng/thua. `undefined` nếu chưa settle. */
  outcome?: string;
  /** Chi tiết trả thưởng. `undefined` nếu chưa settle. */
  payout?: KenoEntryPayoutSummary;
}

/**
 * Response từ `GET /player/keno/tickets/{ticketId}/entries`.
 *
 * Chứa thông tin vé và tất cả entries (mỗi kỳ quay 1 entry).
 *
 * @example
 * ```ts
 * const data = await client.keno.getTicketEntries("65abc123def456...");
 * console.log(data.ticket.ticketNo);  // "K-20260225-001-0001"
 * console.log(data.entries.length);    // 5 (nếu mua 5 kỳ)
 *
 * const settled = data.entries.filter(e => e.payout);
 * const totalWin = settled.reduce((sum, e) => sum + e.payout!.winAmount, 0);
 * ```
 */
export interface KenoTicketEntriesResponse {
  /** Thông tin tóm tắt vé. */
  ticket: KenoTicketSummary;
  /** Danh sách entries theo kỳ quay (sắp xếp theo drawTime tăng dần). */
  entries: KenoEntryInfo[];
}

// ─────────────────────────────────────────────
// Response Types — Place Bet
// ─────────────────────────────────────────────

/**
 * Response khi đặt cược Keno thành công.
 *
 * Trả về từ `POST /player/keno/bets` qua `client.keno.placeBet()`.
 *
 * @example
 * ```ts
 * const result = await client.keno.placeBet({
 *   drawIds: ["2026-02-25-001"],
 *   boards: [{ boardNo: "A", numbers: ["01", "15", "33", "44", "60"] }],
 * });
 * console.log(result.ticketId);            // "65abc..."
 * console.log(result.ticketNo);            // "K-20260225-001-0001"
 * console.log(result.pricing.totalAmount); // 10000
 * ```
 */
export interface KenoPlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. */
  ticketNo: string;
  /** Trạng thái vé sau khi tạo. */
  status: string;

  /** Kế hoạch kỳ quay. */
  drawPlan: {
    /** Danh sách drawId đã đăng ký. */
    drawIds: string[];
    /** Tổng số kỳ tham gia. */
    drawCount: number;
  };

  /** Thông tin giá cược. */
  pricing: {
    /** Đơn giá 1 bet (VND). */
    unitPrice: number;
    /** Số bets mỗi kỳ. */
    betsPerDraw: number;
    /** Tiền cược mỗi kỳ (VND). */
    amountPerDraw: number;
    /** Tổng tiền cược toàn vé (VND). */
    totalAmount: number;
  };

  /** Số lượng boards trong vé. */
  boardCount: number;
  /** Số lượng side bets trong vé. */
  sideBetCount: number;
  /** Số lượng entries đã tạo (= số kỳ quay). */
  entryCount: number;
}

// ─────────────────────────────────────────────
// Prize Table
// ─────────────────────────────────────────────

/**
 * Bảng giải thưởng Keno (cho trang hướng dẫn chơi).
 *
 * @example
 * ```ts
 * // Giải thưởng cơ bản: pickCount → matchCount → prize (VND)
 * prizeTable.basicPrizes[5][3]; // 50000 (pick5, trùng 3 số)
 *
 * // Giải Lớn/Nhỏ
 * prizeTable.bigSmallPrizes[0].condition; // ">= 13 số lớn"
 * prizeTable.bigSmallPrizes[0].prize;     // 3400
 * ```
 */
export interface KenoPrizeTableInfo {
  /**
   * Bảng giải cơ bản.
   *
   * Key cấp 1: `pickCount` (1-10).
   * Key cấp 2: `matchCount` (0-pickCount).
   * Value: tiền thưởng (VND).
   */
  basicPrizes: Record<number, Record<number, number>>;

  /** Bảng giải Lớn/Nhỏ. */
  bigSmallPrizes: Array<{
    /** Điều kiện trúng. */
    condition: string;
    /** Tiền thưởng (VND). */
    prize: number;
  }>;

  /** Bảng giải Chẵn/Lẻ. */
  evenOddPrizes: Array<{
    /** Điều kiện trúng. */
    condition: string;
    /** Tiền thưởng (VND). */
    prize: number;
  }>;
}

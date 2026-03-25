/**
 * Keno SDK – Public Types
 *
 * Types cho game Keno — dùng trong player client.
 * Số Keno là string zero-padded `"01"` đến `"80"` (khớp API contract).
 *
 * @module
 */

import type { KenoBigSmallBet, KenoEvenOddBet } from "./enums";

// ─────────────────────────────────────────────
// Input Types (mua vé)
// ─────────────────────────────────────────────

/**
 * Base fields có trong mọi loại board Keno.
 */
interface KenoBoardBase {
  /**
   * Mã board: `"A"`, `"B"`, hoặc `"C"`.
   *
   * Bắt buộc cho mọi board. Mỗi vé tối đa 3 boards, không trùng boardNo.
   */
  boardNo: string;
  /**
   * Số lần cược nhân bội cho board này (≥ 1, ≤ maxBetCount).
   *
   * Mặc định = 1 nếu không truyền. Tiền cược board = betCount × unitPrice.
   */
  betCount?: number;
}

/**
 * Board chọn số (pick1–pick10).
 *
 * `playType` xác định số lượng số bắt buộc trong `numbers`:
 * `"pick1"` = 1 số, `"pick2"` = 2 số, …, `"pick10"` = 10 số.
 *
 * @example
 * ```ts
 * // Board chọn 5 số (pick5)
 * const board: KenoPickBoardInput = {
 *   boardNo: "A",
 *   playType: "pick5",
 *   numbers: ["01", "15", "33", "44", "60"],
 * };
 * ```
 */
export interface KenoPickBoardInput extends KenoBoardBase {
  /** Kiểu chọn số. Số lượng phần tử trong `numbers` phải đúng với con số sau `"pick"`. */
  playType:
    | "pick1"
    | "pick2"
    | "pick3"
    | "pick4"
    | "pick5"
    | "pick6"
    | "pick7"
    | "pick8"
    | "pick9"
    | "pick10";
  /**
   * Danh sách số Keno đã chọn (string zero-padded `"01"`–`"80"`).
   *
   * Số lượng phải khớp với `playType` (pick1=1, pick5=5, …). Không được trùng nhau.
   */
  numbers: string[];
}

/**
 * Board cược Lớn/Nhỏ (bigSmall).
 *
 * @example
 * ```ts
 * const board: KenoBigSmallBoardInput = {
 *   boardNo: "B",
 *   playType: "bigSmall",
 *   bet: "big",
 * };
 * ```
 */
export interface KenoBigSmallBoardInput extends KenoBoardBase {
  /** Phân biệt discriminator. Luôn = `"bigSmall"`. */
  playType: "bigSmall";
  /**
   * Lựa chọn cược:
   * - `"big"` — Lớn (≥ 13 số từ 41–80)
   * - `"small"` — Nhỏ (≥ 13 số từ 01–40)
   * - `"bigSmallDraw"` — Hoà (10 lớn, 10 nhỏ)
   */
  bet: KenoBigSmallBet;
}

/**
 * Board cược Chẵn/Lẻ (evenOdd).
 *
 * @example
 * ```ts
 * const board: KenoEvenOddBoardInput = {
 *   boardNo: "C",
 *   playType: "evenOdd",
 *   bet: "even",
 * };
 * ```
 */
export interface KenoEvenOddBoardInput extends KenoBoardBase {
  /** Phân biệt discriminator. Luôn = `"evenOdd"`. */
  playType: "evenOdd";
  /**
   * Lựa chọn cược:
   * - `"even"` — Chẵn (≥ 13 số chẵn)
   * - `"even1112"` — 11 hoặc 12 số chẵn
   * - `"evenOddDraw"` — Hoà (10 chẵn, 10 lẻ)
   * - `"odd1112"` — 11 hoặc 12 số lẻ
   * - `"odd"` — Lẻ (≥ 13 số lẻ)
   */
  bet: KenoEvenOddBet;
}

/**
 * Input 1 board khi mua vé Keno — discriminated union trên `playType`.
 *
 * Tất cả loại chơi đều nằm trong cùng mảng `boards[]`.
 * `playType` **bắt buộc** với mọi board; TypeScript sẽ enforce đúng fields theo từng variant.
 *
 * @example
 * ```ts
 * // Board chọn số
 * const pickBoard: KenoBoardInput = {
 *   boardNo: "A",
 *   playType: "pick5",
 *   numbers: ["01", "15", "33", "44", "60"],
 * };
 *
 * // Board cược Lớn/Nhỏ
 * const bigSmallBoard: KenoBoardInput = {
 *   boardNo: "B",
 *   playType: "bigSmall",
 *   bet: "big",
 * };
 *
 * // Board cược Chẵn/Lẻ
 * const evenOddBoard: KenoBoardInput = {
 *   boardNo: "C",
 *   playType: "evenOdd",
 *   bet: "even",
 * };
 * ```
 */
export type KenoBoardInput = KenoPickBoardInput | KenoBigSmallBoardInput | KenoEvenOddBoardInput;

/**
 * Input mua vé Keno.
 *
 * Gửi lên `POST /games/keno/bets` qua `client.keno.placeBet()`.
 *
 * Phải có ít nhất 1 board. Board bao gồm cả chọn số lẫn cược bổ sung (Lớn/Nhỏ, Chẵn/Lẻ).
 *
 * @example
 * ```ts
 * import type { KenoTicketPurchaseInput } from "@megawin/player-sdk/keno";
 *
 * // Cược cơ bản 1 kỳ — playType bắt buộc
 * const input: KenoTicketPurchaseInput = {
 *   drawIds: ["2026-02-25.001"],
 *   boards: [
 *     { boardNo: "A", playType: "pick5", numbers: ["01", "15", "33", "44", "60"] },
 *   ],
 * };
 *
 * // Cược nhiều kỳ + board cược bổ sung
 * const input2: KenoTicketPurchaseInput = {
 *   drawIds: ["2026-02-25.001", "2026-02-25.002", "2026-02-25.003"],
 *   boards: [
 *     { boardNo: "A", playType: "pick5", numbers: ["01", "15", "33", "44", "60"] },
 *     { boardNo: "B", playType: "pick3", numbers: ["22", "44", "66"] },
 *     { boardNo: "C", playType: "bigSmall", bet: "big" },
 *   ],
 * };
 * ```
 */
export interface KenoTicketPurchaseInput {
  /**
   * Danh sách drawId các kỳ quay tham gia.
   *
   * - Format mỗi ID: `YYYY-MM-DD.NNN` (vd `"2026-02-25.001"`)
   * - Tối thiểu 1, tối đa 30 kỳ
   * - Không được trùng lặp
   */
  drawIds: string[];

  /**
   * Boards cược — bao gồm cả board chọn số (pick1-pick10) lẫn cược bổ sung (bigSmall, evenOdd).
   *
   * Tối đa 3 boards (boardNo "A"/"B"/"C"), bất kỳ loại nào.
   */
  boards: KenoBoardInput[];
}

// ─────────────────────────────────────────────
// Query Params
// ─────────────────────────────────────────────

/**
 * Tham số phân trang cho danh sách vé Keno đang chờ.
 *
 * Cursor-based pagination — hiệu quả hơn offset pagination cho dataset lớn.
 * Hỗ trợ lọc theo khoảng ngày cược (giờ Việt Nam).
 *
 * @example
 * ```ts
 * // Trang đầu tiên
 * const page1 = await client.keno.listPendingTickets({ size: 10 });
 *
 * // Lọc theo ngày cược
 * const filtered = await client.keno.listPendingTickets({
 *   size: 10,
 *   from: "2026-03-01",
 *   to: "2026-03-05",
 * });
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
  /** Lọc từ ngày cược (ISO date `YYYY-MM-DD`, giờ Việt Nam). */
  from?: string;
  /** Lọc đến ngày cược (ISO date `YYYY-MM-DD`, giờ Việt Nam). */
  to?: string;
}

/**
 * Tham số truy vấn danh sách tất cả vé Keno (pending + completed).
 *
 * Hỗ trợ lọc theo khoảng ngày cược (giờ Việt Nam).
 *
 * @example
 * ```ts
 * // Lấy tất cả vé trong tháng 2/2026
 * const result = await client.keno.listTickets({
 *   size: 20,
 *   from: "2026-02-01",
 *   to: "2026-02-28",
 * });
 * ```
 */
export interface KenoListAllTicketsParams {
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
// Response Types — Draw
// ─────────────────────────────────────────────

/**
 * Thông tin kỳ quay Keno cho UI.
 *
 * Khớp với `PlayerDrawInfo` từ API.
 */
export interface KenoDrawInfo {
  /** ID kỳ quay. Format: `YYYY-MM-DD.NNN`. */
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
 * Response từ `GET /games/keno/draws/current`.
 *
 * Chứa thông tin kỳ quay hiện tại và danh sách kỳ đang mở bán.
 * Để lấy kết quả kỳ gần nhất, dùng `listDrawResults({ size: 1 })`.
 *
 * @example
 * ```ts
 * const data = await client.keno.getCurrentDraw();
 *
 * if (data.currentDraw) {
 *   console.log(data.currentDraw.drawId);           // "2026-02-25.100"
 *   console.log(data.currentDraw.sales.closeAt);     // "2026-02-25T13:05:00Z"
 * }
 * ```
 */
export interface KenoCurrentDrawResponse {
  /** Kỳ quay đang mở bán gần nhất. `null` nếu không có kỳ nào mở. */
  currentDraw: KenoDrawInfo | null;
  /** Tất cả kỳ quay đang trong trạng thái active (mở bán hoặc đóng bán). */
  activeDraws: KenoDrawInfo[];
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
 *   const settled = ticket.progress.settledDraws;
 *   const total = ticket.progress.totalDraws;
 *   const voided = ticket.voidSummary?.voidedDrawCount ?? 0;
 *   console.log(`Tiến độ: ${settled}/${total} (${voided} kỳ void)`);
 * }
 * ```
 */
export interface KenoTicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. VD: `"KENO-20260307-00001"`. */
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
    /** Số selections mỗi kỳ = boards.length. */
    selectionsPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(board.betCount). */
    betUnitsPerDraw: number;
    /** Tiền cược mỗi kỳ (VND) = betUnitsPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền cược toàn vé (VND). */
    totalAmount: number;
  };

  /** Danh sách boards đã chọn (bao gồm cả board chọn số và cược bổ sung). */
  boards: KenoBoardSummary[];

  /**
   * Tiến độ settle.
   * settledDraws = số kỳ đã xử lý xong (settled + voided).
   * Để biết bao nhiêu kỳ voided, xem voidSummary.voidedDrawCount.
   */
  progress: {
    /** Tổng số kỳ quay. */
    totalDraws: number;
    /** Số kỳ đã xử lý xong (settled + voided). */
    settledDraws: number;
  };

  /** Thông tin trả thưởng tổng. `undefined` nếu chưa có kỳ nào settle. */
  settlement?: {
    /** Tổng tiền thắng cộng dồn toàn vé (VND). */
    totalWinAmount: number;
    /** Thời điểm kỳ gần nhất được settle (ISO 8601). */
    lastSettledAt?: string;
  };

  /**
   * Tóm tắt huỷ cược. `undefined` nếu không có kỳ nào bị void.
   * Multi-draw: hoàn tiền một phần.
   * Single-draw bị void: hoàn toàn bộ, status = "refunded".
   *
   * @example
   * ```ts
   * if (ticket.voidSummary) {
   *   console.log(`${ticket.voidSummary.voidedDrawCount} kỳ bị huỷ`);
   *   console.log(`Đã hoàn: ${ticket.voidSummary.totalRefundedAmount} VND`);
   *   console.log(`Kỳ bị huỷ:`, ticket.voidSummary.voidedDrawIds);
   * }
   * ```
   */
  voidSummary?: {
    /** Tổng tiền cược gốc của các kỳ bị huỷ (VND). */
    totalVoidedAmount: number;
    /** Tổng tiền đã hoàn trả cho player (VND). */
    totalRefundedAmount: number;
    /** Số kỳ đã bị huỷ. */
    voidedDrawCount: number;
    /** Danh sách drawId của các kỳ đã bị huỷ. */
    voidedDrawIds: string[];
    /** Thời điểm kỳ gần nhất bị huỷ (ISO 8601). */
    lastVoidedAt?: string;
  };

  /** Thời điểm mua vé (ISO 8601). */
  createdAt: string;
}

/**
 * Tóm tắt board trong vé Keno — bao gồm cả board chọn số và board cược bổ sung.
 *
 * - Board chọn số: có `numbers`, `playType` = `"pick1"`-`"pick10"`.
 * - Board cược bổ sung: có `bet`, `playType` = `"bigSmall"` hoặc `"evenOdd"`.
 */
export interface KenoBoardSummary {
  /** Mã board: `"A"`, `"B"`, hoặc `"C"`. */
  boardNo: string;
  /** Kiểu chơi: `"pick1"`-`"pick10"` (chọn số) hoặc `"bigSmall"` / `"evenOdd"` (cược bổ sung). */
  playType: string;
  /** Danh sách số đã chọn (zero-padded string `"01"`-`"80"`). Chỉ có cho board chọn số. */
  numbers?: string[];
  /** Lựa chọn cược. VD: `"big"`, `"even"`, `"odd1112"`. Chỉ có cho board cược bổ sung. */
  bet?: string;
  /** Số lần cược nhân bội (≥ 1). Tiền = betCount × unitPrice. */
  betCount: number;
}

/**
 * Response phân trang danh sách vé Keno.
 *
 * Dùng cho cả `listPendingTickets` và `listTickets`.
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

  /** Kết quả từng board (bao gồm cả board chọn số và cược bổ sung). */
  boardPayouts: Array<{
    /** Mã board: `"A"`, `"B"`, hoặc `"C"`. */
    boardNo: string;
    /** Kiểu chơi: `"pick1"`-`"pick10"`, `"bigSmall"`, hoặc `"evenOdd"`. */
    playType: string;
    /**
     * Số trùng khớp với kết quả quay.
     * Board chọn số (pick1-pick10): 0-pickCount. `0` hợp lệ (pick8/9/10 có giải an ủi).
     * Board cược bổ sung (bigSmall/evenOdd): `null` — field không áp dụng.
     */
    matchCount: number | null;
    /**
     * Số lượng số đã chọn (= numbers.length).
     * Board chọn số: 1-10.
     * Board cược bổ sung: `null` — field không áp dụng.
     */
    pickCount: number | null;
    /** Lựa chọn cược. VD: `"big"`, `"even"`. Chỉ có cho board cược bổ sung. */
    bet?: string;
    /** Kết quả thực tế của kỳ quay. VD: `"big"`, `"even"`. Chỉ có cho board cược bổ sung. */
    outcome?: string;
    /** Thắng hay thua. Set cho tất cả play types. */
    isWin: boolean;
    /** Tiền thưởng board này (VND). */
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
  /** ID kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Trạng thái entry. */
  status: string;
  /** Tiền cược kỳ này (VND) = betUnitCount × unitPrice. */
  amount: number;
  /** Mệnh giá 1 lần tham gia dự thưởng (VND). */
  unitPrice: number;
  /** Số lượng selections = boards.length. Không tính multiplier. */
  selectionCount: number;
  /** Tổng đơn vị cược = Σ(board.betCount). amount = betUnitCount × unitPrice. */
  betUnitCount: number;

  /** Bản sao thông tin cược tại thời điểm đặt. */
  entrySummary: {
    /** Mã vé. VD: `"KENO-20260307-00001"`. */
    ticketNo: string;
    /** Boards đã cược (bao gồm cả board chọn số và cược bổ sung). */
    boards: Array<{
      /** Mã board: `"A"`, `"B"`, hoặc `"C"`. */
      boardNo: string;
      /** Kiểu chơi. */
      playType: string;
      /** Danh sách số đã chọn. Chỉ có cho board chọn số. */
      numbers?: string[];
      /** Lựa chọn cược. Chỉ có cho board cược bổ sung. */
      bet?: string;
      /** Số lần cược nhân bội cho board này. Tiền = betCount × unitPrice. */
      betCount: number;
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
 * Response từ `GET /games/keno/tickets/{ticketId}/entries`.
 *
 * Chứa danh sách entries (mỗi kỳ quay 1 entry).
 * Để lấy thông tin vé, dùng `listTickets()` hoặc `listPendingTickets()`.
 *
 * @example
 * ```ts
 * const data = await client.keno.getTicketEntries("65abc123def456...");
 * console.log(data.entries.length); // 5 (nếu mua 5 kỳ)
 *
 * const settled = data.entries.filter(e => e.payout);
 * const totalWin = settled.reduce((sum, e) => sum + e.payout!.winAmount, 0);
 * ```
 */
export interface KenoTicketEntriesResponse {
  /** Danh sách entries theo kỳ quay (sắp xếp theo drawTime tăng dần). */
  entries: KenoEntryInfo[];
}

// ─────────────────────────────────────────────
// Response Types — Place Bet
// ─────────────────────────────────────────────

/**
 * Response khi đặt cược Keno thành công.
 *
 * Trả về từ `POST /games/keno/bets` qua `client.keno.placeBet()`.
 *
 * @example
 * ```ts
 * const result = await client.keno.placeBet({
 *   drawIds: ["2026-02-25.001"],
 *   boards: [{ boardNo: "A", numbers: ["01", "15", "33", "44", "60"] }],
 * });
 * console.log(result.ticketId);            // "65abc..."
 * console.log(result.ticketNo);            // "KENO-20260307-00001"
 * console.log(result.pricing.totalAmount); // 10000
 * ```
 */
export interface KenoPlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. VD: `"KENO-20260307-00001"`. */
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
    /** Số selections mỗi kỳ = boards.length. */
    selectionsPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(board.betCount). */
    betUnitsPerDraw: number;
    /** Tiền cược mỗi kỳ (VND) = betUnitsPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền cược toàn vé (VND). */
    totalAmount: number;
  };

  /** Số lượng boards trong vé (bao gồm cả board chọn số và cược bổ sung). */
  boardCount: number;
  /** Số lượng entries đã tạo (= số kỳ quay). */
  entryCount: number;
}

// ─────────────────────────────────────────────
// Response Types — Game Config
// ─────────────────────────────────────────────

/**
 * Luật chơi game Keno.
 */
export interface KenoGameRules {
  /** Mệnh giá 1 lần tham gia (VND). VD: 10000. */
  unitPrice: number;
  /** Số panel tối đa / vé. VD: 3 (A, B, C). */
  maxBasicBoardsPerTicket: number;
  /** Số kỳ liên tiếp tối đa. VD: 20. */
  maxDrawCount: number;
  /** Khoảng cách giữa các kỳ quay (phút). VD: 10. */
  drawIntervalMinutes: number;
  /** Giờ bắt đầu quay. VD: "06:00". */
  firstDrawTime: string;
  /** Giờ kết thúc quay (kỳ cuối). VD: "21:52". */
  lastDrawTime: string;
  /** Số lần cược tối thiểu cho 1 board/side bet. */
  minBetCount: number;
  /** Số lần cược tối đa cho 1 board/side bet. */
  maxBetCount: number;
}

/**
 * Bảng giải thưởng cơ bản Keno.
 *
 * Key ngoài là `pickCount` (số ô đã chọn: `"1"`–`"10"`),
 * key trong là `matchCount` (số trùng với kết quả: `"0"`–`"10"`),
 * value là tiền thưởng (VND).
 *
 * JSON trả về key dạng string (`"5"`, `"10"`) — dùng string khi truy cập.
 *
 * @example
 * ```ts
 * // Giải pick5 trùng 3 số
 * const prize = config.prizes.basic["5"]["3"]; // 10000
 *
 * // Giải pick10 trùng 10 số (jackpot)
 * const jackpot = config.prizes.basic["10"]["10"]; // 1500000000
 * ```
 */
export type KenoBasicPrizesConfig = Record<string, Record<string, number>>;

/**
 * Bảng giải thưởng Lớn/Nhỏ.
 */
export interface KenoBigSmallPrizesConfig {
  /** >= 13 số lớn (41-80). */
  big13Plus: number;
  /** 11 hoặc 12 số lớn. */
  big1112: number;
  /** Hòa (10 lớn + 10 nhỏ). */
  draw: number;
  /** 11 hoặc 12 số nhỏ. */
  small1112: number;
  /** >= 13 số nhỏ (1-40). */
  small13Plus: number;
}

/**
 * Bảng giải thưởng Chẵn/Lẻ.
 */
export interface KenoEvenOddPrizesConfig {
  /** >= 15 số chẵn. */
  even15Plus: number;
  /** 13 hoặc 14 số chẵn. */
  even1314: number;
  /** 11 hoặc 12 số chẵn. */
  even1112: number;
  /** Hòa (10 chẵn + 10 lẻ). */
  draw: number;
  /** 11 hoặc 12 số lẻ. */
  odd1112: number;
  /** 13 hoặc 14 số lẻ. */
  odd1314: number;
  /** >= 15 số lẻ. */
  odd15Plus: number;
}

/**
 * Toàn bộ bảng giải thưởng Keno.
 */
export interface KenoPrizesConfig {
  /**
   * Giải cơ bản: `basic[pickCount][matchCount]` = VND.
   *
   * pickCount: 1-10 (số ô đã chọn).
   * matchCount: 0-pickCount (số trùng với kết quả quay).
   */
  basic: KenoBasicPrizesConfig;
  /** Giải Lớn/Nhỏ. */
  bigSmall: KenoBigSmallPrizesConfig;
  /** Giải Chẵn/Lẻ. */
  evenOdd: KenoEvenOddPrizesConfig;
}

/**
 * Giới hạn trả thưởng mỗi kỳ quay (payout caps).
 *
 * Keno giới hạn tổng trả thưởng tối đa 10 tỷ VND/kỳ cho bậc 8, 9, 10.
 * Khi số bộ trúng vượt ngưỡng `MaxSetsForFixed`, chia đều `MaxPerDraw`.
 */
export interface KenoPayoutCapsConfig {
  /** Pick 8: giới hạn tổng (VND). */
  pick8MaxPerDraw: number;
  /** Pick 8: số bộ tối đa nhận giải cố định. */
  pick8MaxSetsForFixed: number;
  /** Pick 9: giới hạn tổng (VND). */
  pick9MaxPerDraw: number;
  /** Pick 9: số bộ tối đa nhận giải cố định. */
  pick9MaxSetsForFixed: number;
  /** Pick 10: giới hạn tổng (VND). */
  pick10MaxPerDraw: number;
  /** Pick 10: số bộ tối đa nhận giải cố định. */
  pick10MaxSetsForFixed: number;
}

/**
 * Cấu hình theo tenant.
 */
export interface KenoTenantConfig {
  /** Tenant này có được phép chơi game Keno không. */
  isEnabled: boolean;
}

/**
 * Response từ `GET /games/keno/config`.
 *
 * Chứa toàn bộ cấu hình game cần thiết cho frontend:
 * - Luật chơi (mệnh giá, số panel, số kỳ tối đa...)
 * - Bảng giải thưởng (cơ bản, Lớn/Nhỏ, Chẵn/Lẻ)
 * - Giới hạn trả thưởng bậc 8/9/10
 * - Cấu hình tenant (có được phép chơi không)
 *
 * @example
 * ```ts
 * const config = await client.keno.getGameConfig();
 *
 * // Kiểm tra tenant có được phép chơi không
 * if (!config.tenant.isEnabled) {
 *   showDisabledMessage();
 *   return;
 * }
 *
 * // Hiển thị mệnh giá
 * console.log("Mệnh giá:", config.game.unitPrice); // 10000
 *
 * // Tra bảng giải thưởng: pick5, trùng 3 số
 * console.log("Giải pick5/match3:", config.prizes.basic[5][3]);
 *
 * // Giới hạn số kỳ liên tiếp
 * console.log("Tối đa kỳ:", config.game.maxDrawCount); // 20
 * ```
 */
export interface KenoGameConfigResponse {
  /** Luật chơi. */
  game: KenoGameRules;
  /** Bảng giải thưởng. */
  prizes: KenoPrizesConfig;
  /** Giới hạn trả thưởng mỗi kỳ. */
  payoutCaps: KenoPayoutCapsConfig;
  /** Cấu hình theo tenant. */
  tenant: KenoTenantConfig;
}

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

// ─────────────────────────────────────────────
// Response Types — Draw Results (kết quả kỳ quay)
// ─────────────────────────────────────────────

/**
 * Chi tiết giải thưởng 1 bậc chơi trong kỳ quay Keno (unified).
 *
 * Bao gồm cả giải board chọn số (pick1-pick10) và cược bổ sung (bigSmall, evenOdd).
 *
 * - Board chọn số: `pickCount` + `matchCount` xác định bậc giải.
 * - Board cược bổ sung: `bet` xác định lựa chọn trúng.
 *
 * @example
 * ```ts
 * // Board chọn số: pickCount=10, matchCount=10 → jackpot
 * // Board cược bổ sung: playType="bigSmall", bet="big" → trúng Lớn
 * ```
 */
export interface KenoDrawPrizeDetail {
  /** Kiểu chơi: `"pick1"`-`"pick10"`, `"bigSmall"`, hoặc `"evenOdd"`. */
  playType: string;
  /**
   * Bậc chơi (pickCount): 1-10 cho board chọn số.
   * Board cược bổ sung (bigSmall/evenOdd): `null` — field không áp dụng.
   */
  pickCount: number | null;
  /**
   * Số trùng khớp (matchCount): 0-pickCount cho board chọn số.
   * Board cược bổ sung: `null` — field không áp dụng.
   */
  matchCount: number | null;
  /**
   * Lựa chọn cược trúng. Chỉ có cho board cược bổ sung.
   * - bigSmall: `"big"` | `"small"` | `"bigSmallDraw"`
   * - evenOdd: `"even"` | `"odd"` | `"even1112"` | `"odd1112"` | `"evenOddDraw"`
   */
  bet?: string;
  /** Tổng số bộ trúng. */
  winnerCount: number;
  /** Tiền thưởng mỗi bộ (VND). Bậc 8/9/10 có thể bị cap. */
  prizePerUnit: number;
}

/**
 * Tham số truy vấn danh sách kết quả kỳ quay Keno.
 *
 * @example
 * ```ts
 * const page1 = await client.keno.listDrawResults({ size: 10 });
 *
 * // Lọc từ ngày
 * const filtered = await client.keno.listDrawResults({
 *   size: 10,
 *   from: "2026-03-01",
 * });
 *
 * // Trang tiếp theo
 * if (page1.nextCursor) {
 *   const page2 = await client.keno.listDrawResults({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface KenoListDrawResultsParams {
  /** Số kỳ mỗi trang (mặc định 20). */
  size?: number;
  /**
   * Lọc từ ngày (ISO date `YYYY-MM-DD`, inclusive).
   * Mặc định = ngày hôm nay (giờ VN) nếu không truyền.
   * Khi paginate với cursor, phải truyền cùng `from` với request đầu tiên.
   */
  from?: string;
  /** Cursor cho trang tiếp theo (drawId từ response trước). */
  cursor?: string;
}

/**
 * Kết quả 1 kỳ quay Keno cho player.
 *
 * Chứa 20 số trúng, stats Chẵn/Lẻ + Lớn/Nhỏ, và bảng giải thưởng thống nhất
 * (bao gồm cả board chọn số và cược bổ sung).
 *
 * Dùng cho endpoint chi tiết: GET /games/keno/draw-results/:drawId
 */
export interface KenoDrawResultDetail {
  /** ID kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Thời điểm quay (ISO 8601). */
  drawTime: string;

  /** Kết quả kỳ quay. */
  result: {
    /** 20 số trúng thưởng dạng string "01"-"80". */
    winningNumbers: string[];
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
    /** Số lượng số lớn (41-80). */
    bigCount: number;
    /** Số lượng số nhỏ (1-40). */
    smallCount: number;
    /** Số lượng số chẵn. */
    evenCount: number;
    /** Số lượng số lẻ. */
    oddCount: number;
  };

  /** Bảng giải thưởng thống nhất — chứa cả giải board chọn số và cược bổ sung có người trúng. */
  prizes: KenoDrawPrizeDetail[];

  /** Tham chiếu Vietlott. */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

/**
 * Tóm tắt 1 kỳ quay Keno trong danh sách — chỉ trả kết quả draw, không có bảng giải thưởng.
 *
 * Dùng cho endpoint danh sách: GET /games/keno/draw-results
 * Prize details xem ở: GET /games/keno/draw-results/:drawId
 *
 * @example
 * ```ts
 * const { draws } = await client.keno.listDrawResults({ size: 10 });
 * for (const draw of draws) {
 *   console.log(`Kỳ ${draw.drawId}: ${draw.result.winningNumbers.join(", ")}`);
 *   console.log(`Chẵn: ${draw.result.evenCount}, Lẻ: ${draw.result.oddCount}`);
 * }
 * ```
 */
export interface KenoDrawResultSummary {
  /** ID kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Thời điểm quay (ISO 8601). */
  drawTime: string;

  /** Kết quả kỳ quay. */
  result: {
    /** 20 số trúng thưởng dạng string "01"-"80". */
    winningNumbers: string[];
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
    /** Số lượng số lớn (41-80). */
    bigCount: number;
    /** Số lượng số nhỏ (1-40). */
    smallCount: number;
    /** Số lượng số chẵn. */
    evenCount: number;
    /** Số lượng số lẻ. */
    oddCount: number;
  };

  /** Tham chiếu Vietlott. */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

/**
 * Response phân trang danh sách kết quả kỳ quay Keno.
 *
 * @example
 * ```ts
 * const page = await client.keno.listDrawResults({ size: 10 });
 * console.log(page.draws.length);  // tối đa 10
 * console.log(page.nextCursor);    // "2026-03-07.095" hoặc null
 * ```
 */
export interface KenoListDrawResultsResponse {
  /** Danh sách tóm tắt kỳ quay (không có bảng giải thưởng). */
  draws: KenoDrawResultSummary[];
  /** Cursor cho trang tiếp theo. `null` nếu hết. */
  nextCursor: string | null;
  /** Số lượng kỳ yêu cầu (echo lại size). */
  size: number;
}

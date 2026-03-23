/**
 * Mega 6/45 SDK – Public Types
 *
 * @module
 */

import type { Mega645PlayType, Mega645PrizeTier } from "./enums";

// ─────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────

/**
 * Lựa chọn số cho một board Mega 6/45.
 */
export interface Mega645SelectionInput {
  /** Danh sách số chọn. Dạng string zero-padded `"01"`–`"45"`. */
  mainNumbers: string[];
}

/**
 * Một board trong vé Mega 6/45.
 */
export interface Mega645BoardInput {
  /** Ký hiệu board. VD: `"A"`, `"B"`, `"C"`. */
  boardNo: string;
  /** Kiểu chơi của board này. */
  playType: Mega645PlayType;
  /** Số đã chọn. */
  selection: Mega645SelectionInput;
  /**
   * Số lần cược nhân bội cho board này (≥ minBetCount, ≤ maxBetCount).
   *
   * Tiền cược board = expandedLines × betCount × unitPrice.
   * Tiền thưởng cũng nhân theo betCount. Mặc định = 1.
   */
  betCount?: number;
}

/**
 * Input để đặt cược Mega 6/45.
 *
 * Gửi lên `POST /games/mega645/bets` qua `client.mega645.placeBet()`.
 *
 * @example
 * ```ts
 * import type { Mega645TicketPurchaseInput } from "@megawin/player-sdk/mega645";
 *
 * const input: Mega645TicketPurchaseInput = {
 *   drawIds: ["2026-03-07.001", "2026-03-14.001"],
 *   boards: [
 *     {
 *       boardNo: "A",
 *       playType: "standard",
 *       selection: { mainNumbers: ["05", "12", "22", "31", "40", "45"] },
 *     },
 *   ],
 * };
 * const result = await client.mega645.placeBet(input);
 * console.log(result.ticketId);                   // "65abc..."
 * console.log(result.pricing.totalAmount);        // 20000
 * ```
 */
export interface Mega645TicketPurchaseInput {
  /**
   * Danh sách drawId các kỳ quay tham gia.
   *
   * - Format mỗi ID: `YYYY-MM-DD.NNN` (VD: `"2026-03-07.001"`)
   * - Tối thiểu 1, tối đa 6 kỳ
   * - Không được trùng lặp
   */
  drawIds: string[];
  /** Danh sách boards trong vé. Tối đa 6 boards, không được trùng boardNo. */
  boards: Mega645BoardInput[];
}

// ─────────────────────────────────────────────
// Response Types — Game Config
// ─────────────────────────────────────────────

/**
 * Luật chơi game Mega 6/45.
 */
export interface Mega645GameRules {
  /** Giá 1 lượt chơi (VND). */
  unitPrice: number;
  /** Số board tối đa mỗi vé. */
  maxBoardsPerTicket: number;
  /** Số kỳ tối đa đặt liên tiếp. */
  maxDrawCount: number;
  /** Số kỳ quay mỗi tuần. */
  drawsPerWeek: number;
  /** Ngày quay trong tuần (0 = Chủ nhật, 3 = Thứ 4, 5 = Thứ 6). */
  drawDaysOfWeek: number[];
  /** Giờ quay. VD: `"18:00"`. */
  drawTime: string;
  /** Số lần cược tối thiểu cho 1 board. */
  minBetCount: number;
  /** Số lần cược tối đa cho 1 board. */
  maxBetCount: number;
}

/**
 * Giá trị giải thưởng cố định Mega 6/45 (không bao gồm Jackpot).
 */
export interface Mega645PrizeAmounts {
  /** Giải nhất — khớp 5 số chính (VND). */
  tier1: number;
  /** Giải nhì — khớp 4 số chính (VND). */
  tier2: number;
  /** Giải ba — khớp 3 số chính (VND). */
  tier3: number;
}

/**
 * Cấu hình Jackpot Mega 6/45.
 */
export interface Mega645JackpotConfigInfo {
  /** Số tiền khởi điểm mỗi chu kỳ Jackpot (VND). */
  seedAmount: number;
  /** Ngưỡng kích hoạt chia Jackpot (VND). */
  splitThreshold: number;
}

/**
 * Trạng thái cấu hình tenant cho Mega 6/45.
 */
export interface Mega645TenantConfig {
  /** `true` nếu game Mega 6/45 đang được bật cho tenant này. */
  isEnabled: boolean;
}

/**
 * Cấu hình đầy đủ game Mega 6/45 — luật chơi, giải thưởng, jackpot, trạng thái tenant.
 *
 * Trả về bởi `GET /games/mega645/config`.
 *
 * @example
 * ```ts
 * const config = await client.mega645.getGameConfig();
 * console.log(config.game.unitPrice);          // 10000
 * console.log(config.jackpot.seedAmount);      // 2000000000
 * console.log(config.tenant.isEnabled);        // true
 * ```
 */
export interface Mega645GameConfigResponse {
  /** Luật chơi và lịch quay. */
  game: Mega645GameRules;
  /** Giá trị các giải thưởng cố định. */
  prizes: Mega645PrizeAmounts;
  /** Cấu hình jackpot (seed, split threshold). */
  jackpot: Mega645JackpotConfigInfo;
  /** Cấu hình tenant cho game này. */
  tenant: Mega645TenantConfig;
}

// ─────────────────────────────────────────────
// Response Types — Draw / Ticket / Entry
// ─────────────────────────────────────────────

/**
 * Thông tin kỳ quay Mega 6/45 hiện tại hoặc sắp tới.
 *
 * Trả về bởi `GET /games/mega645/draws/current`.
 *
 * @example
 * ```ts
 * const draw = await client.mega645.getCurrentDraw();
 * console.log(draw.drawId);              // "2026-03-07.001"
 * console.log(draw.jackpotCurrentAmount); // 8500000000
 * ```
 */
export interface Mega645DrawInfo {
  /** Mã kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Giờ quay (ISO 8601). */
  drawTime: string;
  /** Trạng thái kỳ quay. VD: `"open"`, `"closed"`, `"settled"`. */
  status: string;
  /** Khung giờ bán vé. */
  sales: {
    /** Thời điểm mở bán (ISO 8601). `undefined` nếu đã mở sẵn. */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
  /** Giá trị Jackpot hiện tại (VND). */
  jackpotCurrentAmount: number;
  /** `true` nếu kỳ này đang trong chu kỳ chia Jackpot. */
  isSplitCycle?: boolean;
}

/**
 * Tóm tắt vé Mega 6/45 cho UI danh sách vé.
 *
 * Trả về bởi `client.mega645.listPendingTickets()` và `client.mega645.listTickets()`.
 *
 * @example
 * ```ts
 * const { tickets } = await client.mega645.listPendingTickets();
 * for (const ticket of tickets) {
 *   const voided = ticket.voidSummary?.voidedDrawCount ?? 0;
 *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ (${voided} void)`);
 *   if (ticket.voidSummary) {
 *     console.log(`Đã hoàn: ${ticket.voidSummary.totalRefundedAmount} VND`);
 *   }
 * }
 * ```
 */
export interface Mega645TicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. VD: `"M645-20260307-00003"`. */
  ticketNo: string;
  /** Trạng thái vé. VD: `"pending"`, `"partial"`, `"settled"`, `"voided"`. */
  status: string;
  /** Kế hoạch kỳ quay của vé. */
  drawPlan: {
    /** Danh sách drawId trong vé. Format mỗi ID: `YYYY-MM-DD.NNN`. */
    drawIds: string[];
    /** Tổng số kỳ đã đặt. */
    drawCount: number;
  };
  /** Thông tin giá cược. */
  pricing: {
    /** Giá mỗi lượt chơi (VND). */
    unitPrice: number;
    /** Số lines mỗi kỳ = Σ(board.expandedLines). */
    linesPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(board.expandedLines × board.betCount). */
    betUnitsPerDraw: number;
    /** Tổng tiền mỗi kỳ (VND) = betUnitsPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền cả vé (VND). */
    totalAmount: number;
  };
  /** Danh sách boards trong vé. */
  boards: Array<{
    /** Ký hiệu board. VD: `"A"`, `"B"`. */
    boardNo: string;
    /** Kiểu chơi của board này. */
    playType: Mega645PlayType;
    /** Số đã chọn. */
    selection: {
      /** Danh sách số chính. Dạng string zero-padded `"01"`–`"45"`. */
      mainNumbers: string[];
    };
    /** Số lines được expand từ kiểu chơi này. */
    expandedLines: number;
    /**
     * Số lần cược nhân bội (≥ 1).
     *
     * Tiền cược board = expandedLines × betCount × unitPrice.
     */
    betCount: number;
  }>;
  /**
   * Tiến độ settle.
   *
   * `settledDraws` = số kỳ đã xử lý xong (bao gồm cả settled và voided).
   */
  progress: {
    /** Tổng số kỳ của vé. */
    totalDraws: number;
    /** Số kỳ đã xử lý xong. */
    settledDraws: number;
  };
  /** Tổng kết trả thưởng. `undefined` nếu chưa có kỳ nào settle. */
  settlement?: {
    /** Tổng tiền thắng (VND). */
    totalWinAmount: number;
    /** Thời điểm settle lần cuối (ISO 8601). */
    lastSettledAt?: string;
  };
  /**
   * Tóm tắt huỷ cược (void). `undefined` nếu không có kỳ nào bị void.
   */
  voidSummary?: {
    /** Tổng tiền bị void (VND). */
    totalVoidedAmount: number;
    /** Tổng tiền đã hoàn trả (VND). */
    totalRefundedAmount: number;
    /** Số kỳ bị void. */
    voidedDrawCount: number;
    /** Danh sách drawId bị void. Format: `YYYY-MM-DD.NNN`. */
    voidedDrawIds: string[];
    /** Thời điểm void lần cuối (ISO 8601). */
    lastVoidedAt?: string;
  };
  /** Thời điểm mua vé (ISO 8601). */
  createdAt: string;
}

/**
 * Kết quả một kỳ quay của vé Mega 6/45 (entry).
 *
 * Trả về bởi `client.mega645.getTicketEntries()`.
 */
export interface Mega645EntryResult {
  /** Mã kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Trạng thái entry. VD: `"pending"`, `"settled"`, `"voided"`. */
  status: string;
  /** Tiền cược kỳ này (VND). */
  amount: number;
  /** Đơn giá 1 line (VND). */
  unitPrice: number;
  /** Tổng số lines trong entry = Σ(board.expandedLines). */
  lineCount: number;
  /** Tổng đơn vị cược = Σ(board.expandedLines × board.betCount). */
  betUnitCount: number;
  /** Kết quả quay. `undefined` nếu chưa có kết quả. */
  result?: {
    /** 6 số trúng thưởng. Giá trị nguyên `1`–`45`. */
    winningMain: number[];
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /** Thông tin trả thưởng. `undefined` nếu chưa settle. */
  payout?: {
    /** Tổng tiền thắng (VND). `0` nếu không trúng. */
    winAmount: number;
    /** Chi tiết từng giải thưởng trúng. */
    tiers: Array<{
      /** Hạng giải. */
      tier: Mega645PrizeTier;
      /** Tên giải hiển thị. VD: `"Jackpot"`, `"Giải nhất"`. */
      label: string;
      /** Số lần trúng giải này. */
      hitCount: number;
      /** Tổng tiền thưởng giải này (VND). */
      amount: number;
      /** Tiền bonus từ chia Jackpot (VND). `undefined` nếu không có. */
      splitBonus?: number;
    }>;
  };
}

// ─────────────────────────────────────────────
// Response Types — Draw Results
// ─────────────────────────────────────────────

/**
 * Chi tiết giải thưởng 1 tier trong kết quả kỳ quay Mega 6/45.
 *
 * Dùng trong {@link Mega645DrawResultDetail}.
 */
export interface Mega645DrawTierPrize {
  /**
   * Hạng giải.
   *
   * | Tier      | Điều kiện | Giải thưởng          |
   * |-----------|-----------|----------------------|
   * | jackpot   | 6/6 số    | Tích luỹ (≥ 12 tỷ)  |
   * | tier1     | 5/6 số    | 10.000.000 VND       |
   * | tier2     | 4/6 số    | 300.000 VND          |
   * | tier3     | 3/6 số    | 30.000 VND           |
   */
  tier: Mega645PrizeTier;
  /**
   * Số lượt trúng tier này (tổng hit count từ tất cả entries trong kỳ).
   * Không phải số người chơi — 1 vé bao có thể trúng nhiều lần.
   */
  winnerCount: number;
  /**
   * Tổng tiền thưởng tier này (VND).
   * Jackpot: = openingAmount + jackpotContribution kỳ này.
   * Non-jackpot: giải cố định × số lượt trúng.
   */
  prizeAmount: number;
}

/**
 * Kết quả chi tiết 1 kỳ quay Mega 6/45 — dùng cho trang xem kết quả.
 *
 * Bao gồm: 6 số chính, Jackpot snapshot, bảng giải thưởng chi tiết.
 * Chỉ có cho draws đã settle.
 *
 * Trả về bởi `GET /games/mega645/draw-results/:drawId`.
 *
 * @example
 * ```ts
 * const result = await client.mega645.getDrawResult("2026-03-08.001");
 *
 * console.log(`Số: ${result.result.winningMain.join(", ")}`);
 * // "Số: 06, 12, 13, 25, 31, 32"
 *
 * console.log(`Jackpot: ${result.jackpot.closingAmount.toLocaleString()} VND`);
 * // "Jackpot: 18,851,320,000 VND"
 *
 * for (const prize of result.prizes) {
 *   console.log(`${prize.tier}: ${prize.winnerCount} lượt, ${prize.prizeAmount.toLocaleString()} VND`);
 * }
 * // "jackpot: 0 lượt, 18,851,320,000 VND"
 * // "tier1: 15 lượt, 10,000,000 VND"
 * // "tier2: 1073 lượt, 300,000 VND"
 * // "tier3: 18030 lượt, 30,000 VND"
 * ```
 */
export interface Mega645DrawResultDetail {
  /** Mã kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (luôn = 1 cho Mega 6/45). */
  drawNo: number;
  /** Giờ quay (ISO 8601). */
  drawTime: string;
  /**
   * Kết quả kỳ quay.
   * Mega 6/45: chỉ 6 số chính, KHÔNG có số đặc biệt.
   */
  result: {
    /** 6 số chính trúng thưởng (sorted, zero-padded `"01"`–`"45"`). */
    winningMain: string[];
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /**
   * Snapshot Jackpot tại kỳ quay.
   * openingAmount = Jackpot trước kỳ. closingAmount = Jackpot sau kỳ (nếu có winner = seedAmount).
   */
  jackpot: {
    /** Jackpot đầu kỳ (VND). */
    openingAmount: number;
    /** Jackpot cuối kỳ (VND). */
    closingAmount: number;
  };
  /**
   * Bảng giải thưởng chi tiết từng hạng.
   * Tất cả 4 tiers luôn có mặt (kể cả winnerCount = 0).
   */
  prizes: Mega645DrawTierPrize[];
  /** Tham chiếu kỳ Vietlott chính thức (nếu có). */
  vietlottRef?: {
    /** Mã kỳ Vietlott. */
    drawPeriod: string;
    /** Ngày quay Vietlott (YYYY-MM-DD). */
    drawDate: string;
  };
}

/**
 * Tóm tắt 1 kỳ quay Mega 6/45 trong danh sách kết quả.
 *
 * Chỉ chứa 6 số chính + Jackpot snapshot.
 * Không có bảng giải thưởng chi tiết (xem ở {@link Mega645DrawResultDetail}).
 *
 * Trả về bởi `GET /games/mega645/draw-results`.
 *
 * @example
 * ```ts
 * const { draws } = await client.mega645.listDrawResults({ size: 10 });
 * for (const draw of draws) {
 *   console.log(`Kỳ ${draw.drawId}: ${draw.result.winningMain.join(", ")}`);
 *   console.log(`JP: ${draw.jackpot.closingAmount.toLocaleString()} VND`);
 * }
 * ```
 */
export interface Mega645DrawResultSummary {
  /** Mã kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Giờ quay (ISO 8601). */
  drawTime: string;
  /**
   * Kết quả kỳ quay.
   * Mega 6/45: chỉ 6 số chính, KHÔNG có số đặc biệt.
   */
  result: {
    /** 6 số chính trúng thưởng (sorted, zero-padded `"01"`–`"45"`). */
    winningMain: string[];
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /** Jackpot snapshot — hữu ích để hiển thị kỳ có trúng Jackpot không. */
  jackpot: {
    /** Jackpot đầu kỳ (VND). */
    openingAmount: number;
    /** Jackpot cuối kỳ (VND). */
    closingAmount: number;
  };
  /** Tham chiếu Vietlott (nếu có). */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

// ─────────────────────────────────────────────
// Response Types — Place Bet
// ─────────────────────────────────────────────

/**
 * Response khi đặt cược Mega 6/45 thành công.
 *
 * Trả về từ `POST /games/mega645/bets` qua `client.mega645.placeBet()`.
 */
export interface Mega645PlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. VD: `"M645-20260307-00003"`. */
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
    /** Đơn giá 1 line cho 1 kỳ (VND). */
    unitPrice: number;
    /** Tổng số lines mỗi kỳ = Σ(board.expandedLines). */
    linesPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(board.expandedLines × betCount). */
    betUnitsPerDraw: number;
    /** Giá mỗi kỳ (VND) = betUnitsPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền toàn vé (VND). */
    totalAmount: number;
  };

  /** Số lượng boards trên vé. */
  boardCount: number;
  /** Số lượng entries đã tạo (= số kỳ quay). */
  entryCount: number;
}

// ─────────────────────────────────────────────
// Params & Pagination Response Types
// ─────────────────────────────────────────────

/**
 * Tham số phân trang cho danh sách vé Mega 6/45 đang chờ xử lý.
 *
 * Cursor-based pagination. Không hỗ trợ lọc ngày — chỉ trả vé đang active.
 *
 * @example
 * ```ts
 * const page1 = await client.mega645.listPendingTickets({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.mega645.listPendingTickets({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Mega645ListPendingTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
}

/**
 * Tham số lọc và phân trang cho lịch sử vé Mega 6/45 (tất cả trạng thái).
 *
 * Hỗ trợ lọc theo khoảng ngày đặt cược (giờ Việt Nam).
 *
 * @example
 * ```ts
 * const march = await client.mega645.listTickets({
 *   from: "2026-03-01",
 *   to: "2026-03-31",
 * });
 *
 * if (march.nextCursor) {
 *   const page2 = await client.mega645.listTickets({
 *     size: 20,
 *     cursor: march.nextCursor,
 *   });
 * }
 * ```
 */
export interface Mega645ListAllTicketsParams {
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
 * Tham số truy vấn danh sách kết quả kỳ quay Mega 6/45.
 *
 * Cursor-based pagination, filter từ ngày.
 *
 * @example
 * ```ts
 * // Kết quả từ ngày 1/3/2026
 * const results = await client.mega645.listDrawResults({
 *   from: "2026-03-01",
 *   size: 10,
 * });
 *
 * // Trang tiếp theo
 * if (results.nextCursor) {
 *   const page2 = await client.mega645.listDrawResults({
 *     from: "2026-03-01",
 *     size: 10,
 *     cursor: results.nextCursor,
 *   });
 * }
 * ```
 */
export interface Mega645ListDrawResultsParams {
  /** Số lượng kết quả mỗi trang (mặc định 20). */
  size?: number;
  /**
   * Lọc từ ngày (ISO date `YYYY-MM-DD`, inclusive).
   * Mặc định = ngày hôm nay (giờ VN) nếu không truyền.
   * Khi paginate với cursor, phải truyền cùng `from` với request đầu tiên.
   */
  from?: string;
  /** Cursor cho trang tiếp theo (drawId, lấy từ `nextCursor`). */
  cursor?: string;
}

/**
 * Thông tin kỳ quay Mega 6/45 hiện tại.
 *
 * Trả về bởi `client.mega645.getCurrentDraw()`.
 */
export interface Mega645CurrentDrawResponse {
  /** Kỳ quay đang mở bán, hoặc `null` nếu chưa có. */
  currentDraw: Mega645DrawInfo | null;
  /** Tất cả kỳ quay đang active (bao gồm salesOpen và salesClosed). */
  activeDraws: Mega645DrawInfo[];
}

/**
 * Thông tin Jackpot Mega 6/45 hiện tại.
 *
 * Trả về bởi `client.mega645.getJackpot()`.
 */
export interface Mega645JackpotResponse {
  /** Giá trị Jackpot hiện tại (VND). */
  jackpotAmount: number;
  /** ID chu kỳ Jackpot đang chạy. */
  cycleId: string;
  /** Thời điểm mở cycle (ISO 8601). */
  openedAt: string;
}

/**
 * Danh sách vé Mega 6/45 (cursor-based).
 *
 * Trả về bởi `client.mega645.listPendingTickets()` và `client.mega645.listTickets()`.
 */
export interface Mega645ListTicketsResponse {
  /** Danh sách vé trong trang hiện tại. */
  tickets: Mega645TicketSummary[];
  /** Cursor để lấy trang tiếp theo, `null` nếu đã hết. */
  nextCursor: string | null;
  /** Số vé thực tế trả về. */
  size: number;
}

/**
 * Chi tiết vé và các lần tham gia kỳ quay của vé Mega 6/45.
 *
 * Trả về bởi `client.mega645.getTicketEntries()`.
 */
export interface Mega645TicketEntriesResponse {
  /** Thông tin tóm tắt vé. */
  ticket: Mega645TicketSummary;
  /** Danh sách entries (1 entry = 1 kỳ quay). */
  entries: Mega645EntryResult[];
}

/**
 * Danh sách lines chi tiết của một entry Mega 6/45.
 *
 * Trả về bởi `client.mega645.getEntryLines()`.
 */
export interface Mega645EntryLinesResponse {
  /** ID entry. */
  entryId: string;
  /** Danh sách lines đã expand từ boards. */
  lines: Array<{ mainNumbers: number[] }>;
}

/**
 * Response phân trang danh sách kết quả kỳ quay Mega 6/45.
 */
export interface Mega645ListDrawResultsResponse {
  /** Danh sách tóm tắt kỳ quay (6 số + jackpot, không có bảng giải thưởng). */
  draws: Mega645DrawResultSummary[];
  /** Cursor cho trang tiếp theo. `null` nếu hết. */
  nextCursor: string | null;
  /** Số lượng mỗi trang (echo lại `size`). */
  size: number;
}

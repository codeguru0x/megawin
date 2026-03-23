/**
 * Power 6/55 SDK – Public Types
 * @module
 */

import type { Power655PlayType, Power655PrizeTier } from "./enums";

// ─────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────

export interface Power655SelectionInput {
  mainNumbers: string[];
}

export interface Power655BoardInput {
  boardNo: string;
  playType: Power655PlayType;
  selection: Power655SelectionInput;
  /**
   * Số lần cược nhân bội cho board này (≥ minBetCount, ≤ maxBetCount).
   *
   * Tiền cược board = expandedLines × betCount × unitPrice.
   * Tiền thưởng cũng nhân theo betCount. Mặc định = 1.
   */
  betCount?: number;
}

/**
 * Input mua vé Power 6/55.
 *
 * Gửi lên `POST /games/power655/bets` qua `client.power655.placeBet()`.
 *
 * @example
 * ```ts
 * import type { Power655TicketPurchaseInput } from "@megawin/player-sdk/power655";
 *
 * const input: Power655TicketPurchaseInput = {
 *   drawIds: ["2026-03-07.001", "2026-03-09.001"],
 *   boards: [
 *     {
 *       boardNo: "A",
 *       playType: "standard",
 *       selection: { mainNumbers: ["01", "12", "23", "34", "45", "55"] },
 *     },
 *   ],
 * };
 * ```
 */
export interface Power655TicketPurchaseInput {
  /**
   * Danh sách drawId các kỳ quay tham gia.
   *
   * - Format mỗi ID: `YYYY-MM-DD.NNN` (VD: `"2026-03-07.001"`)
   * - Tối thiểu 1, tối đa 6 kỳ
   * - Không được trùng lặp
   */
  drawIds: string[];
  /** Danh sách boards trong vé. Tối đa 5 boards, không được trùng boardNo. */
  boards: Power655BoardInput[];
}

// ─────────────────────────────────────────────
// Response Types — Game Config
// ─────────────────────────────────────────────

export interface Power655GameRules {
  unitPrice: number;
  maxBoardsPerTicket: number;
  maxDrawCount: number;
  drawsPerDay: number;
  drawTimes: string[];
  /** Ngày quay trong tuần (0=CN, 2=T3, 4=T5, 6=T7). */
  drawDaysOfWeek: number[];
  /** Số lần cược tối thiểu cho 1 board. */
  minBetCount: number;
  /** Số lần cược tối đa cho 1 board. */
  maxBetCount: number;
}

export interface Power655PrizeAmounts {
  /** Giải Nhất: 5/6 số không trúng bonus (VND). */
  tier1: number;
  /** Giải Nhì: 4/6 số (VND). */
  tier2: number;
  /** Giải Ba: 3/6 số (VND). */
  tier3: number;
}

export interface Power655JackpotConfigInfo {
  /** Jackpot 1 (trùng 6/6): số tiền khởi điểm (VND). */
  jackpot1SeedAmount: number;
  /** Jackpot 2 (trùng 5/6 + bonus): số tiền khởi điểm (VND). */
  jackpot2SeedAmount: number;
  /** Ngưỡng kích hoạt chia giải (JP1 + JP2 >= threshold) (VND). */
  splitThreshold: number;
}

export interface Power655TenantConfig {
  isEnabled: boolean;
}

/**
 * Response từ `GET /games/power655/config`.
 */
export interface Power655GameConfigResponse {
  game: Power655GameRules;
  prizes: Power655PrizeAmounts;
  jackpot: Power655JackpotConfigInfo;
  tenant: Power655TenantConfig;
}

// ─────────────────────────────────────────────
// Response Types — Draw / Ticket / Entry
// ─────────────────────────────────────────────

export interface Power655DrawInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  status: string;
  sales: {
    openAt?: string;
    closeAt: string;
  };
  jackpot1CurrentAmount: number;
  jackpot2CurrentAmount: number;
}

/**
 * Tóm tắt vé Power 6/55 cho UI.
 *
 * Power 6/55 có cấu trúc progress khác (settledDrawCount + voidDrawCount thay vì settledDraws).
 *
 * @example
 * ```ts
 * const { tickets } = await client.power655.listPendingTickets();
 * for (const ticket of tickets) {
 *   const { settledDrawCount, voidDrawCount } = ticket.progress;
 *   const total = ticket.drawPlan.drawCount;
 *   console.log(`${ticket.ticketNo}: ${settledDrawCount}/${total} settle, ${voidDrawCount} void`);
 *   if (ticket.voidSummary) {
 *     console.log(`Đã hoàn: ${ticket.voidSummary.totalRefundAmount} VND`);
 *   }
 * }
 * ```
 */
export interface Power655TicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. VD: `"P655-20260307-00002"`. */
  ticketNo: string;
  /** Trạng thái vé. */
  status: string;
  /** Kế hoạch kỳ quay. */
  drawPlan: {
    drawIds: string[];
    drawCount: number;
  };
  /** Thông tin giá cược. */
  pricing: {
    unitPrice: number;
    /** Tổng số lines mỗi kỳ = Σ(board.expandedLines). */
    linesPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(board.expandedLines × board.betCount). */
    betUnitsPerDraw: number;
    /** Tiền cược mỗi kỳ (VND) = unitPrice × betUnitsPerDraw. */
    stakePerDraw: number;
    /** Tổng tiền cược toàn vé (VND) = stakePerDraw × drawCount. */
    totalStake: number;
  };
  /** Danh sách boards trong vé. */
  boards: Array<{
    boardNo: string;
    playType: Power655PlayType;
    selection: {
      /** Danh sách số chính đã chọn (6-18 số, zero-padded "01"-"55"). */
      mainNumbers: string[];
    };
    /** Số dòng cược sinh ra từ board này. Standard=1, BaoN=C(N,6). */
    lineCount: number;
    /**
     * Số lần cược nhân bội (≥ 1).
     *
     * Tiền cược board = lineCount × betCount × unitPrice.
     */
    betCount: number;
  }>;
  /**
   * Tiến độ settle.
   * settledDrawCount = số kỳ đã settle thành công.
   * voidDrawCount = số kỳ đã bị huỷ.
   */
  progress: {
    settledDrawCount: number;
    voidDrawCount: number;
  };
  /** Tổng kết trả thưởng. `undefined` nếu chưa có kỳ nào settle. */
  settlement?: {
    totalWinAmount: number;
    lastSettledAt?: string;
  };
  /**
   * Tóm tắt huỷ cược. `undefined` nếu không có kỳ nào bị void.
   */
  voidSummary?: {
    /** Tổng tiền đã hoàn trả cho player (VND). */
    totalRefundAmount: number;
    /** Số kỳ đã bị huỷ. */
    voidDrawCount: number;
  };
  /** Thời điểm mua vé (ISO 8601). */
  createdAt: string;
}

export interface Power655EntryResult {
  drawId: string;
  drawDate: string;
  status: string;
  /** Tiền cược kỳ này (VND) = betUnitCount × unitPrice. */
  amount: number;
  /** Đơn giá 1 line (VND). */
  unitPrice: number;
  /** Tổng số lines trong entry = Σ(board.expandedLines). */
  lineCount: number;
  /** Tổng đơn vị cược = Σ(board.expandedLines × board.betCount). */
  betUnitCount: number;
  result?: { winningMain: string[]; bonusNumber: string; publishedAt: string };
  payout?: {
    winAmount: number;
    tiers: Array<{
      tier: Power655PrizeTier;
      label: string;
      hitCount: number;
      amount: number;
      splitBonus?: number;
    }>;
  };
}

// ─────────────────────────────────────────────
// Response Types — Entry Lines
// ─────────────────────────────────────────────

/**
 * Thông tin chi tiết 1 line trong entry Power 6/55.
 *
 * Mỗi line là 6 số chính được expand từ board (Standard = 1 line, BaoN = C(N,6) lines).
 * `matchResult` chỉ có sau khi kỳ quay đã settle.
 */
export interface Power655LineInfo {
  /** Ký hiệu board chứa line này. VD: `"A"`, `"B"`. */
  boardNo: string;
  /** Vị trí line trong entry (0-based). Dùng làm cursor khi phân trang. */
  lineIndex: number;
  /**
   * 6 số chính đã chọn (zero-padded `"01"`-`"55"`).
   * VD: `["03", "11", "25", "38", "49", "55"]`.
   */
  main: string[];
  /** Kết quả đối chiếu số. `undefined` nếu kỳ quay chưa kết thúc. */
  matchResult?: {
    /** Số lượng số chính trùng với kết quả quay (0-6). */
    mainMatchCount: number;
    /** Có trùng số bonus không. */
    bonusMatched: boolean;
    /** Hạng giải trúng. `null` nếu không trúng giải nào. */
    tier: Power655PrizeTier | null;
    /** Tiền thưởng của line này (VND). `0` nếu không trúng. */
    winAmount: number;
  };
}

// ─────────────────────────────────────────────
// Response Types — Draw Results
// ─────────────────────────────────────────────

/**
 * Thông tin giải thưởng 1 hạng trong kỳ quay Power 6/55.
 */
export interface Power655DrawTierPrize {
  /**
   * Hạng giải.
   * - `"jackpot1"` — 6/6 số chính (Jackpot 1)
   * - `"jackpot2"` — 5/6 + bonus (Jackpot 2)
   * - `"tier1"` — 5/6 không bonus
   * - `"tier2"` — 4/6
   * - `"tier3"` — 3/6
   */
  tier: Power655PrizeTier;
  /** Tổng số người trúng hạng này. */
  winnerCount: number;
  /** Tổng tiền thưởng đã trao cho hạng này (VND). */
  prizeAmount: number;
}

/**
 * Tóm tắt kết quả 1 kỳ quay Power 6/55 (dùng trong danh sách).
 *
 * Trả về bởi `client.power655.listDrawResults()`.
 *
 * @example
 * ```ts
 * const { draws } = await client.power655.listDrawResults({ size: 10 });
 * for (const draw of draws) {
 *   const main = draw.result.winningMain.join(", ");
 *   const bonus = draw.result.bonusNumber;
 *   console.log(`[${draw.drawId}] ${main} | Bonus: ${bonus}`);
 *   console.log(`  JP1: ${draw.jackpot.closingJackpot1.toLocaleString()} VND`);
 * }
 * ```
 */
export interface Power655DrawResultSummary {
  /** ID kỳ quay. Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.001"`. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày (1-based). */
  drawNo: number;
  /** Giờ quay. VD: `"18:00"`. */
  drawTime: string;
  /** Kết quả quay số. */
  result: {
    /**
     * 6 số chính kết quả (zero-padded `"01"`-`"55"`).
     * VD: `["03", "11", "25", "38", "49", "55"]`.
     */
    winningMain: string[];
    /** Số bonus (zero-padded `"01"`-`"55"`). VD: `"07"`. */
    bonusNumber: string;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Snapshot giá trị Jackpot của kỳ quay này. */
  jackpot: {
    /** Jackpot 1 mở đầu kỳ (VND). */
    openingJackpot1: number;
    /** Jackpot 1 kết thúc kỳ — 0 nếu có người trúng (cycle mới bắt đầu) (VND). */
    closingJackpot1: number;
    /** Jackpot 2 mở đầu kỳ (VND). */
    openingJackpot2: number;
    /** Jackpot 2 kết thúc kỳ — 0 nếu có người trúng (cycle mới bắt đầu) (VND). */
    closingJackpot2: number;
  };
  /** Tham chiếu kỳ quay Vietlott tương ứng. `undefined` nếu không liên kết. */
  vietlottRef?: {
    drawPeriod: number;
    drawDate: string;
  };
}

/**
 * Chi tiết đầy đủ kết quả 1 kỳ quay Power 6/55 bao gồm bảng giải.
 *
 * Trả về bởi `client.power655.getDrawResult(drawId)`.
 *
 * @example
 * ```ts
 * const draw = await client.power655.getDrawResult("2026-03-07.001");
 * const main = draw.result.winningMain.join(", ");
 * console.log(`Kết quả: ${main} | Bonus: ${draw.result.bonusNumber}`);
 * for (const prize of draw.prizes) {
 *   console.log(`  ${prize.tier}: ${prize.winnerCount} người, ${prize.prizeAmount.toLocaleString()} VND`);
 * }
 * ```
 */
export interface Power655DrawResultInfo {
  /** ID kỳ quay. Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.001"`. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày (1-based). */
  drawNo: number;
  /** Giờ quay. VD: `"18:00"`. */
  drawTime: string;
  /** Kết quả quay số. */
  result: {
    /**
     * 6 số chính kết quả (zero-padded `"01"`-`"55"`).
     * VD: `["03", "11", "25", "38", "49", "55"]`.
     */
    winningMain: string[];
    /** Số bonus (zero-padded `"01"`-`"55"`). VD: `"07"`. */
    bonusNumber: string;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Snapshot giá trị Jackpot của kỳ quay này. */
  jackpot: {
    /** Jackpot 1 mở đầu kỳ (VND). */
    openingJackpot1: number;
    /** Jackpot 1 kết thúc kỳ (VND). */
    closingJackpot1: number;
    /** Jackpot 2 mở đầu kỳ (VND). */
    openingJackpot2: number;
    /** Jackpot 2 kết thúc kỳ (VND). */
    closingJackpot2: number;
  };
  /**
   * Bảng trao giải theo hạng.
   * Gồm 5 hạng: `jackpot1`, `jackpot2`, `tier1`, `tier2`, `tier3`.
   */
  prizes: Power655DrawTierPrize[];
  /** Tham chiếu kỳ quay Vietlott. `undefined` nếu không liên kết. */
  vietlottRef?: {
    drawPeriod: number;
    drawDate: string;
  };
}

// ─────────────────────────────────────────────
// Response Types — Place Bet
// ─────────────────────────────────────────────

/**
 * Response khi đặt cược Power 6/55 thành công.
 *
 * Trả về từ `POST /games/power655/bets` qua `client.power655.placeBet()`.
 */
export interface Power655PlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. VD: `"P655-20260307-00002"`. */
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
 * Tham số phân trang cho danh sách vé Power 6/55 đang chờ xử lý.
 *
 * Cursor-based pagination. Không hỗ trợ lọc ngày — chỉ trả vé đang active.
 *
 * @example
 * ```ts
 * const page1 = await client.power655.listPendingTickets({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.power655.listPendingTickets({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Power655ListPendingTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
}

/**
 * Tham số lọc và phân trang cho lịch sử vé Power 6/55 (tất cả trạng thái).
 *
 * Hỗ trợ lọc theo khoảng ngày đặt cược (giờ Việt Nam).
 *
 * @example
 * ```ts
 * const march = await client.power655.listTickets({
 *   from: "2026-03-01",
 *   to: "2026-03-31",
 * });
 *
 * if (march.nextCursor) {
 *   const page2 = await client.power655.listTickets({
 *     size: 20,
 *     cursor: march.nextCursor,
 *   });
 * }
 * ```
 */
export interface Power655ListAllTicketsParams {
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
 * Tham số phân trang cho danh sách kết quả kỳ quay Power 6/55.
 *
 * @example
 * ```ts
 * // Lấy kết quả từ ngày hôm nay, tối đa 10 kỳ
 * const page1 = await client.power655.listDrawResults({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.power655.listDrawResults({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Power655ListDrawResultsParams {
  /** Số lượng kỳ mỗi trang (mặc định 20). */
  size?: number;
  /**
   * Lọc kết quả từ ngày này trở về quá khứ (YYYY-MM-DD).
   * Mặc định: ngày hôm nay (giờ Việt Nam).
   */
  from?: string;
  /**
   * Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước).
   * Là drawId của kỳ cuối cùng trong trang trước. Format `YYYY-MM-DD.NNN`.
   */
  cursor?: string;
}

/**
 * Tham số phân trang cho lines của một entry Power 6/55.
 */
export interface Power655EntryLinesParams {
  /** Số lượng lines mỗi trang (mặc định 50). */
  size?: number;
  /**
   * Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước).
   * Là `lineIndex` (integer) của line cuối trang trước.
   */
  cursor?: number;
}

/**
 * Thông tin Jackpot Power 6/55 hiện tại.
 *
 * Power 6/55 có 2 mức Jackpot: JP1 (trùng 6/6 số chính) và JP2 (trùng 5/6 + bonus).
 *
 * Trả về bởi `client.power655.getJackpot()`.
 */
export interface Power655JackpotResponse {
  /** Số thứ tự cycle (tăng dần khi cycle mới). Hiển thị "Chu kỳ #N". */
  cycleNo: number;
  /** Giá trị Jackpot 1 hiện tại (VND) — giải trùng 6/6 số chính. */
  jackpot1CurrentAmount: number;
  /** Giá trị Jackpot 2 hiện tại (VND) — giải trùng 5/6 + bonus. */
  jackpot2CurrentAmount: number;
  /** Giá trị khởi tạo Jackpot 1 khi bắt đầu cycle mới (VND). */
  jackpot1SeedAmount: number;
  /** Giá trị khởi tạo Jackpot 2 khi bắt đầu cycle mới (VND). */
  jackpot2SeedAmount: number;
  /**
   * Ngưỡng tràn Jackpot 1 (VND).
   * Khi Jackpot 1 vượt ngưỡng và có JP2 winner, phần vượt chuyển sang Jackpot 2.
   */
  jackpot1OverflowThreshold: number;
  /** Số kỳ quay đã settle trong cycle này. */
  drawCount: number;
  /** Số lần JP2 đã trúng và reset trong cycle hiện tại. 0 = JP2 chưa ai trúng từ đầu cycle. */
  jackpot2ResetCount: number;
  /** Thời điểm bắt đầu cycle (ISO 8601). */
  startedAt: string;
  /** ID kỳ quay đầu tiên của cycle. */
  startDrawId: string;
}

/**
 * Thông tin kỳ quay Power 6/55 hiện tại.
 *
 * Trả về bởi `client.power655.getCurrentDraw()`.
 */
export interface Power655CurrentDrawResponse {
  /** Kỳ quay đang mở bán, hoặc `null` nếu chưa có. */
  currentDraw: Power655DrawInfo | null;
  /** Tất cả kỳ quay đang active. */
  activeDraws: Power655DrawInfo[];
}

/**
 * Danh sách vé Power 6/55 (cursor-based).
 *
 * Trả về bởi `client.power655.listPendingTickets()` và `client.power655.listTickets()`.
 */
export interface Power655ListTicketsResponse {
  /** Danh sách vé trong trang hiện tại. */
  tickets: Power655TicketSummary[];
  /** Cursor để lấy trang tiếp theo, `null` nếu đã hết. */
  nextCursor: string | null;
  /** Số vé thực tế trả về. */
  size: number;
}

/**
 * Chi tiết vé và các lần tham gia kỳ quay của vé Power 6/55.
 *
 * Trả về bởi `client.power655.getTicketEntries()`.
 */
export interface Power655TicketEntriesResponse {
  /** Thông tin tóm tắt vé. */
  ticket: Power655TicketSummary;
  /** Danh sách entries (1 entry = 1 kỳ quay). */
  entries: Power655EntryResult[];
}

/**
 * Danh sách lines chi tiết của một entry Power 6/55 (cursor-based).
 *
 * Trả về bởi `client.power655.getEntryLines()`.
 *
 * Mỗi board Standard cho 1 line; BaoN cho C(N,6) lines.
 * Pagination dùng integer line index làm cursor.
 *
 * @example
 * ```ts
 * // Lấy trang đầu (50 lines)
 * const page1 = await client.power655.getEntryLines("entry-abc...", { size: 50 });
 * for (const line of page1.lines) {
 *   console.log(line.main.join(", ")); // "03, 11, 25, 38, 49, 55"
 *   if (line.matchResult) {
 *     console.log(`  Trúng ${line.matchResult.mainMatchCount} số, giải: ${line.matchResult.tier ?? "không"}`);
 *   }
 * }
 *
 * // Phân trang
 * if (page1.nextCursor !== null) {
 *   const page2 = await client.power655.getEntryLines("entry-abc...", {
 *     size: 50,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Power655EntryLinesResponse {
  /** ID entry. */
  entryId: string;
  /**
   * ID kỳ quay mà entry này tham gia.
   * Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.001"`.
   */
  drawId: string;
  /** Danh sách lines trong trang hiện tại. */
  lines: Power655LineInfo[];
  /**
   * Cursor để lấy trang tiếp theo, `null` nếu đã hết.
   * Là `lineIndex` của line cuối trong trang này (integer).
   */
  nextCursor: number | null;
  /** Số lines thực tế trả về trong trang này. */
  size: number;
}

/**
 * Danh sách kết quả kỳ quay Power 6/55 (cursor-based).
 *
 * Trả về bởi `client.power655.listDrawResults()`.
 */
export interface Power655ListDrawResultsResponse {
  /** Danh sách kết quả kỳ quay trong trang hiện tại. */
  draws: Power655DrawResultSummary[];
  /**
   * Cursor để lấy trang tiếp theo, `null` nếu đã hết.
   * Là `drawId` của kỳ cuối cùng trong trang này. Format `YYYY-MM-DD.NNN`.
   */
  nextCursor: string | null;
  /** Số kỳ quay thực tế trả về. */
  size: number;
}

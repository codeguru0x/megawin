/**
 * Power 6/55 SDK – Public Types
 * @module
 */

import type { Power655PlayType, Power655PrizeTier } from "./enums";

// ─────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────

/**
 * Lựa chọn số cho một board Power 6/55.
 *
 * Power 6/55 chỉ có `mainNumbers` (không có số đặc biệt — bonus do hệ thống quay riêng).
 */
export interface Power655SelectionInput {
  /** Danh sách số chính chọn. Dạng string zero-padded `"01"`–`"55"`. */
  mainNumbers: string[];
}

/**
 * Một board trong vé Power 6/55.
 */
export interface Power655BoardInput {
  /**
   * Ký hiệu board — nhãn dạng cột spreadsheet: `"A"`, `"B"`, …, `"Z"`, `"AA"`, `"AB"`, …
   *
   * Các board phải liên tục từ `"A"` (không skip, không trùng): 1 board → `["A"]`,
   * 3 board → `["A","B","C"]`. Số board tối đa mỗi vé do cấu hình game quyết định
   * (`maxBoardsPerTicket`), không cố định 5.
   */
  boardNo: string;
  /** Kiểu chơi của board này. */
  playType: Power655PlayType;
  /** Số đã chọn. */
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
  /**
   * Danh sách boards trong vé. Tối thiểu 1, tối đa theo cấu hình game
   * (`maxBoardsPerTicket`). `boardNo` phải liên tục từ `"A"`, không trùng.
   */
  boards: Power655BoardInput[];
}

// ─────────────────────────────────────────────
// Response Types — Game Config
// ─────────────────────────────────────────────

/**
 * Luật chơi game Power 6/55.
 */
export interface Power655GameRules {
  /** Giá 1 lượt chơi (VND). */
  unitPrice: number;
  /** Số board tối đa mỗi vé. */
  maxBoardsPerTicket: number;
  /** Số kỳ tối đa đặt liên tiếp. */
  maxDrawCount: number;
  /** Số kỳ quay mỗi ngày. */
  drawsPerDay: number;
  /** Các giờ quay trong ngày. VD: `["18:00"]`. */
  drawTimes: string[];
  /** Ngày quay trong tuần (0 = Chủ nhật, 2 = Thứ 3, 4 = Thứ 5, 6 = Thứ 7). */
  drawDaysOfWeek: number[];
  /** Số lần cược tối thiểu cho 1 board. */
  minBetCount: number;
  /** Số lần cược tối đa cho 1 board. */
  maxBetCount: number;
}

/**
 * Giá trị giải thưởng cố định Power 6/55 (không bao gồm Jackpot 1 và Jackpot 2).
 */
export interface Power655PrizeAmounts {
  /** Giải Nhất — 5/6 số chính không trùng bonus (VND). */
  tier1: number;
  /** Giải Nhì — 4/6 số (VND). */
  tier2: number;
  /** Giải Ba — 3/6 số (VND). */
  tier3: number;
}

/**
 * Cấu hình Jackpot dual (JP1 + JP2) Power 6/55.
 */
export interface Power655JackpotConfigInfo {
  /** Số tiền khởi điểm Jackpot 1 khi bắt đầu cycle mới (VND). */
  jackpot1SeedAmount: number;
  /** Số tiền khởi điểm Jackpot 2 khi bắt đầu cycle mới (VND). */
  jackpot2SeedAmount: number;
  /**
   * Ngưỡng tràn Jackpot 1 (VND).
   * Khi Jackpot 1 vượt ngưỡng và có JP2 winner, phần vượt chuyển sang Jackpot 2.
   */
  splitThreshold: number;
}

/**
 * Trạng thái cấu hình tenant cho Power 6/55.
 */
export interface Power655TenantConfig {
  /** `true` nếu game Power 6/55 đang được bật cho tenant này. */
  isEnabled: boolean;
}

/**
 * Cấu hình đầy đủ game Power 6/55 — luật chơi, giải thưởng, jackpot, trạng thái tenant.
 *
 * Trả về bởi `GET /games/power655/config`.
 *
 * @example
 * ```ts
 * const config = await client.power655.getGameConfig();
 * console.log(config.game.unitPrice);              // 10000
 * console.log(config.jackpot.jackpot1SeedAmount);  // 40000000000
 * console.log(config.tenant.isEnabled);            // true
 * ```
 */
export interface Power655GameConfigResponse {
  /** Luật chơi và lịch quay. */
  game: Power655GameRules;
  /** Giá trị các giải thưởng cố định. */
  prizes: Power655PrizeAmounts;
  /** Cấu hình jackpot dual (seed, overflow threshold). */
  jackpot: Power655JackpotConfigInfo;
  /** Cấu hình tenant cho game này. */
  tenant: Power655TenantConfig;
}

// ─────────────────────────────────────────────
// Response Types — Draw / Ticket / Entry
// ─────────────────────────────────────────────

/**
 * Thông tin kỳ quay Power 6/55 hiện tại hoặc sắp tới.
 *
 * Trả về bởi `client.power655.getCurrentDraw()`.
 *
 * @example
 * ```ts
 * const draw = await client.power655.getCurrentDraw();
 * console.log(draw.currentDraw?.drawId);              // "2026-03-07.001"
 * console.log(draw.currentDraw?.jackpot1CurrentAmount); // 45000000000
 * ```
 */
export interface Power655DrawInfo {
  /** Mã kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Giờ quay. VD: `"18:00"`. */
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
  /** Giá trị Jackpot 1 hiện tại (VND) — giải trùng 6/6 số chính. */
  jackpot1CurrentAmount: number;
  /** Giá trị Jackpot 2 hiện tại (VND) — giải trùng 5/6 + bonus. */
  jackpot2CurrentAmount: number;
}

/**
 * Tóm tắt vé Power 6/55 cho UI danh sách vé.
 *
 * Trả về bởi `client.power655.listPendingTickets()` và `client.power655.listTickets()`.
 *
 * @example
 * ```ts
 * const { tickets } = await client.power655.listPendingTickets();
 * for (const ticket of tickets) {
 *   const { settledDraws, totalDraws } = ticket.progress;
 *   console.log(`${ticket.ticketNo}: ${settledDraws}/${totalDraws} kỳ`);
 *   if (ticket.voidSummary) {
 *     console.log(`Đã hoàn: ${ticket.voidSummary.totalRefundedAmount} VND (${ticket.voidSummary.voidedDrawCount} kỳ)`);
 *   }
 * }
 * ```
 */
export interface Power655TicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. VD: `"P655-20260307-00002"`. */
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
    playType: Power655PlayType;
    /** Số đã chọn. */
    selection: {
      /** Danh sách số chính đã chọn (zero-padded `"01"`–`"55"`). */
      mainNumbers: string[];
    };
    /** Số lines được expand từ kiểu chơi này. Standard = 1, BaoN = C(N,6). */
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
    /** Tổng tiền đã hoàn trả cho player (VND). */
    totalRefundedAmount: number;
    /** Tổng tiền stake bị void (VND). */
    totalVoidedAmount: number;
    /** Số kỳ đã bị huỷ. */
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
 * Kết quả một kỳ quay của vé Power 6/55 (entry).
 *
 * Trả về bởi `client.power655.getTicketEntries()`.
 * Power 6/55 có `bonusNumber` trong kết quả, khác với Mega 6/45.
 */
export interface Power655EntryResult {
  /** ID entry trong hệ thống. */
  id: string;
  /** Mã kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
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
    /**
     * 6 số chính trúng thưởng (sorted, zero-padded `"01"`–`"55"`).
     * VD: `["03", "11", "25", "38", "49", "55"]`.
     */
    winningMain: string[];
    /** Số bonus (zero-padded `"01"`–`"55"`). VD: `"07"`. */
    bonusNumber: string;
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /** Kết quả tổng của entry sau settle. `"win"` hoặc `"loss"`. `undefined` nếu chưa settle. */
  outcome?: string;
  /** Thông tin trả thưởng. `undefined` nếu chưa settle hoặc không trúng. */
  payout?: {
    /** Tổng tiền thắng trước khi trả thưởng (VND). */
    winAmount: number;
    /** Số tiền trả thưởng thực tế sau áp dụng payout cap (VND). */
    payoutAmount: number;
    /** Chi tiết từng giải thưởng trúng. */
    tiers: Array<{
      /** Hạng giải. */
      tier: Power655PrizeTier;
      /** Tên giải hiển thị. VD: `"Jackpot 1"`, `"Giải nhất"`. */
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
// Response Types — Entry Lines
// ─────────────────────────────────────────────

/**
 * Chi tiết một dòng cược (line) Power 6/55 đã được expand.
 *
 * Mỗi line là 6 số chính từ 1 board (Standard = 1 line, BaoN = C(N,6) lines).
 * Power 6/55: lines chỉ có `main` (số chính), không có số đặc biệt.
 * `matchResult.bonusMatched` xác định điều kiện Jackpot 2 (5/6 + bonus).
 *
 * Dùng trong {@link Power655EntryLinesResponse}.
 */
export interface Power655LineInfo {
  /** Ký hiệu board chứa line này. VD: `"A"`, `"B"`. */
  boardNo: string;
  /** Vị trí line trong entry (0-based). Dùng làm cursor khi phân trang. */
  lineIndex: number;
  /**
   * 6 số chính đã chọn (zero-padded `"01"`–`"55"`, sorted ascending).
   * VD: `["03", "11", "25", "38", "49", "55"]`.
   */
  main: string[];
  /**
   * Số lần nhân cược cho dòng này (≥ 1).
   *
   * Tiền thưởng dòng = unitPrize × betCount. UI hiển thị `"×N"` khi betCount > 1.
   */
  betCount: number;
  /**
   * Kết quả so khớp với kết quả quay.
   * Chỉ có khi entry đã ở trạng thái `"settled"`.
   */
  matchResult: {
    /** Số lượng số chính trùng với kết quả quay (0–6). */
    mainMatchCount: number;
    /** `true` nếu số bonus cũng trùng — điều kiện để trúng Jackpot 2 (5/6 + bonus). */
    bonusMatched: boolean;
    /**
     * Hạng giải trúng. `null` nếu không trúng giải nào.
     *
     * | tier         | Điều kiện              |
     * |--------------|------------------------|
     * | `"jackpot1"` | 6/6 số chính           |
     * | `"jackpot2"` | 5/6 + bonus            |
     * | `"tier1"`    | 5/6 (không có bonus)   |
     * | `"tier2"`    | 4/6                    |
     * | `"tier3"`    | 3/6                    |
     */
    tier: Power655PrizeTier | null;
    /**
     * Tiền thưởng dòng này (VND).
     * Jackpot = 0 tại đây — giá trị chính xác tính sau khi biết số winners.
     */
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
    drawPeriod: string;
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
    drawPeriod: string;
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
  /** Số dư ví player sau khi trừ tiền cược (VND). */
  balance: number;

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

// ─── Combo Popularity — minh bạch chia jackpot ───

/**
 * Tham số tra độ đông 1 bộ số Power 6/55 mà bạn đã cược trong kỳ.
 *
 * @example
 * ```ts
 * const params: Power655ComboPopularityParams = {
 *   drawId: "2026-03-08.001",
 *   numbers: ["01", "05", "12", "23", "34", "45"], // standard (6 số)
 * };
 * ```
 */
export interface Power655ComboPopularityParams {
  /** ID kỳ quay. Format: `YYYY-MM-DD.NNN`. VD: `"2026-03-08.001"`. */
  drawId: string;
  /**
   * Bộ số cần kiểm tra — distinct, dạng zero-padded string `"01".."55"`. Số lượng số
   * quyết định loại chơi: 5 → bao5, 6 → standard, 7–15 → baoN, 18 → bao18 (16/17 không hợp lệ).
   *
   * @example `["01", "05", "12", "23", "34", "45"]` // standard (6 số)
   */
  numbers: string[];
}

/**
 * Kết quả minh bạch combo — số bộ đang cùng cược bộ số này.
 *
 * **Ownership-gate:** `found` chỉ `true` khi chính bạn ĐÃ cược đúng bộ số này trong kỳ.
 * Nếu bạn chưa cược (hoặc bộ chưa ai chơi), API trả `{ found: false }` — hai trường hợp cố
 * ý KHÔNG phân biệt để bảo vệ dữ liệu cược của người khác. Đây KHÔNG phải lỗi.
 *
 * **`sets` vs `jackpotUnits`:**
 * - `sets` = số bộ cược cùng bộ số — TÍN HIỆU tham khảo. Power 6/55 chia jackpot theo betCount
 *   trên toàn bộ line trúng CỦA KỲ (không phải per-combo), nên `sets` KHÔNG phải mẫu số chia
 *   trực tiếp (nhất là board Bao).
 * - `jackpotUnits` (CHỈ có khi tra bộ **6 số standard**) = mẫu số chia **Jackpot 1** (6/6) khi
 *   bộ này trúng. KHÔNG áp dụng cho Jackpot 2 (5/6 + bonus) — bonus number chỉ biết sau giờ
 *   quay, không suy trước được.
 *
 * **Công thức tính tiền jackpot TẠM TÍNH (dành cho tenant developer dựng UI):**
 *
 * ```
 * soTienTamTinh = Math.floor(jackpot1CurrentAmount / jackpotUnits) * betCount
 * ```
 *
 * `jackpot1CurrentAmount` lấy từ {@link Power655Api.getJackpot}, `betCount` là số lần cược
 * của board đó (KHÔNG lấy từ response này — lấy từ thông tin board bạn đã đặt). Đây là **con
 * số TẠM TÍNH tại thời điểm tra** — pool còn tăng đến giờ đóng bán, `jackpotUnits` cũng chỉ
 * tăng (bán vé tiếp tục) không giảm (trừ khi có vé bị void) — KHÔNG hiển thị con số này như
 * một cam kết/thông báo chính thức, chỉ nên gắn nhãn "ước tính nếu trúng ngay bây giờ".
 *
 * @example
 * ```ts
 * const res = await client.power655.getComboPopularity({
 *   drawId: "2026-03-08.001",
 *   numbers: ["01", "05", "12", "23", "34", "45"],
 * });
 *
 * if (res.found) {
 *   console.log(`${res.sets} bộ đang cược cùng bộ số này`);
 *
 *   if (res.jackpotUnits) {
 *     const { jackpot1CurrentAmount } = await client.power655.getJackpot();
 *     const betCount = 2; // số lần cược của board này (từ dữ liệu vé bạn đã đặt)
 *     const soTienTamTinh = Math.floor(jackpot1CurrentAmount / res.jackpotUnits) * betCount;
 *     console.log(`Nếu trúng Jackpot 1 ngay bây giờ, tạm tính bạn nhận: ${soTienTamTinh} VND`);
 *   }
 * } else {
 *   console.log("Bạn chưa cược bộ này (hoặc chưa ai chơi).");
 * }
 * ```
 */
export interface Power655ComboPopularityResponse {
  /** `true` khi bạn đã cược đúng bộ số này VÀ combo có dữ liệu; ngược lại `false`. */
  found: boolean;
  /** Tổng số bộ mọi người cược bộ số này (Σ betCount). Chỉ có khi `found=true`. */
  sets?: number;
  /**
   * Mẫu số chia Jackpot 1 (6/6) nếu bộ 6 số này trúng — CHỈ có khi tra bộ **6 số standard**.
   * Xem công thức tính tiền TẠM TÍNH ở JSDoc interface. KHÔNG áp dụng cho Jackpot 2.
   */
  jackpotUnits?: number;
}

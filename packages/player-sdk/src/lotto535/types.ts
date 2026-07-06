/**
 * Lotto 5/35 SDK – Public Types
 *
 * Types cho game Lotto 5/35 — dùng trong player client.
 * Số chính: string zero-padded `"01"` đến `"35"`.
 * Số đặc biệt: string zero-padded `"01"` đến `"12"`.
 *
 * @module
 */

import type { Lotto535PlayType, Lotto535PrizeTier, Lotto535TicketDisplayStatus } from "./enums";

// ─────────────────────────────────────────────
// Input Types (mua vé)
// ─────────────────────────────────────────────

/**
 * Input lựa chọn số cho 1 board.
 *
 * @example
 * ```ts
 * // Standard: 5 chính + 1 đặc biệt
 * const selection: Lotto535SelectionInput = {
 *   mainNumbers: ["01", "08", "15", "22", "35"],
 *   specialNumbers: ["07"],
 * };
 *
 * // MainCover (bao): 8 chính + 1 đặc biệt
 * const selectionBao: Lotto535SelectionInput = {
 *   mainNumbers: ["01", "05", "10", "15", "20", "25", "30", "35"],
 *   specialNumbers: ["07"],
 * };
 * ```
 */
export interface Lotto535SelectionInput {
  /**
   * Danh sách số chính đã chọn.
   *
   * String zero-padded: `"01"` đến `"35"`.
   * Số lượng tùy kiểu chơi:
   * - Standard: 5 số (hoặc 4 với MainCover4)
   * - MainCover: 6-15 số
   * - SpecialCover: 5 số
   */
  mainNumbers: string[];

  /**
   * Danh sách số đặc biệt đã chọn.
   *
   * String zero-padded: `"01"` đến `"12"`.
   * Số lượng tùy kiểu chơi:
   * - Standard / MainCover / MainCover4: 1 số
   * - SpecialCover: 2-12 số
   */
  specialNumbers: string[];
}

/**
 * Input cho 1 board khi mua vé.
 *
 * @example
 * ```ts
 * const board: Lotto535BoardInput = {
 *   boardNo: "A",
 *   playType: "standard",
 *   selection: {
 *     mainNumbers: ["01", "08", "15", "22", "35"],
 *     specialNumbers: ["07"],
 *   },
 * };
 * ```
 */
export interface Lotto535BoardInput {
  /**
   * Ký hiệu board trong vé, sinh tự động theo thứ tự chữ cái: `"A"`, `"B"`, ..., `"Z"`,
   * rồi `"AA"`, `"AB"`, ... — giống đánh cột bảng tính. Board đầu tiên luôn là `"A"`.
   *
   * Các board phải liên tục từ `"A"` (không skip, không trùng): 1 board → `["A"]`,
   * 3 board → `["A","B","C"]`. Số board tối đa mỗi vé do cấu hình game quyết định
   * (`maxBoardsPerTicket`), không cố định 5.
   */
  boardNo: string;

  /**
   * Kiểu chơi.
   *
   * | Type           | Chọn                      | Số lines |
   * |----------------|---------------------------|----------|
   * | `"standard"`     | 5 chính + 1 đặc biệt     | 1        |
   * | `"mainCover4"`   | 4 chính + 1 đặc biệt     | 31       |
   * | `"mainCover"`    | 6-15 chính + 1 đặc biệt  | C(N,5)   |
   * | `"specialCover"` | 5 chính + 2-12 đặc biệt  | K        |
   */
  playType: Lotto535PlayType;

  /** Lựa chọn số. */
  selection: Lotto535SelectionInput;

  /**
   * Số lần cược nhân bội cho board này (≥ minBetCount, ≤ maxBetCount).
   *
   * Tiền cược board = expandedLines × betCount × unitPrice.
   * Tiền thưởng cũng nhân theo betCount. Mặc định = 1.
   */
  betCount?: number;
}

/**
 * Input mua vé Lotto 5/35.
 *
 * Gửi lên `POST /games/lotto535/bets` qua `client.lotto535.placeBet()`.
 *
 * @example
 * ```ts
 * import type { Lotto535TicketPurchaseInput } from "@megawin/player-sdk/lotto535";
 *
 * const input: Lotto535TicketPurchaseInput = {
 *   drawIds: ["2026-02-25.001", "2026-03-04.001", "2026-03-11.001"],
 *   boards: [
 *     {
 *       boardNo: "A",
 *       playType: "standard",
 *       selection: {
 *         mainNumbers: ["01", "08", "15", "22", "35"],
 *         specialNumbers: ["07"],
 *       },
 *     },
 *     {
 *       boardNo: "B",
 *       playType: "mainCover",
 *       selection: {
 *         mainNumbers: ["02", "05", "10", "15", "20", "25", "30"],
 *         specialNumbers: ["12"],
 *       },
 *     },
 *   ],
 * };
 * ```
 */
export interface Lotto535TicketPurchaseInput {
  /**
   * Danh sách drawId các kỳ quay tham gia.
   *
   * - Format mỗi ID: `YYYY-MM-DD.NNN` (VD: `"2026-02-25.001"`)
   * - Tối thiểu 1, tối đa 6 kỳ
   * - Không được trùng lặp
   */
  drawIds: string[];

  /**
   * Danh sách boards.
   *
   * Ít nhất 1 board, boardNo liên tục từ `"A"`. Số board tối đa do cấu hình game
   * quyết định (`maxBoardsPerTicket`).
   */
  boards: Lotto535BoardInput[];
}

// ─────────────────────────────────────────────
// Response Types (hiển thị)
// ─────────────────────────────────────────────

/**
 * Thông tin kỳ quay Lotto 5/35 hiện tại hoặc sắp tới.
 *
 * Trả về bởi `client.lotto535.getCurrentDraw()`.
 *
 * @example
 * ```ts
 * const draw = await client.lotto535.getCurrentDraw();
 * console.log(draw.currentDraw?.drawId);       // "2026-03-05.001"
 * console.log(draw.currentDraw?.sales.closeAt); // "2026-03-05T12:50:00Z"
 * ```
 */
export interface Lotto535DrawInfo {
  /** Mã kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1 = 13h, 2 = 21h). */
  drawNo: number;
  /** Giờ quay. VD: `"13:00"`, `"21:00"`. */
  drawTime: string;
  /** Trạng thái kỳ quay. VD: `"salesOpen"`, `"salesClosed"`. */
  status: string;
  /** Khung giờ bán vé. */
  sales: {
    /** Thời điểm mở bán (ISO 8601). `undefined` nếu đã mở sẵn. */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
}

/**
 * Tóm tắt vé Lotto 5/35 cho UI danh sách vé.
 *
 * Trả về bởi `client.lotto535.listPendingTickets()` và `client.lotto535.listTickets()`.
 *
 * @example
 * ```ts
 * const { tickets } = await client.lotto535.listPendingTickets();
 * for (const ticket of tickets) {
 *   const settled = ticket.progress.settledDraws;
 *   const total = ticket.progress.totalDraws;
 *   const voided = ticket.voidSummary?.voidedDrawCount ?? 0;
 *   console.log(`${ticket.ticketNo}: ${settled}/${total} kỳ (${voided} void)`);
 *   if (ticket.settlement) {
 *     console.log(`Thắng: ${ticket.settlement.totalWinAmount} VND`);
 *   }
 *   if (ticket.voidSummary) {
 *     console.log(`Đã hoàn: ${ticket.voidSummary.totalRefundedAmount} VND`);
 *   }
 * }
 * ```
 */
export interface Lotto535TicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị. VD: `"L535-20260307-00008"`. */
  ticketNo: string;
  /** Trạng thái vé. VD: `"pending"`, `"partial"`, `"settled"`, `"voided"`. */
  status: string;
  /** Kế hoạch kỳ quay. */
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
    /** Tổng lines mỗi kỳ = Σ(board.expandedLines). */
    linesPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(board.expandedLines × board.betCount). */
    betUnitsPerDraw: number;
    /** Tổng tiền mỗi kỳ (VND) = betUnitsPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền cả vé (VND). */
    totalAmount: number;
  };
  /** Danh sách boards trong vé. */
  boards: Lotto535BoardSummary[];
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
  /** Tổng kết trúng thưởng. `undefined` nếu chưa có kỳ nào settle. */
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
    /** Tổng tiền cược gốc của các kỳ bị huỷ (VND). */
    totalVoidedAmount: number;
    /** Tổng tiền đã hoàn trả cho player (VND). */
    totalRefundedAmount: number;
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
 * Tóm tắt board trong vé Lotto 5/35.
 */
export interface Lotto535BoardSummary {
  /** Ký hiệu board. VD: `"A"`, `"B"`. */
  boardNo: string;
  /** Kiểu chơi của board này. */
  playType: Lotto535PlayType;
  /** Danh sách số chính đã chọn (zero-padded `"01"`–`"35"`). */
  mainNumbers: string[];
  /** Danh sách số đặc biệt đã chọn (zero-padded `"01"`–`"12"`). */
  specialNumbers: string[];
  /** Số lines được expand từ kiểu chơi này. */
  expandedLines: number;
  /**
   * Số lần cược nhân bội cho board này (≥ 1).
   *
   * Tiền cược board = expandedLines × betCount × unitPrice.
   * UI hiển thị `"×N"` khi betCount > 1.
   */
  betCount: number;
}

/**
 * Kết quả entry (vé 1 kỳ) Lotto 5/35.
 *
 * Trả về bởi `client.lotto535.getTicketEntries()`.
 */
export interface Lotto535EntryResult {
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
     * 5 số chính trúng thưởng (sorted, zero-padded `"01"`–`"35"`).
     * VD: `["03", "11", "18", "25", "35"]`.
     */
    winningMain: string[];
    /** Số đặc biệt trúng thưởng (zero-padded `"01"`–`"12"`). VD: `"07"`. */
    winningSpecial: string;
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /** Kết quả tổng của entry sau settle. `"win"` hoặc `"loss"`. `undefined` nếu chưa settle. */
  outcome?: string;
  /** Thông tin trả thưởng. `undefined` nếu chưa settle hoặc không trúng. */
  payout?: {
    /** Tổng tiền thắng từ giải cố định (VND). */
    winAmount: number;
    /** Tổng tiền trả thưởng thực tế (VND) = winAmount + splitBonus nếu có kỳ chia Jackpot. */
    payoutAmount: number;
    /** Chi tiết từng giải thưởng trúng. */
    tiers: Array<{
      /** Hạng giải. */
      tier: Lotto535PrizeTier;
      /** Tên giải hiển thị. VD: `"Jackpot"`, `"Giải nhất"`. */
      label: string;
      /** Số lines trúng giải này. */
      hitCount: number;
      /** Tiền thưởng giải này (VND). */
      amount: number;
      /** Tiền bonus từ chia Jackpot (VND). `undefined` nếu không có. */
      splitBonus?: number;
    }>;
  };
}

/**
 * Thông tin hạng giải (cho trang hướng dẫn chơi).
 */
export interface Lotto535PrizeTierInfo {
  /** Mã tier. */
  tier: Lotto535PrizeTier;
  /** Tên tiếng Việt. */
  label: string;
  /** Mô tả điều kiện trúng. */
  description: string;
  /** Giá trị giải thưởng cố định (VND). `0` = Jackpot tích lũy. */
  amount: number;
  /** `true` nếu giải = Jackpot (tích lũy). */
  isJackpot?: boolean;
  /** `true` nếu tier tham gia chia Jackpot khi split cycle. */
  eligibleForSplit?: boolean;
}

/**
 * Thông tin split cycle cho người chơi.
 *
 * Trả kèm {@link Lotto535DrawInfo} khi kỳ quay là split cycle.
 */
export interface Lotto535SplitCycleInfo {
  /** Giá trị Jackpot đang chia (VND). */
  splitAmount: number;
  /**
   * Bonus dự kiến cho từng tier (VND mỗi giải trúng).
   *
   * Giá trị thực tế phụ thuộc số người trúng (chỉ xác định sau settle).
   * Đây là giá trị tham khảo khi chỉ có 1 winner mỗi tier.
   */
  estimatedBonusPerTier: Partial<Record<Lotto535PrizeTier, number>>;
}

// ─────────────────────────────────────────────
// Response Types — Draw Results
// ─────────────────────────────────────────────

/**
 * Chi tiết giải thưởng 1 tier trong kết quả kỳ quay.
 */
export interface Lotto535DrawTierPrize {
  /** Hạng giải (jackpot, tier1, ..., consolation). */
  tier: Lotto535PrizeTier;
  /** Số lượt trúng tier này. */
  winnerCount: number;
  /** Tổng tiền thưởng tier này (VND). */
  prizeAmount: number;
}

/**
 * Kết quả chi tiết 1 kỳ quay Lotto 5/35 — dùng cho trang xem kết quả.
 *
 * Bao gồm: kết quả quay, jackpot snapshot, bảng giải thưởng chi tiết.
 * Chỉ có cho draws đã settle.
 *
 * Dùng cho endpoint chi tiết: GET /games/lotto535/draw-results/:drawId
 */
export interface Lotto535DrawResultDetail {
  /** Mã kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1 = 13h, 2 = 21h). */
  drawNo: number;
  /** Giờ quay (ISO 8601). */
  drawTime: string;
  /** Kết quả quay. */
  result: {
    /** 5 số chính trúng thưởng (sorted, zero-padded "01"-"35"). */
    winningMain: string[];
    /** Số đặc biệt trúng thưởng ("01"-"12"). */
    winningSpecial: string;
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /** Jackpot snapshot kỳ quay. */
  jackpot: {
    /** Jackpot đầu kỳ (VND). */
    openingAmount: number;
    /** Jackpot cuối kỳ (VND). */
    closingAmount: number;
    /** Kỳ chia giải Jackpot? */
    isSplitCycle?: boolean;
  };
  /** Chi tiết giải thưởng từng tier. */
  prizes: Lotto535DrawTierPrize[];
  /** Tham chiếu Vietlott (nếu có). */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

/**
 * Tóm tắt 1 kỳ quay Lotto 5/35 trong danh sách — kết quả + jackpot snapshot, không có bảng giải thưởng chi tiết.
 *
 * Dùng cho endpoint danh sách: GET /games/lotto535/draw-results
 * Prize details xem ở: GET /games/lotto535/draw-results/:drawId
 *
 * @example
 * ```ts
 * const { draws } = await client.lotto535.listDrawResults({ size: 10 });
 * for (const draw of draws) {
 *   console.log(`Kỳ ${draw.drawId}: ${draw.result.winningMain.join(", ")}`);
 *   console.log(`Jackpot: ${draw.jackpot.closingAmount.toLocaleString()} VND`);
 * }
 * ```
 */
export interface Lotto535DrawResultSummary {
  /** Mã kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1 = 13h, 2 = 21h). */
  drawNo: number;
  /** Giờ quay (ISO 8601). */
  drawTime: string;
  /** Kết quả quay. */
  result: {
    /** 5 số chính trúng thưởng (sorted, zero-padded "01"-"35"). */
    winningMain: string[];
    /** Số đặc biệt trúng thưởng ("01"-"12"). */
    winningSpecial: string;
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /** Jackpot snapshot kỳ quay — hữu ích để hiển thị kỳ có trúng Jackpot không. */
  jackpot: {
    /** Jackpot đầu kỳ (VND). */
    openingAmount: number;
    /** Jackpot cuối kỳ (VND). */
    closingAmount: number;
    /** Kỳ chia giải Jackpot? */
    isSplitCycle?: boolean;
  };
  /** Tham chiếu Vietlott (nếu có). */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

// ─────────────────────────────────────────────
// Response Types — Game Config
// ─────────────────────────────────────────────

/**
 * Luật chơi game Lotto 5/35.
 */
export interface Lotto535GameRules {
  /** Giá 1 line (bộ số con) cho 1 kỳ (VND). VD: 10000. */
  unitPrice: number;
  /** Số board tối đa trên 1 vé (A-E). VD: 5. */
  maxBoardsPerTicket: number;
  /** Số kỳ liên tiếp tối đa. VD: 6. */
  maxDrawCount: number;
  /** Số kỳ quay mỗi ngày. VD: 2. */
  drawsPerDay: number;
  /** Giờ quay trong ngày. VD: ["13:00", "21:00"]. */
  drawTimes: string[];
  /** Số lần cược tối thiểu cho 1 board. */
  minBetCount: number;
  /** Số lần cược tối đa cho 1 board. */
  maxBetCount: number;
}

/**
 * Bảng giải thưởng cố định Lotto 5/35.
 *
 * Giải Jackpot (5 chính + ĐB) là tích lũy — xem `client.lotto535.getJackpot()` để biết giá trị hiện tại.
 */
export interface Lotto535PrizeAmounts {
  /** Giải Nhất: 5 số chính (VND). */
  tier1: number;
  /** Giải Nhì: 4 chính + đặc biệt (VND). */
  tier2: number;
  /** Giải Ba: 4 chính (VND). */
  tier3: number;
  /** Giải Tư: 3 chính + đặc biệt (VND). */
  tier4: number;
  /** Giải Năm: 3 chính (VND). */
  tier5: number;
  /** Giải Khuyến Khích: chỉ đặc biệt (VND). */
  consolation: number;
}

/**
 * Thông tin Jackpot hiển thị cho player (từ game config).
 */
export interface Lotto535JackpotConfigInfo {
  /** Số tiền khởi điểm khi mở vòng Jackpot mới (VND). */
  seedAmount: number;
  /** Ngưỡng kích hoạt chia giải Độc Đắc (VND). */
  splitThreshold: number;
}

/**
 * Cấu hình theo tenant.
 */
export interface Lotto535TenantConfig {
  /** Tenant này có được phép chơi game Lotto 5/35 không. */
  isEnabled: boolean;
}

/**
 * Response từ `GET /games/lotto535/config`.
 *
 * Chứa toàn bộ cấu hình game cần thiết cho frontend:
 * - Luật chơi (mệnh giá, số board, số kỳ tối đa, giờ quay)
 * - Bảng giải thưởng cố định (tier1 → consolation)
 * - Thông tin Jackpot (seed, ngưỡng chia)
 * - Cấu hình tenant (có được phép chơi không)
 *
 * @example
 * ```ts
 * const config = await client.lotto535.getGameConfig();
 *
 * // Kiểm tra tenant có được chơi không
 * if (!config.tenant.isEnabled) {
 *   showDisabledMessage();
 *   return;
 * }
 *
 * // Mệnh giá 1 line
 * console.log(config.game.unitPrice); // 10000
 *
 * // Giải Nhất
 * console.log(config.prizes.tier1); // 10000000
 *
 * // Ngưỡng chia Jackpot
 * console.log(config.jackpot.splitThreshold); // 12000000000
 * ```
 */
export interface Lotto535GameConfigResponse {
  /** Luật chơi. */
  game: Lotto535GameRules;
  /** Bảng giải thưởng cố định. */
  prizes: Lotto535PrizeAmounts;
  /** Cấu hình Jackpot (hiển thị cho player). */
  jackpot: Lotto535JackpotConfigInfo;
  /** Cấu hình theo tenant. */
  tenant: Lotto535TenantConfig;
}

// ─────────────────────────────────────────────
// Response Types — Place Bet
// ─────────────────────────────────────────────

/**
 * Response khi đặt cược Lotto 5/35 thành công.
 *
 * Trả về từ `POST /games/lotto535/bets` qua `client.lotto535.placeBet()`.
 */
export interface Lotto535PlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. VD: `"L535-20260307-00008"`. */
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
    /** Tổng tiền toàn vé (VND) = amountPerDraw × drawCount. */
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

/**
 * Tham số truy vấn danh sách kết quả kỳ quay Lotto 5/35.
 *
 * Cursor-based pagination, filter từ ngày.
 *
 * @example
 * ```ts
 * // Kết quả từ ngày 1/3/2026
 * const results = await client.lotto535.listDrawResults({
 *   from: "2026-03-01",
 *   size: 10,
 * });
 *
 * // Trang tiếp theo
 * if (results.nextCursor) {
 *   const page2 = await client.lotto535.listDrawResults({
 *     from: "2026-03-01",
 *     size: 10,
 *     cursor: results.nextCursor,
 *   });
 * }
 * ```
 */
export interface Lotto535ListDrawResultsParams {
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
 * Response từ `GET /games/lotto535/draws/current`.
 *
 * Chứa thông tin kỳ quay hiện tại và danh sách kỳ đang active.
 *
 * @example
 * ```ts
 * const data = await client.lotto535.getCurrentDraw();
 *
 * if (data.currentDraw) {
 *   console.log(data.currentDraw.drawId);          // "2026-03-05.001"
 *   console.log(data.currentDraw.sales.closeAt);    // "2026-03-05T12:50:00Z"
 *   console.log(data.currentDraw.status);           // "salesOpen"
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
 * Thông tin Jackpot Lotto 5/35 hiện tại.
 *
 * Trả về bởi `client.lotto535.getJackpot()`.
 * Lotto 5/35 có Split Cycle — Jackpot được chia khi đạt ngưỡng `splitThreshold`.
 *
 * @example
 * ```ts
 * const jp = await client.lotto535.getJackpot();
 * console.log(`Jackpot: ${jp.currentAmount.toLocaleString()} VND`);
 * console.log(`Tiến trình: ${jp.progress.percentage.toFixed(1)}%`);
 * ```
 */
export interface Lotto535JackpotResponse {
  /** Số thứ tự cycle Jackpot (tăng dần mỗi khi chia). */
  cycleNo: number;
  /** Giá trị Jackpot hiện tại (VND). */
  currentAmount: number;
  /** Số tiền khởi điểm (seed) khi bắt đầu cycle mới (VND). */
  seedAmount: number;
  /** Số tiền Jackpot cao nhất đạt được trong cycle hiện tại (VND). */
  peakAmount: number;
  /** Tổng tiền đã tích luỹ vào Jackpot từ đầu cycle (VND). */
  totalContribution: number;
  /** Số kỳ quay đã settle trong cycle hiện tại. */
  drawCount: number;
  /** DrawId của kỳ đầu tiên trong cycle. Format: `YYYY-MM-DD.NNN`. */
  startDrawId: string;
  /** Tiến trình tích luỹ Jackpot hướng tới ngưỡng chia. */
  progress: {
    /** Ngưỡng kích hoạt chia Jackpot (VND). */
    splitThreshold: number;
    /** Phần trăm tiến trình (0–100) = currentAmount / splitThreshold × 100. */
    percentage: number;
  };
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
 * console.log(data.ticket.ticketNo); // "L535-20260307-00008"
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
 * Chi tiết một dòng cược (line) Lotto 5/35 đã được expand.
 *
 * Lotto 5/35 mỗi line có `main` (5 số chính) và `special` (1 số đặc biệt).
 * `matchResult.specialMatched` xác định điều kiện Jackpot (5/5 + đặc biệt).
 *
 * Dùng trong {@link Lotto535EntryLinesResponse}.
 */
export interface Lotto535LineInfo {
  /** Ký hiệu board chứa line này. VD: `"A"`, `"B"`. */
  boardNo: string;
  /** Vị trí line trong entry (0-based). Dùng làm cursor khi phân trang. */
  lineIndex: number;
  /**
   * 5 số chính của line (zero-padded `"01"`–`"35"`, sorted ascending).
   * VD: `["03", "11", "18", "25", "35"]`.
   */
  main: string[];
  /**
   * Số đặc biệt của line (zero-padded `"01"`–`"12"`).
   * VD: `"07"`.
   */
  special: string;
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
    /** Số lượng số chính trùng (0–5). */
    mainMatchCount: number;
    /** `true` nếu số đặc biệt trùng — điều kiện để trúng Jackpot (5/5 + ĐB). */
    specialMatched: boolean;
    /**
     * Hạng giải trúng. `null` nếu không trúng.
     *
     * | tier           | Điều kiện                   |
     * |----------------|-----------------------------|
     * | `"jackpot"`    | 5/5 chính + đặc biệt        |
     * | `"tier1"`      | 5/5 chính                   |
     * | `"tier2"`      | 4/5 chính + đặc biệt        |
     * | `"tier3"`      | 4/5 chính                   |
     * | `"tier4"`      | 3/5 chính + đặc biệt        |
     * | `"tier5"`      | 3/5 chính                   |
     * | `"consolation"` | chỉ đặc biệt               |
     */
    tier: string | null;
    /**
     * Tiền thưởng dòng này (VND).
     * Jackpot = 0 tại đây — giá trị chính xác tính sau khi biết số winners.
     */
    winAmount: number;
  };
}

/**
 * Danh sách lines chi tiết của một entry Lotto 5/35 (cursor-based pagination).
 *
 * Trả về bởi `client.lotto535.getEntryLines()`.
 * Chỉ khả dụng khi entry đã ở trạng thái `"settled"`.
 *
 * @example
 * ```ts
 * const page1 = await client.lotto535.getEntryLines(entryId, { size: 50 });
 * for (const line of page1.lines) {
 *   console.log(`[${line.boardNo}#${line.lineIndex}] ${line.main.join(",")} | ĐB:${line.special}`);
 *   console.log(`  Khớp: ${line.matchResult.mainMatchCount}/5, ĐB:${line.matchResult.specialMatched}`);
 * }
 *
 * if (page1.nextCursor !== null) {
 *   const page2 = await client.lotto535.getEntryLines(entryId, {
 *     size: 50,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Lotto535EntryLinesResponse {
  /** ID entry đang xem. */
  entryId: string;
  /** ID kỳ quay entry thuộc về. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Danh sách lines trong trang hiện tại. */
  lines: Lotto535LineInfo[];
  /**
   * Cursor cho trang tiếp theo — giá trị `lineIndex` của dòng cuối cùng.
   * `null` nếu đã hết dữ liệu.
   */
  nextCursor: number | null;
  /** Số lines mỗi trang (echo lại `size` từ request). */
  size: number;
}

/**
 * Response phân trang danh sách kết quả kỳ quay Lotto 5/35.
 *
 * Dùng cho `listDrawResults`.
 *
 * @example
 * ```ts
 * const page = await client.lotto535.listDrawResults({ size: 10 });
 * for (const draw of page.draws) {
 *   console.log(`Kỳ ${draw.drawId}: ${draw.result.winningMain.join(", ")}`);
 *   console.log(`Jackpot: ${draw.jackpot.closingAmount.toLocaleString()} VND`);
 * }
 * ```
 */
export interface Lotto535ListDrawResultsResponse {
  /** Danh sách tóm tắt kỳ quay (không có bảng giải thưởng). */
  draws: Lotto535DrawResultSummary[];
  /** Cursor cho trang tiếp theo. `null` nếu hết. */
  nextCursor: string | null;
  /** Số lượng mỗi trang (echo lại `size`). */
  size: number;
}

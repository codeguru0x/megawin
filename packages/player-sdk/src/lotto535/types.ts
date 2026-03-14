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
   * Mã board: `"A"`, `"B"`, `"C"`, `"D"`, hoặc `"E"`.
   *
   * Không được trùng boardNo giữa các boards trong cùng 1 vé.
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
 *   drawId: "2026-02-25.001",
 *   drawCount: 3,
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
   * DrawId kỳ quay đầu tiên tham gia.
   *
   * Format: `YYYY-MM-DD.NNN` (vd `"2026-02-25.001"`)
   */
  drawId: string;

  /**
   * Số kỳ tham gia liên tiếp (1-6).
   */
  drawCount: number;

  /**
   * Danh sách boards.
   *
   * Tối đa 5 boards, không được trùng boardNo.
   */
  boards: Lotto535BoardInput[];
}

// ─────────────────────────────────────────────
// Response Types (hiển thị)
// ─────────────────────────────────────────────

/**
 * Thông tin kỳ quay Lotto 5/35 cho UI.
 */
export interface Lotto535DrawInfo {
  /** ID kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Số thứ tự: 1 = 13h, 2 = 21h. */
  drawNo: number;
  /** Thời điểm quay (ISO 8601). */
  drawTime: string;
  /** Trạng thái kỳ quay. */
  status: "upcoming" | "open" | "closed" | "completed";
  /** Thời điểm đóng bán (ISO 8601). */
  salesCloseAt: string;
  /** Giá trị Jackpot hiện tại (VND). */
  jackpotAmount: number;
  /** `true` nếu kỳ quay này là kỳ chia giải Jackpot. */
  isSplitCycle?: boolean;

  /** Tham chiếu kỳ quay Vietlott (nếu có). */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

/**
 * Kết quả kỳ quay Lotto 5/35.
 */
export interface Lotto535DrawResult {
  /** 5 số chính trúng thưởng (1-35). */
  winningMain: number[];
  /** 1 số đặc biệt trúng thưởng (1-12). */
  winningSpecial: number;
  /** Thời điểm công bố (ISO 8601). */
  publishedAt: string;
}

/**
 * Tóm tắt vé Lotto 5/35 cho UI.
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
  /** ID vé. */
  id: string;
  /** Mã vé hiển thị. VD: `"L535-20260307-00008"`. */
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
    linesPerDraw: number;
    amountPerDraw: number;
    totalAmount: number;
  };
  /** Danh sách boards. */
  boards: Lotto535BoardSummary[];
  /**
   * Tiến độ settle.
   * settledDraws = số kỳ đã xử lý xong (settled + voided).
   */
  progress: {
    totalDraws: number;
    settledDraws: number;
  };
  /** Tổng kết trúng thưởng. `undefined` nếu chưa có kỳ nào settle. */
  settlement?: {
    totalWinAmount: number;
    lastSettledAt?: string;
  };
  /**
   * Tóm tắt huỷ cược. `undefined` nếu không có kỳ nào bị void.
   */
  voidSummary?: {
    totalVoidedAmount: number;
    totalRefundedAmount: number;
    voidedDrawCount: number;
    voidedDrawIds: string[];
    lastVoidedAt?: string;
  };
  /** Thời điểm mua vé (ISO 8601). */
  createdAt: string;
}

/**
 * Tóm tắt board trong vé Lotto 5/35.
 */
export interface Lotto535BoardSummary {
  /** Mã board. */
  boardNo: string;
  /** Kiểu chơi. */
  playType: Lotto535PlayType;
  /** Danh sách số chính (number, 1-35). */
  mainNumbers: number[];
  /** Danh sách số đặc biệt (number, 1-12). */
  specialNumbers: number[];
  /** Số lines mở rộng (bao). */
  expandedLines: number;
}

/**
 * Kết quả entry (vé 1 kỳ) cho UI.
 */
export interface Lotto535EntryResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày quay. */
  drawDate: string;
  /** Trạng thái: chờ quay / đã có kết quả / đã tính thưởng. */
  status: "pending" | "settled";
  /** Tiền cược kỳ này (VND). */
  amount: number;
  /** Kết quả quay (nếu đã có). */
  result?: Lotto535DrawResult;
  /** Chi tiết trúng thưởng (nếu đã settle). */
  payout?: Lotto535EntryPayoutSummary;
}

/**
 * Chi tiết trả thưởng entry Lotto 5/35.
 */
export interface Lotto535EntryPayoutSummary {
  /** Tổng tiền thắng kỳ này (VND). */
  winAmount: number;

  /** Chi tiết theo hạng giải. */
  tiers: Array<{
    /** Hạng giải. */
    tier: Lotto535PrizeTier;
    /** Tên tiếng Việt (vd "Giải Nhất"). */
    label: string;
    /** Số lines trúng hạng này. */
    hitCount: number;
    /** Tiền thưởng cố định (VND). */
    amount: number;
    /** Bonus từ chia Jackpot (nếu kỳ split cycle). */
    splitBonus?: number;
    /** `true` nếu trúng Jackpot (5 chính + ĐB). */
    isJackpot?: boolean;
  }>;
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

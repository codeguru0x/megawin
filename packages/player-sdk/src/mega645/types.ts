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
}

/**
 * Input để đặt cược Mega 6/45.
 *
 * @example
 * ```ts
 * const result = await client.mega645.placeBet({
 *   drawId: "2026-03-07.001",
 *   drawCount: 1,
 *   boards: [
 *     {
 *       boardNo: "A",
 *       playType: "standard",
 *       selection: { mainNumbers: ["05", "12", "22", "31", "40", "45"] },
 *     },
 *   ],
 * });
 * console.log(result.ticketId);    // "TKT-..."
 * console.log(result.totalAmount); // 10000
 * ```
 */
export interface Mega645TicketPurchaseInput {
  /** Mã kỳ quay bắt đầu. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Số kỳ liên tiếp muốn đặt. Tối thiểu 1. */
  drawCount: number;
  /** Danh sách boards trong vé. */
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
 * Trả về bởi {@link Mega645Api.listPendingTickets} và {@link Mega645Api.listTickets}.
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
    /** Số lines mỗi kỳ. */
    linesPerDraw: number;
    /** Tổng tiền mỗi kỳ (VND). */
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
 * Trả về bởi {@link Mega645Api.getTicketEntries}.
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

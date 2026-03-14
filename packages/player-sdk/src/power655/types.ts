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
}

export interface Power655TicketPurchaseInput {
  drawId: string;
  drawCount: number;
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
    linesPerDraw: number;
    /** Tiền cược mỗi kỳ (VND) = unitPrice × linesPerDraw. */
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
  amount: number;
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
    prizeAmount: number;
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

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
  /** Mã vé hiển thị cho người chơi. */
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
  result?: { winningMain: number[]; bonusNumber: number; publishedAt: string };
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

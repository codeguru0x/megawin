/**
 * Max 3D SDK – Public Types
 * @module
 */

import type { Max3dPlayMode, Max3dPlayType } from "./enums";

// ─────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────

export interface Max3dBoardInput {
  boardNo: string;
  playMode: Max3dPlayMode;
  playType: Max3dPlayType;
  /** 1 bộ ba số cho basic, 2 bộ ba số cho plus. */
  triplets: string[];
}

export interface Max3dTicketPurchaseInput {
  drawId: string;
  drawCount: number;
  boards: Max3dBoardInput[];
}

// ─────────────────────────────────────────────
// Response Types — Game Config
// ─────────────────────────────────────────────

export interface Max3dGameRules {
  unitPrice: number;
  maxBoardsPerTicket: number;
  maxDrawCount: number;
  drawsPerDay: number;
  drawTimes: string[];
  /** Ngày quay trong tuần (0=CN, 1=T2, 3=T4, 5=T6). */
  drawDaysOfWeek: number[];
}

export interface Max3dBasicPrizeAmounts {
  special: number;
  first: number;
  second: number;
  third: number;
}

export interface Max3dComboPrizeAmounts {
  combo3: Max3dBasicPrizeAmounts;
  combo6: Max3dBasicPrizeAmounts;
}

export interface Max3dPlusPrizeAmounts {
  special: number;
  first: number;
  second: number;
  third: number;
  fourth: number;
  fifth: number;
  sixth: number;
}

export interface Max3dPrizesConfig {
  basic: Max3dBasicPrizeAmounts;
  combo: Max3dComboPrizeAmounts;
  plus: Max3dPlusPrizeAmounts;
}

export interface Max3dTenantConfig {
  isEnabled: boolean;
}

/**
 * Response từ `GET /games/max3d/config`.
 */
export interface Max3dGameConfigResponse {
  game: Max3dGameRules;
  prizes: Max3dPrizesConfig;
  tenant: Max3dTenantConfig;
}

// ─────────────────────────────────────────────
// Response Types — Draw / Ticket
// ─────────────────────────────────────────────

export interface Max3dDrawInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  status: string;
  sales: {
    openAt?: string;
    closeAt: string;
  };
}

// ─────────────────────────────────────────────
// Response Types — Entry Lines
// ─────────────────────────────────────────────

/**
 * Thông tin chi tiết 1 line trong entry Max 3D.
 *
 * Mỗi line là 1 cặp bộ ba số (Basic) hoặc 2 bộ ba (Plus).
 * `matchResult` chỉ có sau khi kỳ quay đã settle.
 */
export interface Max3dLineInfo {
  /** Ký hiệu board chứa line này. VD: `"A"`, `"B"`. */
  boardNo: string;
  /** Vị trí line trong entry (0-based). Dùng làm cursor khi phân trang. */
  lineIndex: number;
  /**
   * Chế độ chơi.
   * - `"basic"` — 1 bộ ba số so với từng bộ trong kết quả quay
   * - `"plus"` — 2 bộ ba số kết hợp thành cặp
   */
  playMode: string;
  /**
   * Kiểu chơi.
   * - `"straight"` — so khớp đúng thứ tự
   * - `"combo3"` — hoán vị 3 số khác nhau (6 cách)
   * - `"combo6"` — hoán vị có 1 cặp trùng (3 cách)
   */
  playType: string;
  /**
   * Danh sách bộ ba số của line này.
   * Basic: 1 phần tử. Plus: 2 phần tử. Mỗi bộ ba là string 3 chữ số `"000"`-`"999"`.
   * VD: `["123"]` (basic) hoặc `["123", "456"]` (plus).
   */
  triplets: string[];
  /** Kết quả đối chiếu. `undefined` nếu kỳ quay chưa kết thúc. */
  matchResult?: {
    /**
     * Danh sách các giải trúng (gộp giải theo luật Vietlott Max 3D).
     * Mảng rỗng nếu không trúng giải nào.
     * Basic: 1 triplet có thể trúng nhiều hạng đồng thời.
     * Plus: gộp tất cả giải đạt điều kiện.
     * Combo: mỗi hoán vị cũng có thể trúng nhiều hạng.
     */
    tiers: Array<{
      /**
       * Hạng giải trúng.
       * Basic: `"special"` | `"first"` | `"second"` | `"third"`.
       * Plus: `"special"` | `"first"` | ... | `"sixth"`.
       */
      tier: string;
      /** Tiền thưởng hạng giải này (VND). */
      winAmount: number;
    }>;
    /** Tổng tiền thưởng = Σ(tiers[].winAmount). `0` nếu không trúng. */
    winAmount: number;
  };
}

// ─────────────────────────────────────────────
// Response Types — Draw Results
// ─────────────────────────────────────────────

/**
 * Thông tin giải thưởng 1 hạng trong kỳ quay Max 3D.
 *
 * Bao gồm cả giải Basic (4 hạng) và Plus (7 hạng) gộp chung.
 */
export interface Max3dDrawTierPrize {
  /**
   * Hạng giải.
   * Basic: `"special"` | `"first"` | `"second"` | `"third"`.
   * Plus: `"special"` | `"first"` | `"second"` | `"third"` | `"fourth"` | `"fifth"` | `"sixth"`.
   */
  tier: string;
  /** Tổng số người trúng hạng này. */
  winnerCount: number;
  /** Tổng tiền thưởng đã trao cho hạng này (VND). */
  prizeAmount: number;
}

/**
 * Tóm tắt kết quả 1 kỳ quay Max 3D (dùng trong danh sách).
 *
 * Trả về bởi `client.max3d.listDrawResults()`.
 *
 * @example
 * ```ts
 * const { draws } = await client.max3d.listDrawResults({ size: 10 });
 * for (const draw of draws) {
 *   console.log(`[${draw.drawId}]`);
 *   console.log(`  Đặc biệt: ${draw.result.special.join(", ")}`);
 *   console.log(`  Nhất:     ${draw.result.first.join(", ")}`);
 * }
 * ```
 */
export interface Max3dDrawResultSummary {
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
     * Các bộ ba giải Đặc Biệt (string `"000"`-`"999"`).
     * VD: `["123"]`.
     */
    special: string[];
    /** Các bộ ba giải Nhất. */
    first: string[];
    /** Các bộ ba giải Nhì. */
    second: string[];
    /** Các bộ ba giải Ba. */
    third: string[];
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Tham chiếu kỳ quay Vietlott. `undefined` nếu không liên kết. */
  vietlottRef?: {
    drawPeriod: number;
    drawDate: string;
  };
}

/**
 * Chi tiết đầy đủ kết quả 1 kỳ quay Max 3D bao gồm bảng giải.
 *
 * Trả về bởi `client.max3d.getDrawResult(drawId)`.
 *
 * @example
 * ```ts
 * const draw = await client.max3d.getDrawResult("2026-03-07.001");
 * console.log(`Đặc biệt: ${draw.result.special.join(", ")}`);
 * for (const prize of draw.prizes) {
 *   console.log(`  ${prize.tier}: ${prize.winnerCount} người, ${prize.prizeAmount.toLocaleString()} VND`);
 * }
 * ```
 */
export interface Max3dDrawResultInfo {
  /** ID kỳ quay. Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.001"`. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày (1-based). */
  drawNo: number;
  /** Giờ quay. VD: `"18:00"`. */
  drawTime: string;
  /** Kết quả quay số (20 bộ ba chia 4 hạng). */
  result: {
    /**
     * Các bộ ba giải Đặc Biệt (string `"000"`-`"999"`).
     * VD: `["123"]`.
     */
    special: string[];
    /** Các bộ ba giải Nhất. */
    first: string[];
    /** Các bộ ba giải Nhì. */
    second: string[];
    /** Các bộ ba giải Ba. */
    third: string[];
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /**
   * Bảng trao giải theo hạng.
   * Gộp cả Basic và Plus: `special`, `first`, `second`, `third`, `fourth`, `fifth`, `sixth`.
   */
  prizes: Max3dDrawTierPrize[];
  /** Tham chiếu kỳ quay Vietlott. `undefined` nếu không liên kết. */
  vietlottRef?: {
    drawPeriod: number;
    drawDate: string;
  };
}

/**
 * Tóm tắt vé Max 3D cho UI.
 *
 * @example
 * ```ts
 * const { tickets } = await client.max3d.listPendingTickets();
 * for (const ticket of tickets) {
 *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ`);
 *   if (ticket.voidSummary) {
 *     const type = ticket.voidSummary.isFullVoid ? "full void" : "partial void";
 *     console.log(`[${type}] boards: ${ticket.voidSummary.voidedBoards.join(", ")}, hoàn: ${ticket.voidSummary.refundAmount} VND`);
 *   }
 * }
 * ```
 */
export interface Max3dTicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. VD: `"M3D-20260307-00005"`. */
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
  /** Danh sách boards trong vé. */
  boards: Array<{
    boardNo: string;
    playMode: string;
    playType: string;
    triplets: string[];
    lineCount: number;
  }>;
  /**
   * Tiến độ settle.
   * settledDraws = số kỳ đã xử lý xong (settled + voided).
   */
  progress: {
    totalDraws: number;
    settledDraws: number;
  };
  /** Tổng kết trả thưởng. `undefined` nếu chưa có kỳ nào settle. */
  settlement?: {
    totalWinAmount: number;
    lastSettledAt?: string;
  };
  /**
   * Tóm tắt huỷ cược. `undefined` nếu không có void.
   * Max3D void theo board (không phải theo draw).
   */
  voidSummary?: {
    /** True nếu toàn bộ vé bị void. */
    isFullVoid: boolean;
    /** Danh sách boardNo bị void. */
    voidedBoards: string[];
    /** Tiền cược gốc trước khi void (VND). */
    originalAmount: number;
    /** Tiền đã hoàn trả cho player (VND). */
    refundAmount: number;
    /** Thời điểm void (ISO 8601). */
    voidedAt: string;
  };
  /** Thời điểm mua vé (ISO 8601). */
  createdAt: string;
}

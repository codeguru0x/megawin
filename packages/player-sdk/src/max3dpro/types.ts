/**
 * Max 3D Pro SDK – Public Types
 * @module
 */

import type { Max3dproPlayMode } from "./enums";

// ─────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────

export interface Max3dproMultiNumberInput {
  playMode: "multiNumber";
  triplets: string[];
}

export interface Max3dproMultiDigitInput {
  playMode: "multiDigit";
  frontDigits: number[];
  backDigits: number[];
}

export interface Max3dproBoardInput {
  boardNo: string;
  playMode: Max3dproPlayMode;
  triplets?: string[];
  frontDigits?: number[];
  backDigits?: number[];
}

export interface Max3dproTicketPurchaseInput {
  drawId: string;
  drawCount: number;
  boards: Max3dproBoardInput[];
}

// ─────────────────────────────────────────────
// Response Types — Game Config
// ─────────────────────────────────────────────

export interface Max3dproGameRules {
  unitPrice: number;
  maxBoardsPerTicket: number;
  maxDrawCount: number;
  drawsPerDay: number;
  drawTimes: string[];
  /** Ngày quay trong tuần (0=CN, 2=T3, 4=T5, 6=T7). */
  drawDaysOfWeek: number[];
  /** Số bộ ba số tối thiểu cho multiNumber mode. */
  multiNumberMin: number;
  /** Số bộ ba số tối đa cho multiNumber mode. */
  multiNumberMax: number;
}

export interface Max3dproPrizeAmounts {
  /** Giải Đặc Biệt: đúng thứ tự quay (VND). */
  special: number;
  /** Giải phụ Đặc Biệt: ngược thứ tự quay (VND). */
  specialSub: number;
  first: number;
  second: number;
  third: number;
  fourth: number;
  fifth: number;
  sixth: number;
}

export interface Max3dproTenantConfig {
  isEnabled: boolean;
}

/**
 * Response từ `GET /games/max3dpro/config`.
 */
export interface Max3dproGameConfigResponse {
  game: Max3dproGameRules;
  prizes: Max3dproPrizeAmounts;
  tenant: Max3dproTenantConfig;
}

// ─────────────────────────────────────────────
// Response Types — Draw / Ticket
// ─────────────────────────────────────────────

export interface Max3dproDrawInfo {
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
 * Thông tin chi tiết 1 line trong entry Max 3D Pro.
 *
 * Mỗi line là 1 cặp bộ ba số expand từ multiNumber hoặc multiDigit input.
 * `matchResult` chỉ có sau khi kỳ quay đã settle.
 */
export interface Max3dproLineInfo {
  /** Ký hiệu board chứa line này. VD: `"A"`, `"B"`. */
  boardNo: string;
  /** Vị trí line trong entry (0-based). Dùng làm cursor khi phân trang. */
  lineIndex: number;
  /**
   * Chế độ chơi.
   * - `"multiNumber"` — chọn N bộ ba, expand thành C(N,2) cặp
   * - `"multiDigit"` — chọn chữ số riêng, expand thành tổ hợp
   */
  playMode: string;
  /** Kiểu chơi. Max 3D Pro chỉ có `"straight"`. */
  playType: string;
  /**
   * 2 bộ ba số của line này (mỗi bộ là string `"000"`-`"999"`).
   * VD: `["123", "456"]`.
   */
  triplets: string[];
  /** Kết quả đối chiếu. `undefined` nếu kỳ quay chưa kết thúc. */
  matchResult?: {
    /**
     * Danh sách các giải trúng (gộp giải theo luật Vietlott Max 3D Pro).
     * Mảng rỗng nếu không trúng giải nào.
     * 1 cặp số có thể trúng nhiều giải đồng thời (ví dụ: Tư + Năm + Sáu).
     */
    tiers: Array<{
      /**
       * Hạng giải trúng.
       * `"special"` | `"specialSub"` | `"first"` | `"second"` | `"third"` |
       * `"fourth"` | `"fifth"` | `"sixth"`.
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
 * Thông tin giải thưởng 1 hạng trong kỳ quay Max 3D Pro.
 *
 * Max 3D Pro có 8 hạng giải (bao gồm `specialSub`).
 */
export interface Max3dproDrawTierPrize {
  /**
   * Hạng giải.
   * - `"special"` — đúng thứ tự quay (Đặc Biệt)
   * - `"specialSub"` — ngược thứ tự quay (Đặc Biệt phụ)
   * - `"first"` | `"second"` | `"third"` | `"fourth"` | `"fifth"` | `"sixth"`
   */
  tier: string;
  /** Tổng số người trúng hạng này. */
  winnerCount: number;
  /** Tổng tiền thưởng đã trao cho hạng này (VND). */
  prizeAmount: number;
}

/**
 * Tóm tắt kết quả 1 kỳ quay Max 3D Pro (dùng trong danh sách).
 *
 * Trả về bởi `client.max3dpro.listDrawResults()`.
 *
 * @example
 * ```ts
 * const { draws } = await client.max3dpro.listDrawResults({ size: 10 });
 * for (const draw of draws) {
 *   console.log(`[${draw.drawId}]`);
 *   console.log(`  Đặc biệt: ${draw.result.special.join(", ")}`);
 * }
 * ```
 */
export interface Max3dproDrawResultSummary {
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
 * Chi tiết đầy đủ kết quả 1 kỳ quay Max 3D Pro bao gồm bảng giải.
 *
 * Trả về bởi `client.max3dpro.getDrawResult(drawId)`.
 *
 * @example
 * ```ts
 * const draw = await client.max3dpro.getDrawResult("2026-03-07.001");
 * console.log(`Đặc biệt: ${draw.result.special.join(", ")}`);
 * for (const prize of draw.prizes) {
 *   console.log(`  ${prize.tier}: ${prize.winnerCount} người, ${prize.prizeAmount.toLocaleString()} VND`);
 * }
 * ```
 */
export interface Max3dproDrawResultInfo {
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
    /** Các bộ ba giải Đặc Biệt. VD: `["123"]`. */
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
   * Bảng trao giải theo hạng (8 hạng).
   * `special`, `specialSub`, `first`, `second`, `third`, `fourth`, `fifth`, `sixth`.
   */
  prizes: Max3dproDrawTierPrize[];
  /** Tham chiếu kỳ quay Vietlott. `undefined` nếu không liên kết. */
  vietlottRef?: {
    drawPeriod: number;
    drawDate: string;
  };
}

/**
 * Tóm tắt vé Max 3D Pro cho UI.
 *
 * @example
 * ```ts
 * const { tickets } = await client.max3dpro.listPendingTickets();
 * for (const ticket of tickets) {
 *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ`);
 *   if (ticket.voidSummary) {
 *     const type = ticket.voidSummary.isFullVoid ? "full void" : "partial void";
 *     console.log(`[${type}] boards: ${ticket.voidSummary.voidedBoards.join(", ")}, hoàn: ${ticket.voidSummary.refundAmount} VND`);
 *   }
 * }
 * ```
 */
export interface Max3dproTicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. VD: `"M3DP-20260307-00004"`. */
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
    /** Danh sách bộ ba số (dùng cho multiNumber). */
    triplets: string[];
    /** Các chữ số đầu (dùng cho multiDigit). */
    frontDigits?: number[];
    /** Các chữ số cuối (dùng cho multiDigit). */
    backDigits?: number[];
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
   * Max3D Pro void theo board (không phải theo draw).
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

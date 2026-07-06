/**
 * Bingo 18 SDK – Public Types
 *
 * Types cho game Bingo 18 (3 viên xúc xắc, mỗi viên 1-6).
 *
 * @module
 */

import type { Bingo18PlayType, Bingo18TripleKind, Bingo18BigSmallBet } from "./enums";

// ─────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────

/**
 * Input một board Bingo 18 — bao gồm cả board cơ bản (singleNum, doubleMatch, tripleMatch)
 * và board cược bổ sung (sumTotal, bigSmallDraw).
 *
 * Tuỳ `playType`, các field `number`, `tripleKind`, `sum`, `bet`, và `betCount` được dùng khác nhau.
 *
 * @example
 * ```ts
 * // Board cơ bản: đoán số 5 xuất hiện
 * const b1: Bingo18BoardInput = { boardNo: "A", playType: "singleNum", number: 5 };
 *
 * // Board cược bổ sung: đoán tổng bằng 14
 * const b2: Bingo18BoardInput = { boardNo: "B", playType: "sumTotal", sum: 14 };
 *
 * // Board cược bổ sung: đoán Tài
 * const b3: Bingo18BoardInput = { boardNo: "C", playType: "bigSmallDraw", bet: "big" };
 * ```
 */
export interface Bingo18BoardInput {
  /**
   * Ký hiệu board trong vé, sinh tự động theo thứ tự chữ cái: `"A"`, `"B"`, ..., `"Z"`,
   * rồi `"AA"`, `"AB"`, ... — giống đánh cột bảng tính. Board đầu tiên luôn là `"A"`.
   *
   * Các board phải liên tục từ `"A"` (không skip, không trùng): 1 board → `["A"]`,
   * 3 board → `["A","B","C"]`. Số board tối đa mỗi vé do cấu hình game quyết định
   * (`maxBasicBoardsPerTicket`), không cố định 6.
   */
  boardNo: string;
  /**
   * Loại cược.
   *
   * Board cơ bản:
   * - `"singleNum"` — đoán 1 số xuất hiện ×1/×2/×3 lần
   * - `"doubleMatch"` — đoán số được chỉ định xuất hiện ≥2 lần
   * - `"tripleMatch"` — đoán cả 3 xúc xắc có cùng giá trị
   *
   * Board cược bổ sung:
   * - `"sumTotal"` — đoán tổng 3 xúc xắc bằng đúng 1 giá trị (3-18)
   * - `"bigSmallDraw"` — đoán Tài (11-18) / Xỉu (3-8) / Hoà (9-10)
   */
  playType: "singleNum" | "doubleMatch" | "tripleMatch" | "sumTotal" | "bigSmallDraw";
  /**
   * Số xúc xắc muốn đoán (1-6).
   * - Bắt buộc khi `playType = "singleNum"` hoặc `"doubleMatch"`
   * - Bắt buộc khi `playType = "tripleMatch"` và `tripleKind = "specific"`
   * - Bỏ qua cho các loại cược khác
   */
  number?: number;
  /**
   * Dạng bộ ba — chỉ dùng khi `playType = "tripleMatch"`.
   * - `"specific"` — 3 xúc xắc đều bằng `number`
   * - `"any"` — 3 xúc xắc đều bằng nhau (bất kỳ giá trị nào)
   */
  tripleKind?: Bingo18TripleKind;
  /**
   * Giá trị tổng cần đoán (3-18).
   * Bắt buộc khi `playType = "sumTotal"`, bỏ qua với các loại khác.
   */
  sum?: number;
  /**
   * Lựa chọn Tài/Xỉu/Hoà.
   * Bắt buộc khi `playType = "bigSmallDraw"`, bỏ qua với các loại khác.
   * - `"big"` — Tài (tổng 11-18)
   * - `"small"` — Xỉu (tổng 3-8)
   * - `"draw"` — Hoà (tổng 9-10)
   */
  bet?: Bingo18BigSmallBet;
  /**
   * Số lần cược nhân bội cho board này (≥ minBetCount, ≤ maxBetCount).
   *
   * Mặc định = 1. Tiền cược board = betCount × unitPrice.
   */
  betCount?: number;
}

/**
 * Input mua vé Bingo 18.
 *
 * Gửi lên `POST /games/bingo18/bets` qua `client.bingo18.placeBet()`.
 *
 * Phải có ít nhất 1 board. Board bao gồm cả cược cơ bản lẫn cược bổ sung.
 * Mỗi vé áp dụng cho 1 hoặc nhiều kỳ quay liên tiếp (tối đa 20 kỳ).
 *
 * @example
 * ```ts
 * import type { Bingo18TicketPurchaseInput } from "@megawin/player-sdk/bingo18";
 *
 * // Cược cơ bản 1 kỳ + cược bổ sung
 * const input: Bingo18TicketPurchaseInput = {
 *   drawIds: ["2026-03-07.001"],
 *   boards: [
 *     { boardNo: "A", playType: "singleNum", number: 5 },
 *     { boardNo: "B", playType: "bigSmallDraw", bet: "big" },
 *   ],
 * };
 *
 * // Cược nhiều kỳ + nhiều loại board
 * const input2: Bingo18TicketPurchaseInput = {
 *   drawIds: ["2026-03-07.001", "2026-03-07.002", "2026-03-07.003"],
 *   boards: [
 *     { boardNo: "A", playType: "singleNum", number: 3 },
 *     { boardNo: "B", playType: "tripleMatch", tripleKind: "any" },
 *     { boardNo: "C", playType: "sumTotal", sum: 14 },
 *     { boardNo: "D", playType: "bigSmallDraw", bet: "small" },
 *   ],
 * };
 * ```
 */
export interface Bingo18TicketPurchaseInput {
  /**
   * Danh sách drawId các kỳ quay tham gia.
   *
   * - Format mỗi ID: `YYYY-MM-DD.NNN` (VD: `"2026-03-07.001"`)
   * - Tối thiểu 1, tối đa 20 kỳ
   * - Không được trùng lặp
   */
  drawIds: string[];
  /**
   * Danh sách boards cược — bao gồm cả cơ bản và cược bổ sung.
   *
   * - Tối thiểu 1 board; số tối đa theo cấu hình game (`maxBasicBoardsPerTicket`)
   * - `boardNo` sinh tự động, liên tục từ `"A"` (A, B, C... Z, AA...), không trùng
   */
  boards: Bingo18BoardInput[];
}

// ─────────────────────────────────────────────
// Response Types — Game Config
// ─────────────────────────────────────────────

/**
 * Cấu hình game chung của Bingo 18.
 *
 * Trả về trong `Bingo18GameConfigResponse.game`.
 */
export interface Bingo18GameRules {
  /** Giá 1 đơn vị cược (VND). Mỗi board hoặc side bet tính là 1 đơn vị. */
  unitPrice: number;
  /** Số lượng board cơ bản tối đa trên 1 vé. */
  maxBasicBoardsPerTicket: number;
  /** Số kỳ quay tối đa có thể mua trước trên 1 vé. */
  maxDrawCount: number;
  /** Khoảng cách giữa 2 kỳ quay liên tiếp (phút). */
  drawIntervalMinutes: number;
  /** Giờ quay đầu tiên trong ngày. VD: `"06:00"`. */
  firstDrawTime: string;
  /** Giờ quay cuối cùng trong ngày. VD: `"23:54"`. */
  lastDrawTime: string;
  /** Số lần cược tối thiểu cho 1 board/side bet. */
  minBetCount: number;
  /** Số lần cược tối đa cho 1 board/side bet. */
  maxBetCount: number;
}

/**
 * Cơ cấu giải thưởng loại cược `singleNum`.
 *
 * Giải thưởng tuỳ theo số lần số đó xuất hiện trong 3 xúc xắc.
 */
export interface Bingo18SingleNumPrizesConfig {
  /** Thưởng khi số xuất hiện đúng 1 lần trong 3 xúc xắc (VND). */
  match1: number;
  /** Thưởng khi số xuất hiện đúng 2 lần trong 3 xúc xắc (VND). */
  match2: number;
  /** Thưởng khi số xuất hiện đúng 3 lần trong 3 xúc xắc (VND). */
  match3: number;
}

/**
 * Cơ cấu giải thưởng loại cược `doubleMatch`.
 *
 * Thắng khi ít nhất 2 trong 3 xúc xắc có cùng giá trị với số đã chọn.
 */
export interface Bingo18DoubleMatchPrizesConfig {
  /** Thưởng khi trúng doubleMatch (VND). */
  win: number;
}

/**
 * Cơ cấu giải thưởng loại cược `tripleMatch`.
 *
 * Thắng khi cả 3 xúc xắc có cùng giá trị.
 */
export interface Bingo18TripleMatchPrizesConfig {
  /** Thưởng khi trúng `tripleMatch` loại chỉ định số cụ thể (VND). */
  specific: number;
  /** Thưởng khi trúng `tripleMatch` loại bất kỳ (VND). */
  any: number;
}

/** Key: tổng dưới dạng string (e.g. "3", "18") → tiền thưởng (VND). Dùng string vì MongoDB serialize key thành string. */
export type Bingo18SumTotalPrizesConfig = Record<string, number>;

/**
 * Cơ cấu giải thưởng loại side bet `bigSmallDraw`.
 *
 * Dựa trên tổng 3 xúc xắc: Tài (11-18), Hoà (9-10), Xỉu (3-8).
 */
export interface Bingo18BigSmallDrawPrizesConfig {
  /** Thưởng khi đoán đúng Tài (tổng 11-18) (VND). */
  big: number;
  /** Thưởng khi đoán đúng Hoà (tổng 9-10) (VND). */
  draw: number;
  /** Thưởng khi đoán đúng Xỉu (tổng 3-8) (VND). */
  small: number;
}

/**
 * Toàn bộ cơ cấu giải thưởng của game Bingo 18.
 *
 * Trả về trong `Bingo18GameConfigResponse.prizes`.
 */
export interface Bingo18PrizesConfig {
  /** Giải thưởng cho loại cược đoán số đơn (1×/2×/3×). */
  singleNum: Bingo18SingleNumPrizesConfig;
  /** Giải thưởng cho loại cược bộ đôi. */
  doubleMatch: Bingo18DoubleMatchPrizesConfig;
  /** Giải thưởng cho loại cược bộ ba. */
  tripleMatch: Bingo18TripleMatchPrizesConfig;
  /** Giải thưởng cho loại side bet đoán tổng (key: giá trị tổng 3-18). */
  sumTotal: Bingo18SumTotalPrizesConfig;
  /** Giải thưởng cho loại side bet Tài/Xỉu/Hoà. */
  bigSmallDraw: Bingo18BigSmallDrawPrizesConfig;
}

/**
 * Cấu hình tenant cho game Bingo 18.
 *
 * Trả về trong `Bingo18GameConfigResponse.tenant`.
 */
export interface Bingo18TenantConfig {
  /** `true` nếu game Bingo 18 đang được bật cho tenant này. */
  isEnabled: boolean;
}

/**
 * Response từ `GET /games/bingo18/config`.
 *
 * Trả về bởi `client.bingo18.getGameConfig()`.
 *
 * @example
 * ```ts
 * const config = await client.bingo18.getGameConfig();
 * console.log(config.game.unitPrice);             // 10000
 * console.log(config.game.drawIntervalMinutes);   // 6
 * console.log(config.prizes.singleNum.match3);    // tiền thưởng ×3
 * console.log(config.prizes.bigSmallDraw.draw);   // tiền thưởng Hoà
 * ```
 */
export interface Bingo18GameConfigResponse {
  /** Quy tắc và thông số game (giá vé, thời gian, số kỳ tối đa). */
  game: Bingo18GameRules;
  /** Cơ cấu giải thưởng cho tất cả loại cược. */
  prizes: Bingo18PrizesConfig;
  /** Trạng thái bật/tắt game của tenant hiện tại. */
  tenant: Bingo18TenantConfig;
}

// ─────────────────────────────────────────────
// Response Types — Draw / Ticket
// ─────────────────────────────────────────────

/**
 * Thông tin 1 kỳ quay Bingo 18.
 *
 * Dùng trong {@link Bingo18CurrentDrawResponse} để hiển thị kỳ quay đang mở bán.
 */
export interface Bingo18DrawInfo {
  /** ID kỳ quay. Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.095"`. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). VD: `"2026-03-07"`. */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày (1-based). Bingo 18 có ~240 kỳ/ngày. */
  drawNo: number;
  /** Giờ quay. VD: `"10:06"`. */
  drawTime: string;
  /**
   * Trạng thái kỳ quay.
   * - `"openSales"` — đang mở bán
   * - `"closedSales"` — đã đóng bán, chờ quay
   * - `"published"` — đã công bố kết quả
   */
  status: string;
  /** Thông tin thời gian mở/đóng bán vé. */
  sales: {
    /** Thời điểm mở bán (ISO 8601). `undefined` nếu chưa mở. */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
}

// ─────────────────────────────────────────────
// Response Types — Draw Results
// ─────────────────────────────────────────────

/**
 * Thông tin giải thưởng 1 loại cược trong kỳ quay Bingo 18 (unified).
 *
 * Bao gồm cả loại board cơ bản (singleNum, doubleMatch, tripleMatch)
 * và cược bổ sung (sumTotal, bigSmallDraw).
 *
 * - Board cơ bản: `matchCount` + `tripleKind` xác định giải.
 * - Cược bổ sung sumTotal: `sum` xác định giá trị tổng trúng.
 * - Cược bổ sung bigSmallDraw: `bet` xác định lựa chọn trúng.
 */
export interface Bingo18DrawPrize {
  /**
   * Loại cược.
   * - `"singleNum"` | `"doubleMatch"` | `"tripleMatch"` (board cơ bản)
   * - `"sumTotal"` | `"bigSmallDraw"` (cược bổ sung)
   */
  playType: string;
  /**
   * Số lần trùng (0-3). Meaningful cho board cơ bản:
   * - `singleNum`: 1, 2, hoặc 3 lần số đó xuất hiện
   * - `doubleMatch`: 2 hoặc 3 khi trúng
   * - `tripleMatch`: 3 khi trúng
   *
   * Board cược bổ sung (sumTotal/bigSmallDraw): `null` — field không áp dụng.
   */
  matchCount: number | null;
  /**
   * Dạng bộ ba (chỉ có khi `playType = "tripleMatch"`).
   * - `"specific"` — chỉ định cụ thể bộ ba (VD: ba số 5)
   * - `"any"` — bất kỳ bộ ba nào
   */
  tripleKind?: Bingo18TripleKind;
  /**
   * Giá trị tổng trúng (chỉ có khi `playType = "sumTotal"`).
   * Range 3-18.
   */
  sum?: number;
  /**
   * Loại cược Tài/Xỉu/Hoà trúng (chỉ có khi `playType = "bigSmallDraw"`).
   * - `"big"` — Tài (tổng 11-18)
   * - `"small"` — Xỉu (tổng 3-8)
   * - `"draw"` — Hoà (tổng 9-10)
   */
  bet?: Bingo18BigSmallBet;
  /** Tổng số lượt cược trúng loại này trong kỳ. */
  winnerCount: number;
  /** Tiền thưởng cho 1 đơn vị cược trúng (VND). */
  prizePerUnit: number;
}

/**
 * Tóm tắt kết quả 1 kỳ quay Bingo 18 (dùng trong danh sách).
 *
 * Trả về bởi `client.bingo18.listDrawResults()`.
 *
 * @example
 * ```ts
 * const { draws } = await client.bingo18.listDrawResults({ size: 20 });
 * for (const draw of draws) {
 *   console.log(`[${draw.drawId}] Số: ${draw.result.numbers.join(", ")} | Tổng: ${draw.result.sum}`);
 * }
 * ```
 */
export interface Bingo18DrawResultSummary {
  /** ID kỳ quay. Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.095"`. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự trong ngày (1-based, tối đa ~240 kỳ/ngày). */
  drawNo: number;
  /** Giờ quay. VD: `"10:06"`. */
  drawTime: string;
  /** Kết quả 3 xúc xắc. */
  result: {
    /**
     * 3 giá trị xúc xắc (mỗi giá trị 1-6).
     * VD: `[3, 5, 6]`.
     */
    numbers: number[];
    /**
     * Tổng 3 xúc xắc (3-18).
     * VD: `14`.
     */
    sum: number;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Tham chiếu kỳ quay Vietlott. `undefined` nếu không liên kết. */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

/**
 * Chi tiết đầy đủ kết quả 1 kỳ quay Bingo 18.
 *
 * Bảng giải thưởng thống nhất `prizes` chứa cả giải board cơ bản và cược bổ sung.
 *
 * Trả về bởi `client.bingo18.getDrawResult(drawId)`.
 *
 * @example
 * ```ts
 * const draw = await client.bingo18.getDrawResult("2026-03-07.095");
 * console.log(`Số: ${draw.result.numbers.join(", ")} | Tổng: ${draw.result.sum}`);
 *
 * for (const prize of draw.prizes) {
 *   if (prize.sum !== undefined) {
 *     console.log(`  sumTotal (tổng ${prize.sum}): ${prize.winnerCount} lượt trúng`);
 *   } else if (prize.bet) {
 *     console.log(`  bigSmallDraw (${prize.bet}): ${prize.winnerCount} lượt trúng`);
 *   } else {
 *     console.log(`  ${prize.playType} x${prize.matchCount}: ${prize.winnerCount} lượt, ${prize.prizePerUnit.toLocaleString()} VND/lượt`);
 *   }
 * }
 * ```
 */
export interface Bingo18DrawResultInfo {
  /** ID kỳ quay. Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.095"`. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự trong ngày (1-based). */
  drawNo: number;
  /** Giờ quay. VD: `"10:06"`. */
  drawTime: string;
  /** Kết quả 3 xúc xắc. */
  result: {
    /**
     * 3 giá trị xúc xắc (mỗi giá trị 1-6).
     * VD: `[3, 5, 6]`.
     */
    numbers: number[];
    /**
     * Tổng 3 xúc xắc (3-18).
     * VD: `14`.
     */
    sum: number;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /**
   * Bảng giải thưởng thống nhất — chứa cả giải board cơ bản và cược bổ sung.
   * Gồm: singleNum (×1/2/3), doubleMatch, tripleMatch, sumTotal, bigSmallDraw.
   */
  prizes: Bingo18DrawPrize[];
  /** Tham chiếu kỳ quay Vietlott. `undefined` nếu không liên kết. */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

/**
 * Tóm tắt vé Bingo 18 cho UI.
 *
 * Trả về bởi `client.bingo18.listPendingTickets()` và `client.bingo18.listTickets()`.
 *
 * @example
 * ```ts
 * const { tickets } = await client.bingo18.listPendingTickets();
 * for (const ticket of tickets) {
 *   const voided = ticket.voidSummary?.voidedDrawCount ?? 0;
 *   console.log(`${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ (${voided} void)`);
 *   if (ticket.voidSummary) {
 *     console.log(`Đã hoàn: ${ticket.voidSummary.totalRefundedAmount} VND`);
 *   }
 * }
 * ```
 */
export interface Bingo18TicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. VD: `"B18-20260307-00007"`. */
  ticketNo: string;
  /**
   * Trạng thái vé.
   * - `"pending"` — đang chờ kết quả
   * - `"completed"` — đã hoàn tất tất cả kỳ
   * - `"voided"` — một hoặc nhiều kỳ đã bị huỷ
   */
  status: string;
  /** Kế hoạch kỳ quay. */
  drawPlan: {
    /** Danh sách drawId các kỳ quay. Format `YYYY-MM-DD.NNN`. */
    drawIds: string[];
    /** Tổng số kỳ quay của vé. */
    drawCount: number;
  };
  /** Thông tin giá cược. */
  pricing: {
    /** Giá 1 đơn vị cược (VND). */
    unitPrice: number;
    /** Số selections mỗi kỳ = boards.length. */
    selectionsPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(board.betCount). */
    betUnitsPerDraw: number;
    /** Tiền cược mỗi kỳ quay (VND). Bằng `betUnitsPerDraw × unitPrice`. */
    amountPerDraw: number;
    /** Tổng tiền cược của cả vé (VND). Bằng `amountPerDraw × drawCount`. */
    totalAmount: number;
  };
  /** Danh sách boards cược (bao gồm cả cơ bản và cược bổ sung). */
  boards: Array<{
    /** Ký hiệu board: `"A"` - `"F"`. */
    boardNo: string;
    /**
     * Loại cược.
     * - Board cơ bản: `"singleNum"` | `"doubleMatch"` | `"tripleMatch"`
     * - Cược bổ sung: `"sumTotal"` | `"bigSmallDraw"`
     */
    playType: string;
    /** Số xúc xắc được chọn (1-6). Có khi `playType` là `"singleNum"` hoặc `"doubleMatch"`, hoặc `"tripleMatch"` + `"specific"`. */
    number?: number;
    /**
     * Dạng bộ ba (chỉ có khi `playType = "tripleMatch"`).
     * - `"specific"` | `"any"`
     */
    tripleKind?: string;
    /** Giá trị tổng đặt cược (3-18). Chỉ có khi `playType = "sumTotal"`. */
    sum?: number;
    /**
     * Lựa chọn Tài/Xỉu/Hoà. Chỉ có khi `playType = "bigSmallDraw"`.
     * - `"big"` | `"small"` | `"draw"`
     */
    bet?: string;
    /** Số lần cược nhân bội (≥ 1). Tiền = betCount × unitPrice. */
    betCount: number;
  }>;
  /**
   * Tiến độ settle.
   * `settledDraws` = số kỳ đã xử lý xong (settled + voided).
   */
  progress: {
    /** Tổng số kỳ quay của vé. */
    totalDraws: number;
    /** Số kỳ đã xử lý xong (settled hoặc voided). */
    settledDraws: number;
  };
  /** Tổng kết trả thưởng. `undefined` nếu chưa có kỳ nào settle. */
  settlement?: {
    /** Tổng tiền thắng của tất cả kỳ đã settle (VND). */
    totalWinAmount: number;
    /** Thời điểm settle gần nhất (ISO 8601). */
    lastSettledAt?: string;
  };
  /**
   * Tóm tắt huỷ cược. `undefined` nếu không có kỳ nào bị void.
   */
  voidSummary?: {
    /** Tổng tiền cược của các kỳ bị huỷ (VND). */
    totalVoidedAmount: number;
    /** Tổng tiền đã hoàn trả (VND). */
    totalRefundedAmount: number;
    /** Số kỳ quay bị huỷ. */
    voidedDrawCount: number;
    /** Danh sách drawId các kỳ bị huỷ. Format `YYYY-MM-DD.NNN`. */
    voidedDrawIds: string[];
    /** Thời điểm void gần nhất (ISO 8601). */
    lastVoidedAt?: string;
  };
  /** Thời điểm mua vé (ISO 8601). */
  createdAt: string;
}

// ─────────────────────────────────────────────
// Response Types — Entry (chi tiết vé theo kỳ)
// ─────────────────────────────────────────────

/**
 * Chi tiết entry (vé 1 kỳ quay) cho UI.
 *
 * Mỗi entry đại diện cho 1 kỳ quay trong vé Bingo 18.
 *
 * @example
 * ```ts
 * const { entries } = await client.bingo18.getTicketEntries("65abc123...");
 * for (const entry of entries) {
 *   console.log(`Kỳ ${entry.drawId}: ${entry.status}`);
 *   if (entry.payout) {
 *     console.log(`Thắng: ${entry.payout.winAmount} VND`);
 *   }
 * }
 * ```
 */
export interface Bingo18EntryInfo {
  /** ID entry trong hệ thống. */
  id: string;
  /** ID kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Trạng thái entry. */
  status: string;
  /** Tổng tiền đặt cược của entry (VND) = betUnitCount × unitPrice. */
  amount: number;
  /** Mệnh giá 1 lần tham gia dự thưởng (VND). */
  unitPrice: number;
  /** Số lượng cược (selections) = boards.length. Không tính multiplier. */
  selectionCount: number;
  /** Tổng đơn vị cược = Σ(board.betCount). amount = betUnitCount × unitPrice. */
  betUnitCount: number;

  /** Tóm tắt nội dung đặt cược. */
  entrySummary: {
    /** Mã vé. VD: `"B18-20260307-00001"`. */
    ticketNo: string;
    /** Danh sách boards cược (bao gồm cả cơ bản và cược bổ sung). */
    boards: Array<{
      /** Ký hiệu board: `"A"` - `"F"`. */
      boardNo: string;
      /** Loại cược. */
      playType: string;
      /** Số xúc xắc được chọn (1-6). Chỉ có cho board cơ bản. */
      number?: number;
      /** Dạng bộ ba. Chỉ có khi `playType = "tripleMatch"`. */
      tripleKind?: string;
      /** Giá trị tổng đặt cược (3-18). Chỉ có khi `playType = "sumTotal"`. */
      sum?: number;
      /** Lựa chọn Tài/Xỉu/Hoà. Chỉ có khi `playType = "bigSmallDraw"`. */
      bet?: string;
      /** Số lần cược nhân bội cho board này. Tiền = betCount × unitPrice. */
      betCount: number;
    }>;
  };

  /** Kết quả kỳ quay. `undefined` nếu chưa quay. */
  result?: {
    /** 3 giá trị xúc xắc (mỗi giá trị 1-6). */
    numbers: number[];
    /** Tổng 3 xúc xắc (3-18). */
    sum: number;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Kết quả thắng/thua. `undefined` nếu chưa settle. */
  outcome?: string;
  /** Chi tiết trả thưởng. `undefined` nếu chưa settle. */
  payout?: {
    /** Tổng tiền thắng kỳ này (VND). */
    winAmount: number;
    /** Tổng tiền trả thưởng (VND). */
    payoutAmount: number;
    /** Kết quả từng board (bao gồm cả cơ bản và cược bổ sung). */
    boardPayouts: Array<{
      /** Ký hiệu board: `"A"` - `"F"`. */
      boardNo: string;
      /** Loại cược. */
      playType: string;
      /**
       * Số lần số đã chọn xuất hiện trong kết quả (0-3). Meaningful cho board cơ bản.
       * Board cược bổ sung (sumTotal/bigSmallDraw): `null` — field không áp dụng.
       */
      matchCount: number | null;
      /** Giá trị tổng. Chỉ có khi `playType = "sumTotal"`. */
      sum?: number;
      /** Lựa chọn cược. Chỉ có khi `playType = "bigSmallDraw"`. */
      bet?: string;
      /** Kết quả thực tế. Chỉ có cho board cược bổ sung. */
      outcome?: string;
      /** Thắng hay thua. Set cho tất cả play types. */
      isWin: boolean;
      /** Tiền thưởng board này (VND). `0` nếu thua. */
      winAmount: number;
    }>;
  };
}

/**
 * Response từ `GET /games/bingo18/tickets/{ticketId}/entries`.
 */
export interface Bingo18TicketEntriesResponse {
  /** Danh sách entries theo kỳ quay. */
  entries: Bingo18EntryInfo[];
}

// ─────────────────────────────────────────────
// Response Types — Place Bet
// ─────────────────────────────────────────────

/**
 * Response khi đặt cược Bingo 18 thành công.
 *
 * Trả về từ `POST /games/bingo18/bets` qua `client.bingo18.placeBet()`.
 *
 * @example
 * ```ts
 * const result = await client.bingo18.placeBet({
 *   drawIds: ["2026-03-07.001"],
 *   boards: [
 *     { boardNo: "A", playType: "singleNum", number: 5, betCount: 1 },
 *     { boardNo: "B", playType: "bigSmallDraw", bet: "big", betCount: 1 },
 *   ],
 * });
 * console.log(result.ticketId);            // "65abc..."
 * console.log(result.pricing.totalAmount); // 20000
 * console.log(result.balance);             // 980000
 * ```
 */
export interface Bingo18PlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. VD: `"B18-20260307-00001"`. */
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
    /** Đơn giá 1 bet (VND). */
    unitPrice: number;
    /** Số selections mỗi kỳ = boards.length. */
    selectionsPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(board.betCount). */
    betUnitsPerDraw: number;
    /** Tiền cược mỗi kỳ (VND) = betUnitsPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền cược toàn vé (VND). */
    totalAmount: number;
  };

  /** Số lượng boards trong vé (bao gồm cả cơ bản và cược bổ sung). */
  boardCount: number;
  /** Số lượng entries đã tạo (= số kỳ quay). */
  entryCount: number;
}

// ─────────────────────────────────────────────
// Response Types — List Tickets
// ─────────────────────────────────────────────

/**
 * Tham số phân trang cho danh sách vé Bingo 18 đang chờ.
 */
export interface Bingo18ListTicketsParams {
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
 * Response phân trang danh sách vé Bingo 18.
 */
export interface Bingo18ListTicketsResponse {
  /** Danh sách vé trang hiện tại. */
  tickets: Bingo18TicketSummary[];
  /** Cursor để lấy trang tiếp theo. `null` nếu không còn trang nào. */
  nextCursor: string | null;
  /** Số lượng vé yêu cầu (echo lại `size` từ request). */
  size: number;
}

/**
 * Tham số truy vấn danh sách kết quả kỳ quay Bingo 18.
 */
export interface Bingo18ListDrawResultsParams {
  /** Số kỳ mỗi trang (mặc định 20). */
  size?: number;
  /** Lọc từ ngày (ISO date `YYYY-MM-DD`, inclusive). Mặc định = hôm nay. */
  from?: string;
  /** Cursor cho trang tiếp theo. */
  cursor?: string;
}

/**
 * Response phân trang danh sách kết quả kỳ quay Bingo 18.
 */
export interface Bingo18ListDrawResultsResponse {
  /** Danh sách tóm tắt kỳ quay. */
  draws: Bingo18DrawResultSummary[];
  /** Cursor cho trang tiếp theo. `null` nếu hết. */
  nextCursor: string | null;
  /** Số lượng kỳ yêu cầu (echo lại size). */
  size: number;
}

/**
 * Response từ `GET /games/bingo18/draws/current`.
 */
export interface Bingo18CurrentDrawResponse {
  /** Kỳ quay đang mở bán gần nhất. `null` nếu không có kỳ nào mở. */
  currentDraw: Bingo18DrawInfo | null;
  /** Tất cả kỳ quay đang trong trạng thái active. */
  activeDraws: Bingo18DrawInfo[];
}

/**
 * Tham số phân trang cho danh sách vé Bingo 18 đang chờ xử lý.
 *
 * Cursor-based pagination. Không hỗ trợ lọc ngày — chỉ trả vé đang active.
 *
 * @example
 * ```ts
 * const page1 = await client.bingo18.listPendingTickets({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.bingo18.listPendingTickets({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Bingo18ListPendingTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
}

/**
 * Tham số lọc và phân trang cho lịch sử vé Bingo 18 (tất cả trạng thái).
 *
 * Hỗ trợ lọc theo khoảng ngày đặt cược (giờ Việt Nam).
 *
 * @example
 * ```ts
 * const march = await client.bingo18.listTickets({
 *   from: "2026-03-01",
 *   to: "2026-03-31",
 * });
 *
 * if (march.nextCursor) {
 *   const page2 = await client.bingo18.listTickets({
 *     size: 20,
 *     cursor: march.nextCursor,
 *   });
 * }
 * ```
 */
export interface Bingo18ListAllTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
  /** Lọc từ ngày đặt cược (YYYY-MM-DD). */
  from?: string;
  /** Lọc đến ngày đặt cược (YYYY-MM-DD). */
  to?: string;
}

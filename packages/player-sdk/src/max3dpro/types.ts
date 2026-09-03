/**
 * Max 3D Pro SDK – Public Types
 * @module
 */

import type { EntryOutcome, EntryStatus, TicketStatus } from "../common-types";

// ─────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────

/**
 * Board Max 3D Pro chế độ multiNumber.
 *
 * Chọn 3-20 bộ ba số, hệ thống tạo P(n,2) ordered pairs.
 *
 * @example
 * ```ts
 * const board: Max3dproMultiNumberBoardInput = {
 *   boardNo: "A",
 *   playMode: "multiNumber",
 *   playType: "straight",
 *   triplets: ["123", "456", "789"],
 * };
 * ```
 */
export interface Max3dproMultiNumberBoardInput {
  /**
   * Ký hiệu board trong vé, sinh tự động theo thứ tự chữ cái: `"A"`, `"B"`, ..., `"Z"`,
   * rồi `"AA"`, `"AB"`, ... — giống đánh cột bảng tính. Board đầu tiên luôn là `"A"`.
   *
   * Các board phải liên tục từ `"A"` (không skip, không trùng): 1 board → `["A"]`,
   * 3 board → `["A","B","C"]`. Số board tối đa mỗi vé do cấu hình game quyết định
   * (`maxBoardsPerTicket`), không cố định 4.
   */
  boardNo: string;
  /** Chế độ chơi, luôn là `"multiNumber"` cho interface này. */
  playMode: "multiNumber";
  /** Loại chơi. Luôn là `"straight"` cho Max 3D Pro. */
  playType: "straight";
  /**
   * Danh sách bộ ba số chọn (3-20 bộ).
   *
   * Mỗi bộ là chuỗi 3 chữ số VD: `"123"`, `"007"`.
   * Hệ thống tạo P(n,2) ordered pairs từ danh sách này.
   */
  triplets: string[];
  /**
   * Số lần cược nhân bội cho board này (≥ minBetCount, ≤ maxBetCount).
   *
   * Tiền cược board = lineCount × betCount × unitPrice. Mặc định = 1.
   */
  betCount?: number;
}

/**
 * Board Max 3D Pro chế độ multiDigit.
 *
 * Chọn đúng 3 chữ số đầu + 3 chữ số sau, hệ thống expand hoán vị.
 *
 * @example
 * ```ts
 * const board: Max3dproMultiDigitBoardInput = {
 *   boardNo: "B",
 *   playMode: "multiDigit",
 *   playType: "straight",
 *   frontDigits: [1, 2, 3],
 *   backDigits: [4, 5, 6],
 * };
 * ```
 */
export interface Max3dproMultiDigitBoardInput {
  /**
   * Ký hiệu board trong vé, sinh tự động theo thứ tự chữ cái: `"A"`, `"B"`, ..., `"Z"`,
   * rồi `"AA"`, `"AB"`, ... — giống đánh cột bảng tính. Board đầu tiên luôn là `"A"`.
   *
   * Các board phải liên tục từ `"A"` (không skip, không trùng): 1 board → `["A"]`,
   * 3 board → `["A","B","C"]`. Số board tối đa mỗi vé do cấu hình game quyết định
   * (`maxBoardsPerTicket`), không cố định 4.
   */
  boardNo: string;
  /** Chế độ chơi, luôn là `"multiDigit"` cho interface này. */
  playMode: "multiDigit";
  /** Loại chơi. Luôn là `"straight"` cho Max 3D Pro. */
  playType: "straight";
  /**
   * 3 chữ số phần đầu của bộ số (mỗi chữ số 0-9).
   *
   * Hệ thống tạo hoán vị từ 3 chữ số này cho phần đầu.
   */
  frontDigits: number[];
  /**
   * 3 chữ số phần sau của bộ số (mỗi chữ số 0-9).
   *
   * Hệ thống tạo hoán vị từ 3 chữ số này cho phần sau.
   */
  backDigits: number[];
  /**
   * Số lần cược nhân bội cho board này (≥ minBetCount, ≤ maxBetCount).
   *
   * Tiền cược board = lineCount × betCount × unitPrice. Mặc định = 1.
   */
  betCount?: number;
}

/**
 * Input cho 1 board khi mua vé Max 3D Pro.
 *
 * Là union của `Max3dproMultiNumberBoardInput` và `Max3dproMultiDigitBoardInput`,
 * phân biệt qua field `playMode`.
 */
export type Max3dproBoardInput = Max3dproMultiNumberBoardInput | Max3dproMultiDigitBoardInput;

/**
 * Input mua vé Max 3D Pro.
 *
 * Gửi lên `POST /games/max3dpro/bets` qua `client.max3dpro.placeBet()`.
 *
 * @example
 * ```ts
 * import type { Max3dproTicketPurchaseInput } from "@megawin/player-sdk/max3dpro";
 *
 * const input: Max3dproTicketPurchaseInput = {
 *   drawIds: ["2026-03-07.001", "2026-03-10.001"],
 *   boards: [
 *     {
 *       boardNo: "A",
 *       playMode: "multiNumber",
 *       playType: "straight",
 *       triplets: ["123", "456", "789"],
 *     },
 *     {
 *       boardNo: "B",
 *       playMode: "multiDigit",
 *       playType: "straight",
 *       frontDigits: [1, 2, 3],
 *       backDigits: [4, 5, 6],
 *     },
 *   ],
 * };
 * ```
 */
export interface Max3dproTicketPurchaseInput {
  /**
   * Danh sách drawId các kỳ quay tham gia.
   *
   * - Format mỗi ID: `YYYY-MM-DD.NNN` (VD: `"2026-03-07.001"`)
   * - Tối thiểu 1, tối đa 6 kỳ
   * - Không được trùng lặp
   */
  drawIds: string[];
  /**
   * Danh sách boards trong vé (tối thiểu 1). Các board phải liên tục từ `"A"`,
   * không skip, không trùng `boardNo`. Số board tối đa do cấu hình game quyết định
   * (`maxBoardsPerTicket`), không cố định 4.
   */
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
  /** Số lần cược tối thiểu cho 1 board. */
  minBetCount: number;
  /** Số lần cược tối đa cho 1 board. */
  maxBetCount: number;
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
 * Endpoint chỉ trả lines sau khi kỳ quay đã settle — `matchResult` luôn có mặt.
 */
export interface Max3dproLineInfo {
  /** Ký hiệu board chứa line này. VD: `"A"`, `"B"`. */
  boardNo: string;
  /** Vị trí line trong entry (0-based). Dùng làm cursor khi phân trang. */
  lineIndex: number;
  /**
   * Chế độ chơi.
   * - `"multiNumber"` — chọn N bộ ba, expand thành P(N,2) ordered pairs
   * - `"multiDigit"` — chọn chữ số riêng, expand thành tổ hợp hoán vị
   */
  playMode: string;
  /** Kiểu chơi. Max 3D Pro chỉ có `"straight"`. */
  playType: string;
  /**
   * 2 bộ ba số của line này (mỗi bộ là string `"000"`-`"999"`).
   * VD: `["123", "456"]`.
   */
  triplets: string[];
  /**
   * Số lần tham gia dự thưởng của line này (≥ 1).
   *
   * `winAmount = unitPrize × betCount`. UI hiển thị "×N" khi betCount > 1.
   */
  betCount: number;
  /**
   * Kết quả đối chiếu. Luôn có mặt — endpoint chỉ trả dữ liệu khi entry đã settled
   * (trả lỗi 400 trước đó nếu chưa), nên field này KHÔNG optional per-line.
   */
  matchResult: {
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
    drawPeriod: string;
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
    drawPeriod: string;
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
 *     const { voidedDrawCount, totalRefundedAmount } = ticket.voidSummary;
 *     console.log(`void ${voidedDrawCount} kỳ, hoàn: ${totalRefundedAmount.toLocaleString()} VND`);
 *   }
 * }
 * ```
 */
export interface Max3dproTicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. VD: `"M3DP-20260307-00004"`. */
  ticketNo: string;
  /**
   * Trạng thái vé — dùng chung cho tất cả game, xem {@link TicketStatus}:
   * - `"paid"` — Đã thanh toán, vé bị khoá (immutable), entries đã được tạo.
   * - `"completed"` — Tất cả kỳ quay trong vé đã xử lý xong (settled hoặc void), có ít nhất 1 kỳ
   *   settled.
   * - `"refunded"` — Đã hoàn tiền toàn bộ. Chỉ xảy ra khi TẤT CẢ kỳ quay trong vé đều bị huỷ
   *   (không kỳ nào settled).
   * - `"void"` — Vô hiệu hoá toàn bộ vé (gian lận, lỗi nghiêm trọng).
   */
  status: TicketStatus;
  /** Kế hoạch kỳ quay. */
  drawPlan: {
    drawIds: string[];
    drawCount: number;
  };
  /** Thông tin giá cược. */
  pricing: {
    unitPrice: number;
    /** Tổng pairs mỗi kỳ = Σ(board.lineCount). */
    linesPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(board.lineCount × board.betCount). */
    betUnitsPerDraw: number;
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
    /**
     * Số lần cược nhân bội (≥ 1).
     *
     * Tiền cược board = lineCount × betCount × unitPrice.
     */
    betCount: number;
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
   *
   * Max3D Pro void theo **entry (draw-level)**: khi 1 kỳ bị void,
   * tất cả entries thuộc kỳ đó bị void. Vé multi-draw hoàn tiền một phần
   * (chỉ kỳ bị void), single-draw hoàn toàn bộ → status = "refunded".
   */
  voidSummary?: {
    /** Tổng tiền cược gốc của các kỳ bị huỷ (VND). */
    totalVoidedAmount: number;
    /** Tổng tiền đã hoàn trả cho player (VND). */
    totalRefundedAmount: number;
    /** Số kỳ đã bị huỷ. */
    voidedDrawCount: number;
    /** Danh sách drawId của các kỳ đã bị huỷ. */
    voidedDrawIds: string[];
    /** Thời điểm kỳ gần nhất bị huỷ (ISO 8601). */
    lastVoidedAt?: string;
  };
  /** Thời điểm mua vé (ISO 8601). */
  createdAt: string;
}

// ─────────────────────────────────────────────
// Response Types — Entry (chi tiết vé theo kỳ)
// ─────────────────────────────────────────────

/**
 * Chi tiết entry (vé 1 kỳ quay) cho UI — Max 3D Pro.
 */
export interface Max3dproEntryResult {
  /** ID entry trong hệ thống. */
  id: string;
  /** ID kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Trạng thái entry — dùng chung cho tất cả game, xem {@link EntryStatus}. */
  status: EntryStatus;
  /** Tiền cược kỳ này (VND) = betUnitCount × unitPrice. */
  amount: number;
  /** Đơn giá 1 lần tham gia dự thưởng (VND). */
  unitPrice: number;
  /** Số pairs = Σ(board.lineCount) trong entry. */
  lineCount: number;
  /** Tổng đơn vị cược = Σ(board.lineCount × board.betCount). amount = betUnitCount × unitPrice. */
  betUnitCount: number;

  /** Kết quả quay. `undefined` nếu chưa quay. */
  result?: {
    special: string[];
    first: string[];
    second: string[];
    third: string[];
    publishedAt: string;
  };

  /**
   * Kết quả tổng của entry sau settle — dùng chung cho tất cả game, xem {@link EntryOutcome}:
   * - `"win"` — có ít nhất 1 hạng giải trúng.
   * - `"loss"` — không trúng giải nào.
   * - `"void"` — kỳ quay bị huỷ, entry vô hiệu, tiền cược được hoàn lại.
   *
   * `undefined` nếu chưa settle.
   */
  outcome?: EntryOutcome;

  /** Chi tiết trả thưởng. `undefined` nếu chưa settle. */
  payout?: {
    /** Tổng tiền thắng kỳ này (VND). */
    winAmount: number;
    /** Tổng tiền nhận được (VND). Thường = winAmount trừ thuế nếu có. */
    payoutAmount: number;
    /** Chi tiết theo từng tier trúng. */
    tiers: Array<{
      /**
       * Hạng giải trúng.
       * `"special"` | `"specialSub"` | `"first"` | `"second"` | `"third"` |
       * `"fourth"` | `"fifth"` | `"sixth"`.
       */
      tier: string;
      /** Số lượt trúng hạng này (số pairs). */
      hitCount: number;
      /** Tiền thưởng 1 lượt của hạng giải này (VND). */
      unitAmount: number;
      /** Tổng tiền thưởng hạng này = hitCount × unitAmount (VND). */
      amount: number;
    }>;
  };
}

// ─────────────────────────────────────────────
// Response Types — Place Bet
// ─────────────────────────────────────────────

/**
 * Response khi đặt cược Max 3D Pro thành công.
 *
 * Trả về từ `POST /games/max3dpro/bets` qua `client.max3dpro.placeBet()`.
 */
export interface Max3dproPlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. VD: `"M3DP-20260307-00004"`. */
  ticketNo: string;
  /**
   * Trạng thái vé sau khi tạo — dùng chung cho tất cả game, xem {@link TicketStatus}. Ngay sau
   * khi đặt cược thành công luôn là `"paid"`; các giá trị khác (`"refunded"`, `"void"`,
   * `"completed"`) chỉ xuất hiện sau đó khi tra cứu lại vé qua
   * `listTickets`/`listPendingTickets`/`getTicketEntries`.
   */
  status: TicketStatus;
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
    /** Đơn giá 1 lần tham gia dự thưởng (VND). */
    unitPrice: number;
    /** Tổng pairs mỗi kỳ = Σ(board.lineCount). */
    linesPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(board.lineCount × board.betCount). */
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
 * Tham số phân trang cho danh sách vé Max 3D Pro đang chờ xử lý.
 *
 * Cursor-based pagination. Không hỗ trợ lọc ngày — chỉ trả vé đang active.
 *
 * @example
 * ```ts
 * const page1 = await client.max3dpro.listPendingTickets({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.max3dpro.listPendingTickets({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Max3dproListPendingTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
}

/**
 * Tham số lọc và phân trang cho lịch sử vé Max 3D Pro (tất cả trạng thái).
 *
 * Hỗ trợ lọc theo khoảng ngày đặt cược (giờ Việt Nam).
 *
 * @example
 * ```ts
 * const march = await client.max3dpro.listTickets({
 *   from: "2026-03-01",
 *   to: "2026-03-31",
 * });
 *
 * if (march.nextCursor) {
 *   const page2 = await client.max3dpro.listTickets({
 *     size: 20,
 *     cursor: march.nextCursor,
 *   });
 * }
 * ```
 */
export interface Max3dproListAllTicketsParams {
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
 * Tham số phân trang cho danh sách kết quả kỳ quay Max 3D Pro.
 *
 * @example
 * ```ts
 * const page1 = await client.max3dpro.listDrawResults({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.max3dpro.listDrawResults({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Max3dproListDrawResultsParams {
  /** Số lượng kỳ mỗi trang (mặc định 20). */
  size?: number;
  /**
   * Lọc kết quả từ ngày này trở về quá khứ (YYYY-MM-DD).
   * Mặc định: ngày hôm nay (giờ Việt Nam).
   */
  from?: string;
  /**
   * Cursor cho trang tiếp theo.
   * Là drawId của kỳ cuối cùng trong trang trước. Format `YYYY-MM-DD.NNN`.
   */
  cursor?: string;
}

/**
 * Tham số phân trang cho lines của một entry Max 3D Pro.
 */
export interface Max3dproEntryLinesParams {
  /** Số lượng lines mỗi trang (mặc định 50). */
  size?: number;
  /**
   * Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước).
   * Là `lineIndex` (integer) của line cuối trang trước.
   */
  cursor?: number;
}

/**
 * Thông tin kỳ quay Max 3D Pro hiện tại.
 *
 * Trả về bởi `client.max3dpro.getCurrentDraw()`.
 */
export interface Max3dproCurrentDrawResponse {
  /** Kỳ quay đang mở bán, hoặc `null` nếu chưa có. */
  currentDraw: Max3dproDrawInfo | null;
  /** Tất cả kỳ quay đang active. */
  activeDraws: Max3dproDrawInfo[];
}

/**
 * Danh sách vé Max 3D Pro (cursor-based).
 *
 * Trả về bởi `client.max3dpro.listPendingTickets()` và `client.max3dpro.listTickets()`.
 */
export interface Max3dproListTicketsResponse {
  /** Danh sách vé trong trang hiện tại. */
  tickets: Max3dproTicketSummary[];
  /** Cursor để lấy trang tiếp theo, `null` nếu đã hết. */
  nextCursor: string | null;
  /** Số vé thực tế trả về. */
  size: number;
}

/**
 * Chi tiết các lần tham gia kỳ quay của vé Max 3D Pro.
 *
 * Trả về bởi `client.max3dpro.getTicketEntries()`.
 */
export interface Max3dproTicketEntriesResponse {
  /** Danh sách entries (1 entry = 1 kỳ quay). */
  entries: Max3dproEntryResult[];
}

/**
 * Danh sách lines chi tiết của một entry Max 3D Pro (cursor-based).
 *
 * Trả về bởi `client.max3dpro.getEntryLines()`.
 *
 * Mỗi line là 1 cặp bộ ba số, được expand từ multiNumber hoặc multiDigit input.
 * Pagination dùng integer line index làm cursor.
 *
 * @example
 * ```ts
 * const { lines, nextCursor } = await client.max3dpro.getEntryLines("entry-abc...", { size: 50 });
 * for (const line of lines) {
 *   console.log(`[${line.boardNo}][${line.playMode}]: ${line.triplets.join(" + ")}`);
 *   if (line.matchResult.tiers.length > 0) {
 *     const tierNames = line.matchResult.tiers.map(t => t.tier).join(" + ");
 *     console.log(`  Giải: ${tierNames}, tổng thưởng: ${line.matchResult.winAmount} VND`);
 *   } else {
 *     console.log("  Không trúng");
 *   }
 * }
 * ```
 */
export interface Max3dproEntryLinesResponse {
  /** ID entry. */
  entryId: string;
  /**
   * ID kỳ quay mà entry này tham gia.
   * Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.001"`.
   */
  drawId: string;
  /** Danh sách lines trong trang hiện tại. */
  lines: Max3dproLineInfo[];
  /**
   * Cursor để lấy trang tiếp theo, `null` nếu đã hết.
   * Là `lineIndex` của line cuối trong trang này (integer).
   */
  nextCursor: number | null;
  /** Số lines thực tế trả về trong trang này. */
  size: number;
}

/**
 * Danh sách kết quả kỳ quay Max 3D Pro (cursor-based).
 *
 * Trả về bởi `client.max3dpro.listDrawResults()`.
 */
export interface Max3dproListDrawResultsResponse {
  /** Danh sách kết quả kỳ quay trong trang hiện tại. */
  draws: Max3dproDrawResultSummary[];
  /**
   * Cursor để lấy trang tiếp theo, `null` nếu đã hết.
   * Là `drawId` của kỳ cuối cùng trong trang này. Format `YYYY-MM-DD.NNN`.
   */
  nextCursor: string | null;
  /** Số kỳ quay thực tế trả về. */
  size: number;
}

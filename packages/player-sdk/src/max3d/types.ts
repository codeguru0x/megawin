/**
 * Max 3D SDK – Public Types
 * @module
 */

import type { EntryOutcome, EntryStatus, TicketStatus } from "../common-types";
import type { Max3dPlayMode, Max3dPlayType } from "./enums";

// ─────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────

export interface Max3dBoardInput {
  /**
   * Ký hiệu board — nhãn dạng cột spreadsheet: `"A"`, `"B"`, …, `"Z"`, `"AA"`, `"AB"`, …
   *
   * Các board phải liên tục từ `"A"` (không skip, không trùng): 1 board → `["A"]`,
   * 3 board → `["A","B","C"]`. Số board tối đa mỗi vé do cấu hình game quyết định
   * (`maxBoardsPerTicket`), không cố định 4.
   */
  boardNo: string;
  playMode: Max3dPlayMode;
  playType: Max3dPlayType;
  /** 1 bộ ba số cho basic, 2 bộ ba số cho plus. */
  triplets: string[];
  /**
   * Số lần cược nhân bội cho board này (≥ minBetCount, ≤ maxBetCount).
   *
   * Tiền cược board = lineCount × betCount × unitPrice.
   * Tiền thưởng cũng nhân theo betCount. Mặc định = 1.
   */
  betCount?: number;
}

/**
 * Input mua vé Max 3D.
 *
 * Gửi lên `POST /games/max3d/bets` qua `client.max3d.placeBet()`.
 *
 * @example
 * ```ts
 * import type { Max3dTicketPurchaseInput } from "@megawin/player-sdk/max3d";
 *
 * const input: Max3dTicketPurchaseInput = {
 *   drawIds: ["2026-03-07.001", "2026-03-10.001"],
 *   boards: [
 *     {
 *       boardNo: "A",
 *       playMode: "basic",
 *       playType: "straight",
 *       triplets: ["123"],
 *     },
 *   ],
 * };
 * ```
 */
export interface Max3dTicketPurchaseInput {
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
  /** Số lần cược tối thiểu cho 1 board. */
  minBetCount: number;
  /** Số lần cược tối đa cho 1 board. */
  maxBetCount: number;
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
   * - `"combo3"` — có 1 cặp số trùng (2 chữ số giống nhau) — sinh 3 hoán vị
   * - `"combo6"` — 3 chữ số khác nhau — sinh 6 hoán vị
   */
  playType: string;
  /**
   * Danh sách bộ ba số của line này.
   * Basic: 1 phần tử. Plus: 2 phần tử. Mỗi bộ ba là string 3 chữ số `"000"`-`"999"`.
   * VD: `["123"]` (basic) hoặc `["123", "456"]` (plus).
   */
  triplets: string[];
  /**
   * Số lần tham gia dự thưởng của line này (≥ 1). Snapshot từ `betCount` của board chứa line.
   * `matchResult.winAmount` đã nhân theo betCount này. UI hiển thị "×N" khi betCount > 1.
   */
  betCount: number;
  /** Kết quả đối chiếu. Chỉ có sau khi kỳ quay đã settle và entry ở trạng thái `"settled"`. */
  matchResult: {
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
    drawPeriod: string;
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
 * for (const prize of draw.basicPrizes) {
 *   console.log(`  ${prize.tier}: ${prize.winnerCount} người, ${prize.prizeAmount.toLocaleString()} VND`);
 * }
 * for (const prize of draw.plusPrizes) {
 *   console.log(`  Plus ${prize.tier}: ${prize.winnerCount} người, ${prize.prizeAmount.toLocaleString()} VND`);
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
   * Bảng trao giải cho cách chơi Cơ Bản (Basic).
   * 4 hạng: `special`, `first`, `second`, `third`.
   * Luôn đủ 4 phần tử, kể cả hạng không có người trúng (`winnerCount = 0`).
   */
  basicPrizes: Max3dDrawTierPrize[];
  /**
   * Bảng trao giải cho cách chơi Max 3D+ (Plus).
   * 7 hạng: `special`, `first`, `second`, `third`, `fourth`, `fifth`, `sixth`.
   * Luôn đủ 7 phần tử, kể cả hạng không có người trúng (`winnerCount = 0`).
   */
  plusPrizes: Max3dDrawTierPrize[];
  /** Tham chiếu kỳ quay Vietlott. `undefined` nếu không liên kết. */
  vietlottRef?: {
    drawPeriod: string;
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
 *     console.log(`Đã huỷ ${ticket.voidSummary.voidedDrawCount} kỳ, hoàn: ${ticket.voidSummary.totalRefundedAmount} VND`);
 *   }
 * }
 * ```
 */
export interface Max3dTicketSummary {
  /** ID vé trong hệ thống. */
  id: string;
  /** Mã vé hiển thị cho người chơi. VD: `"M3D-20260307-00005"`. */
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
    /** Tổng lines mỗi kỳ = Σ(board.lineCount). Dùng cho settle/matching. */
    linesPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(board.lineCount × board.betCount). Dùng tính tiền. */
    betUnitsPerDraw: number;
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
   * Tóm tắt huỷ cược (void). `undefined` nếu không có kỳ nào bị void.
   *
   * Void Max 3D theo entry (draw-level) — khi 1 kỳ bị void, TẤT CẢ entries
   * của kỳ đó bị huỷ. Không hỗ trợ void 1 phần board.
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

// ─────────────────────────────────────────────
// Response Types — Entry (chi tiết vé theo kỳ)
// ─────────────────────────────────────────────

/**
 * Chi tiết entry (vé 1 kỳ quay) cho UI — Max 3D.
 *
 * Trả về bởi `client.max3d.getTicketEntries()`.
 */
export interface Max3dEntryResult {
  /** ID entry trong hệ thống. */
  id: string;
  /** ID kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Trạng thái entry — dùng chung cho tất cả game, xem {@link EntryStatus}: `"scheduled"` (chờ quay) | `"settled"` (đã tính thưởng) | `"void"` (kỳ bị huỷ, tiền cược đã hoàn). */
  status: EntryStatus;
  /** Tiền cược kỳ này (VND) = betUnitCount × unitPrice. */
  amount: number;
  /** Đơn giá 1 lần tham gia dự thưởng (VND). */
  unitPrice: number;
  /** Số lines = Σ(board.lineCount) trong entry. */
  lineCount: number;
  /** Tổng đơn vị cược = Σ(board.lineCount × board.betCount). amount = betUnitCount × unitPrice. */
  betUnitCount: number;

  /** Tóm tắt nội dung vé (ticketNo + boards) tại thời điểm đặt cược. */
  entrySummary: {
    /** Mã vé hiển thị cho người chơi. VD: `"M3D-20260307-00005"`. */
    ticketNo: string;
    /** Danh sách boards đã cược, snapshot tại thời điểm tạo entry. */
    boards: Array<{
      /** Ký hiệu board: `"A"`, `"B"`, `"C"`, `"D"`. */
      boardNo: string;
      /** Chế độ chơi: `"basic"` (1 bộ ba) hoặc `"plus"` (2 bộ ba). */
      playMode: string;
      /** Kiểu chơi: `"straight"` | `"combo3"` | `"combo6"`. */
      playType: string;
      /** Bộ ba số đã chọn (hoặc đã expand từ combo). */
      triplets: string[];
      /** Số lines phát sinh từ board này. `straight` = 1, `combo3` = 3, `combo6` = 6. */
      lineCount: number;
      /** Số lần cược nhân bội (≥ 1). Tiền cược board = lineCount × betCount × unitPrice. */
      betCount: number;
    }>;
  };

  /** Kết quả quay. `undefined` nếu chưa quay. */
  result?: {
    /** Giải Đặc Biệt (2 bộ ba số). */
    special: string[];
    /** Giải Nhất (4 bộ ba số). */
    first: string[];
    /** Giải Nhì (6 bộ ba số). */
    second: string[];
    /** Giải Ba (8 bộ ba số). */
    third: string[];
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };

  /**
   * Kết quả tổng của entry sau settle — dùng chung cho tất cả game, xem {@link EntryOutcome}:
   * - `"win"` — Thắng, có ít nhất 1 giải trúng.
   * - `"loss"` — Thua, không trúng giải nào.
   * - `"void"` — Kỳ quay bị huỷ, entry vô hiệu, tiền cược được hoàn lại.
   *
   * `undefined` nếu entry chưa settle.
   */
  outcome?: EntryOutcome;

  /** Chi tiết trả thưởng. `undefined` nếu chưa settle hoặc không trúng. */
  payout?: {
    /** Tổng tiền thắng từ tất cả giải (VND). */
    winAmount: number;
    /** Tổng tiền trả thưởng thực tế (VND). Max 3D không có payout cap → bằng winAmount. */
    payoutAmount: number;
    /**
     * Chi tiết từng giải trúng.
     *
     * Basic: `tier` ∈ `"special"` | `"first"` | `"second"` | `"third"`, kèm `playMode: "basic"`.
     * Plus: `tier` ∈ `"special"` | `"first"` | ... | `"sixth"`, kèm `playMode: "plus"`.
     * Một entry có thể trúng nhiều hạng đồng thời (gộp giải theo luật Vietlott).
     */
    tiers: Array<{
      /**
       * Hạng giải.
       * Basic: `"special"` | `"first"` | `"second"` | `"third"`.
       * Plus: `"special"` | `"first"` | ... | `"sixth"`.
       */
      tier: string;
      /**
       * Cách chơi sinh ra hạng giải này: `"basic"` hoặc `"plus"`.
       * BasicPrizeTier và PlusPrizeTier có 4 tên tier trùng nhau nhưng giá trị khác nhau.
       */
      playMode: string;
      /** Số lines trúng hạng giải này. */
      hitCount: number;
      /** Tiền thưởng 1 line (VND). */
      unitAmount: number;
      /** Tổng tiền hạng này (VND) = unitAmount × hitCount × betCount. */
      amount: number;
    }>;
  };
}

// ─────────────────────────────────────────────
// Response Types — Place Bet
// ─────────────────────────────────────────────

/**
 * Response khi đặt cược Max 3D thành công.
 *
 * Trả về từ `POST /games/max3d/bets` qua `client.max3d.placeBet()`.
 */
export interface Max3dPlaceBetResponse {
  /** ID vé duy nhất trong hệ thống. */
  ticketId: string;
  /** Mã vé hiển thị cho người chơi. VD: `"M3D-20260307-00005"`. */
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
    /** Tổng lines mỗi kỳ = Σ(board.lineCount). Dùng cho settle/matching. */
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
 * Tham số phân trang cho danh sách vé Max 3D đang chờ xử lý.
 *
 * Cursor-based pagination. Không hỗ trợ lọc ngày — chỉ trả vé đang active.
 *
 * @example
 * ```ts
 * const page1 = await client.max3d.listPendingTickets({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.max3d.listPendingTickets({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Max3dListPendingTicketsParams {
  /** Số lượng vé mỗi trang (mặc định 20). */
  size?: number;
  /** Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước). */
  cursor?: string;
}

/**
 * Tham số lọc và phân trang cho lịch sử vé Max 3D (tất cả trạng thái).
 *
 * Hỗ trợ lọc theo khoảng ngày đặt cược (giờ Việt Nam).
 *
 * @example
 * ```ts
 * const march = await client.max3d.listTickets({
 *   from: "2026-03-01",
 *   to: "2026-03-31",
 * });
 *
 * if (march.nextCursor) {
 *   const page2 = await client.max3d.listTickets({
 *     size: 20,
 *     cursor: march.nextCursor,
 *   });
 * }
 * ```
 */
export interface Max3dListAllTicketsParams {
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
 * Tham số phân trang cho danh sách kết quả kỳ quay Max 3D.
 *
 * @example
 * ```ts
 * const page1 = await client.max3d.listDrawResults({ size: 10 });
 *
 * if (page1.nextCursor) {
 *   const page2 = await client.max3d.listDrawResults({
 *     size: 10,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */
export interface Max3dListDrawResultsParams {
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
 * Tham số phân trang cho lines của một entry Max 3D.
 */
export interface Max3dEntryLinesParams {
  /** Số lượng lines mỗi trang (mặc định 50). */
  size?: number;
  /**
   * Cursor cho trang tiếp theo (lấy từ `nextCursor` của response trước).
   * Là `lineIndex` (integer) của line cuối trang trước.
   */
  cursor?: number;
}

/**
 * Thông tin kỳ quay Max 3D hiện tại.
 *
 * Trả về bởi `client.max3d.getCurrentDraw()`.
 */
export interface Max3dCurrentDrawResponse {
  /** Kỳ quay đang mở bán, hoặc `null` nếu chưa có. */
  currentDraw: Max3dDrawInfo | null;
  /** Tất cả kỳ quay đang active. */
  activeDraws: Max3dDrawInfo[];
}

/**
 * Danh sách vé Max 3D (cursor-based).
 *
 * Trả về bởi `client.max3d.listPendingTickets()` và `client.max3d.listTickets()`.
 */
export interface Max3dListTicketsResponse {
  /** Danh sách vé trong trang hiện tại. */
  tickets: Max3dTicketSummary[];
  /** Cursor để lấy trang tiếp theo, `null` nếu đã hết. */
  nextCursor: string | null;
  /** Số vé thực tế trả về. */
  size: number;
}

/**
 * Danh sách entries (chi tiết theo từng kỳ quay) của một vé Max 3D.
 *
 * Trả về bởi `client.max3d.getTicketEntries()`.
 * Để lấy thông tin tóm tắt vé, dùng `listTickets()` hoặc `listPendingTickets()`.
 */
export interface Max3dTicketEntriesResponse {
  /** Danh sách entries (1 entry = 1 kỳ quay). */
  entries: Max3dEntryResult[];
}

/**
 * Danh sách lines chi tiết của một entry Max 3D (cursor-based).
 *
 * Trả về bởi `client.max3d.getEntryLines()`.
 *
 * Mỗi line là 1 bộ ba (Basic) hoặc 1 cặp bộ ba (Plus).
 * Pagination dùng integer line index làm cursor.
 *
 * @example
 * ```ts
 * const { lines, nextCursor } = await client.max3d.getEntryLines("entry-abc...", { size: 50 });
 * for (const line of lines) {
 *   console.log(`Board ${line.boardNo} [${line.playMode}/${line.playType}]: ${line.triplets.join(" + ")}`);
 *   if (line.matchResult && line.matchResult.tiers.length > 0) {
 *     const tierNames = line.matchResult.tiers.map(t => t.tier).join(" + ");
 *     console.log(`  Giải: ${tierNames}, tổng thưởng: ${line.matchResult.winAmount} VND`);
 *   } else {
 *     console.log("  Không trúng");
 *   }
 * }
 * ```
 */
export interface Max3dEntryLinesResponse {
  /** ID entry. */
  entryId: string;
  /**
   * ID kỳ quay mà entry này tham gia.
   * Format `YYYY-MM-DD.NNN`. VD: `"2026-03-07.001"`.
   */
  drawId: string;
  /** Danh sách lines trong trang hiện tại. */
  lines: Max3dLineInfo[];
  /**
   * Cursor để lấy trang tiếp theo, `null` nếu đã hết.
   * Là `lineIndex` của line cuối trong trang này (integer).
   */
  nextCursor: number | null;
  /** Số lines thực tế trả về trong trang này. */
  size: number;
}

/**
 * Danh sách kết quả kỳ quay Max 3D (cursor-based).
 *
 * Trả về bởi `client.max3d.listDrawResults()`.
 */
export interface Max3dListDrawResultsResponse {
  /** Danh sách kết quả kỳ quay trong trang hiện tại. */
  draws: Max3dDrawResultSummary[];
  /**
   * Cursor để lấy trang tiếp theo, `null` nếu đã hết.
   * Là `drawId` của kỳ cuối cùng trong trang này. Format `YYYY-MM-DD.NNN`.
   */
  nextCursor: string | null;
  /** Số kỳ quay thực tế trả về. */
  size: number;
}

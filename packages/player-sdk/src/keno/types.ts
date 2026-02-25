/**
 * Keno SDK – Public Types
 *
 * Types cho game Keno — dùng trong player client.
 * Số Keno là string zero-padded `"01"` đến `"80"` (khớp API contract).
 *
 * @module
 */

import type {
  KenoBigSmallBet,
  KenoEvenOddBet,
  KenoPlayType,
  KenoTicketDisplayStatus,
} from "./enums";

// ─────────────────────────────────────────────
// Input Types (mua vé)
// ─────────────────────────────────────────────

/**
 * Input board cơ bản — chọn 1-10 số.
 *
 * Số Keno dạng string zero-padded `"01"` đến `"80"`.
 *
 * @example
 * ```ts
 * const board: KenoBasicBoardInput = {
 *   boardNo: "A",
 *   numbers: ["01", "15", "33", "44", "60"],
 * };
 * ```
 */
export interface KenoBasicBoardInput {
  /**
   * Mã board: `"A"` hoặc `"B"`.
   */
  boardNo: string;

  /**
   * Danh sách số Keno đã chọn.
   *
   * - String zero-padded: `"01"` đến `"80"`
   * - Tối thiểu 1 số, tối đa 10 số
   * - Không trùng nhau
   */
  numbers: string[];
}

/**
 * Input side bet (cược bổ sung).
 *
 * @example
 * ```ts
 * const sideBet: KenoSideBetInput = {
 *   playType: "bigSmall",
 *   bet: "big",
 * };
 * ```
 */
export interface KenoSideBetInput {
  /**
   * Loại side bet: `"bigSmall"` hoặc `"evenOdd"`.
   */
  playType: typeof KenoPlayType.BigSmall | typeof KenoPlayType.EvenOdd;

  /**
   * Lựa chọn cược:
   *
   * - Big/Small: `"big"` | `"bigSmallDraw"` | `"small"`
   * - Even/Odd: `"even"` | `"even1112"` | `"evenOddDraw"` | `"odd1112"` | `"odd"`
   */
  bet: KenoBigSmallBet | KenoEvenOddBet;
}

/**
 * Input mua vé Keno.
 *
 * Gửi lên `POST /player/keno/bets` qua `client.keno.placeBet()`.
 *
 * @example
 * ```ts
 * import type { KenoTicketPurchaseInput } from "@megawin/player-sdk/keno";
 *
 * const input: KenoTicketPurchaseInput = {
 *   startDrawId: "2026-02-25-001",
 *   drawCount: 5,
 *   boards: [
 *     { boardNo: "A", numbers: ["01", "15", "33", "44", "60"] },
 *     { boardNo: "B", numbers: ["22", "44", "66"] },
 *   ],
 *   sideBets: [
 *     { playType: "bigSmall", bet: "big" },
 *   ],
 * };
 * ```
 */
export interface KenoTicketPurchaseInput {
  /**
   * Boards chọn số cơ bản (Panel A/B).
   *
   * Tối đa 2 boards.
   */
  boards: KenoBasicBoardInput[];

  /**
   * Side bets tùy chọn (Panel C).
   *
   * Có thể cược Lớn/Nhỏ và/hoặc Chẵn/Lẻ.
   */
  sideBets?: KenoSideBetInput[];

  /**
   * DrawId kỳ quay đầu tiên tham gia.
   *
   * Format: `YYYY-MM-DD-NNN` (vd `"2026-02-25-001"`)
   */
  startDrawId: string;

  /**
   * Số kỳ tham gia liên tiếp (1-20).
   */
  drawCount: number;
}

// ─────────────────────────────────────────────
// Response Types
// ─────────────────────────────────────────────

/**
 * Thông tin kỳ quay Keno cho UI.
 */
export interface KenoDrawInfo {
  /** ID kỳ quay. Format: `YYYY-MM-DD-NNN`. */
  drawId: string;
  /** Ngày quay. Format: `YYYY-MM-DD`. */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Thời điểm quay (ISO 8601). */
  drawTime: string;
  /** Trạng thái kỳ quay. */
  status: "upcoming" | "open" | "closed" | "completed";
  /** Thời điểm đóng bán (ISO 8601). */
  salesCloseAt: string;

  /** Tham chiếu kỳ quay Vietlott (nếu có). */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

/**
 * Kết quả kỳ quay Keno.
 */
export interface KenoDrawResult {
  /** 20 số trúng thưởng (1-80). */
  winningNumbers: number[];
  /** Thời điểm công bố (ISO 8601). */
  publishedAt: string;

  /** Số lượng số lớn (41-80) trong kết quả. */
  bigCount: number;
  /** Số lượng số nhỏ (1-40) trong kết quả. */
  smallCount: number;
  /** Số lượng số chẵn trong kết quả. */
  evenCount: number;
  /** Số lượng số lẻ trong kết quả. */
  oddCount: number;
}

/**
 * Tóm tắt vé Keno cho UI.
 */
export interface KenoTicketSummary {
  /** ID vé. */
  ticketId: string;
  /** Mã vé hiển thị. */
  ticketNo: string;
  /** Trạng thái vé hiển thị. */
  status: KenoTicketDisplayStatus;
  /** Tổng tiền cược (VND). */
  totalAmount: number;
  /** Số kỳ tham gia. */
  drawCount: number;
  /** Số kỳ đã settle. */
  settledDraws: number;
  /** Tổng tiền thắng (VND). `undefined` nếu chưa settle hết. */
  totalWinAmount?: number;

  /** Danh sách boards. */
  boards: KenoBasicBoardSummary[];
  /** Danh sách side bets. */
  sideBets: KenoSideBetSummary[];

  /** Thời điểm mua vé (ISO 8601). */
  createdAt: string;
}

/**
 * Tóm tắt board trong vé Keno.
 */
export interface KenoBasicBoardSummary {
  /** Mã board. */
  boardNo: string;
  /** Kiểu chơi (pick1-pick10). */
  playType: KenoPlayType;
  /** Danh sách số đã chọn (number, 1-80). */
  numbers: number[];
}

/**
 * Tóm tắt side bet trong vé Keno.
 */
export interface KenoSideBetSummary {
  /** Loại side bet. */
  playType: KenoPlayType;
  /** Lựa chọn cược. */
  bet: KenoBigSmallBet | KenoEvenOddBet;
}

/**
 * Kết quả entry (vé 1 kỳ) cho UI.
 */
export interface KenoEntryResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày quay. */
  drawDate: string;
  /** Trạng thái: chờ quay / đã có kết quả / đã tính thưởng. */
  status: "pending" | "drawn" | "settled";
  /** Tiền cược kỳ này (VND). */
  amount: number;
  /** Kết quả quay (nếu đã có). */
  result?: KenoDrawResult;
  /** Chi tiết trúng thưởng (nếu đã settle). */
  payout?: KenoEntryPayoutSummary;
}

/**
 * Chi tiết trả thưởng entry Keno.
 */
export interface KenoEntryPayoutSummary {
  /** Tổng tiền thắng kỳ này (VND). */
  winAmount: number;

  /** Kết quả từng board. */
  boardResults: Array<{
    /** Mã board. */
    boardNo: string;
    /** Số trùng khớp. */
    matchCount: number;
    /** Số đã chọn. */
    pickCount: number;
    /** Tiền thưởng (VND). */
    winAmount: number;
    /** Các số trùng khớp. */
    matchedNumbers: number[];
  }>;

  /** Kết quả từng side bet. */
  sideBetResults: Array<{
    /** Loại side bet. */
    playType: KenoPlayType;
    /** Lựa chọn cược. */
    bet: KenoBigSmallBet | KenoEvenOddBet;
    /** Kết quả thực tế (vd `"big"`, `"even"`). */
    outcome: string;
    /** Thắng hay thua. */
    isWin: boolean;
    /** Tiền thưởng (VND). */
    winAmount: number;
  }>;
}

/**
 * Bảng giải thưởng Keno (cho trang hướng dẫn chơi).
 *
 * @example
 * ```ts
 * // Giải thưởng cơ bản: pickCount → matchCount → prize (VND)
 * prizeTable.basicPrizes[5][3]; // 50000 (pick5, trùng 3 số)
 *
 * // Giải Lớn/Nhỏ
 * prizeTable.bigSmallPrizes[0].condition; // ">= 13 số lớn"
 * prizeTable.bigSmallPrizes[0].prize;     // 3400
 * ```
 */
export interface KenoPrizeTableInfo {
  /**
   * Bảng giải cơ bản.
   *
   * Key cấp 1: `pickCount` (1-10).
   * Key cấp 2: `matchCount` (0-pickCount).
   * Value: tiền thưởng (VND).
   */
  basicPrizes: Record<number, Record<number, number>>;

  /** Bảng giải Lớn/Nhỏ. */
  bigSmallPrizes: Array<{
    /** Điều kiện trúng. */
    condition: string;
    /** Tiền thưởng (VND). */
    prize: number;
  }>;

  /** Bảng giải Chẵn/Lẻ. */
  evenOddPrizes: Array<{
    /** Điều kiện trúng. */
    condition: string;
    /** Tiền thưởng (VND). */
    prize: number;
  }>;
}

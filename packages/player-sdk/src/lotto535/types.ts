/**
 * Lotto 5/35 SDK – Public Types
 *
 * Types cho game Lotto 5/35 — dùng trong player client.
 * Số chính: string zero-padded `"01"` đến `"35"`.
 * Số đặc biệt: string zero-padded `"01"` đến `"12"`.
 *
 * @module
 */

import type {
  Lotto535PlayType,
  Lotto535PrizeTier,
  Lotto535TicketDisplayStatus,
} from "./enums";

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
   * - Standard / QuickPick: 5 số (hoặc 4 với MainCover4)
   * - MainCover: 6-15 số
   * - SpecialCover: 5 số
   */
  mainNumbers: string[];

  /**
   * Danh sách số đặc biệt đã chọn.
   *
   * String zero-padded: `"01"` đến `"12"`.
   * Số lượng tùy kiểu chơi:
   * - Standard / MainCover / MainCover4 / QuickPick: 1 số
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
   * | `"quickPick"`    | Máy chọn ngẫu nhiên      | 1        |
   */
  playType: Lotto535PlayType;

  /** Lựa chọn số. */
  selection: Lotto535SelectionInput;
}

/**
 * Input mua vé Lotto 5/35.
 *
 * Gửi lên `POST /player/lotto535/bets` qua `client.lotto535.placeBet()`.
 *
 * @example
 * ```ts
 * import type { Lotto535TicketPurchaseInput } from "@megawin/player-sdk/lotto535";
 *
 * const input: Lotto535TicketPurchaseInput = {
 *   drawId: "2026-02-25-001",
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
   * Format: `YYYY-MM-DD-NNN` (vd `"2026-02-25-001"`)
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
  /** ID kỳ quay. Format: `YYYY-MM-DD-NNN`. */
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
    drawSession: number;
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
 */
export interface Lotto535TicketSummary {
  /** ID vé. */
  ticketId: string;
  /** Mã vé hiển thị. */
  ticketNo: string;
  /** Trạng thái vé hiển thị. */
  status: Lotto535TicketDisplayStatus;
  /** Tổng tiền cược (VND). */
  totalAmount: number;
  /** Số kỳ tham gia. */
  drawCount: number;
  /** Số kỳ đã settle. */
  settledDraws: number;
  /** Tổng tiền thắng (VND). `undefined` nếu chưa settle hết. */
  totalWinAmount?: number;
  /** Danh sách boards. */
  boards: Lotto535BoardSummary[];
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
  status: "pending" | "drawn" | "settled";
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

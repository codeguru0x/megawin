/**
 * Keno – Feed Types
 *
 * Strongly-typed interfaces cho các game-specific fields trong EntryFeedDoc:
 * betContent, drawResult, payoutDetail.
 *
 * boards[] chứa cả cơ bản (pick1-pick10) và bổ sung (bigSmall/evenOdd),
 * boardPayouts[] chứa payout cho tất cả boards.
 */

// ─────────────────────────────────────────────
// betContent
// ─────────────────────────────────────────────

/**
 * Snapshot 1 board — cả chơi cơ bản (pick1-pick10) và bổ sung (bigSmall/evenOdd).
 *
 * - Cơ bản: numbers bắt buộc, bet = undefined.
 * - Bổ sung: bet bắt buộc, numbers = undefined.
 */
export interface KenoFeedBoard {
  /** Mã board: "A", "B", "C". */
  boardNo: string;
  /** Kiểu chơi: "pick1"–"pick10" | "bigSmall" | "evenOdd". */
  playType: string;
  /** Các số đã chọn (zero-padded "01"-"80"). Chỉ cho cơ bản. */
  numbers?: string[];
  /** Lựa chọn side bet: "big"/"small"/"bigSmallDraw"/"even"/"odd"/... Chỉ cho bổ sung. */
  bet?: string;
  /** Số lần cược nhân bội. */
  betCount: number;
}

/**
 * Nội dung cược Keno — gán vào EntryFeedDoc.betContent.
 */
export interface KenoFeedBetContent {
  /** Tất cả boards (cơ bản + bổ sung). */
  boards: KenoFeedBoard[];
}

// ─────────────────────────────────────────────
// drawResult
// ─────────────────────────────────────────────

/**
 * Kết quả kỳ quay Keno — gán vào EntryFeedDoc.drawResult.
 */
export interface KenoFeedDrawResult {
  /** 20 số trúng thưởng (zero-padded "01"-"80"). */
  numbers: string[];
}

// ─────────────────────────────────────────────
// payoutDetail
// ─────────────────────────────────────────────

/**
 * Chi tiết payout 1 board — cả cơ bản và bổ sung.
 *
 * - Cơ bản: pickCount + matchCount + isWin meaningful, bet/outcome = undefined.
 * - Bổ sung: bet + outcome + isWin meaningful, pickCount = null, matchCount = null.
 */
export interface KenoFeedBoardPayout {
  /** Mã board: "A", "B", "C". */
  boardNo: string;
  /** Kiểu chơi. */
  playType: string;
  /** Số chọn (pickCount). null cho bổ sung — field không áp dụng. */
  pickCount: number | null;
  /** Số trùng với kết quả quay (matchCount). null cho bổ sung — field không áp dụng. */
  matchCount: number | null;
  /** Lựa chọn side bet. Chỉ cho bổ sung. */
  bet?: string;
  /** Kết quả draw thực tế. Chỉ cho bổ sung. */
  outcome?: string;
  /** Player thắng hay không. Set cho tất cả play types. */
  isWin: boolean;
  /** Số lần cược nhân bội. */
  betCount: number;
  /** Tiền thắng (VND). 0 nếu không trúng. */
  winAmount: number;
}

/**
 * Chi tiết trả thưởng Keno — gán vào EntryFeedDoc.payoutDetail.
 */
export interface KenoFeedPayoutDetail {
  /** Chi tiết theo từng board (cả cơ bản và bổ sung). */
  boardPayouts: KenoFeedBoardPayout[];
}

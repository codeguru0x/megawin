/**
 * Keno – Feed Types
 *
 * Strongly-typed interfaces cho các game-specific fields trong EntryFeedDoc:
 * betContent, drawResult, payoutDetail.
 */

// ─────────────────────────────────────────────
// betContent
// ─────────────────────────────────────────────

/**
 * Snapshot 1 board chơi cơ bản (pick1–pick10).
 */
export interface KenoFeedBoard {
  /** Mã board: "A", "B". */
  boardNo: string;
  /** Kiểu chơi: "pick1"–"pick10". */
  playType: string;
  /** Các số đã chọn (zero-padded "01"-"80"). */
  numbers: string[];
  /** Số lần cược nhân bội. */
  betCount: number;
}

/**
 * Snapshot 1 side bet (Lớn/Nhỏ, Chẵn/Lẻ).
 */
export interface KenoFeedSideBet {
  /** Loại side bet: "bigSmall" | "evenOdd". */
  playType: string;
  /** Lựa chọn cụ thể: "big"/"small"/"bigSmallDraw"/"even"/"odd"/"evenOddDraw". */
  bet: string;
  /** Số lần cược nhân bội. */
  betCount: number;
}

/**
 * Nội dung cược Keno — gán vào EntryFeedDoc.betContent.
 */
export interface KenoFeedBetContent {
  /** Các boards pick-number. */
  boards: KenoFeedBoard[];
  /** Các side bets (Lớn/Nhỏ, Chẵn/Lẻ). */
  sideBets: KenoFeedSideBet[];
}

// ─────────────────────────────────────────────
// drawResult
// ─────────────────────────────────────────────

/**
 * Kết quả kỳ quay Keno — gán vào EntryFeedDoc.drawResult.
 */
export interface KenoFeedDrawResult {
  /** 20 số trúng thưởng (zero-padded "01"-"80"). */
  winningNumbers: string[];
  /** Số lượng số lớn (≥41) trong kết quả. */
  bigCount: number;
  /** Số lượng số nhỏ (<41) trong kết quả. */
  smallCount: number;
  /** Số lượng số chẵn trong kết quả. */
  evenCount: number;
  /** Số lượng số lẻ trong kết quả. */
  oddCount: number;
  /** Thời điểm công bố kết quả (ISO 8601 string). */
  publishedAt: string;
}

// ─────────────────────────────────────────────
// payoutDetail
// ─────────────────────────────────────────────

/**
 * Chi tiết payout 1 board pick-number.
 */
export interface KenoFeedBoardPayout {
  /** Mã board: "A", "B". */
  boardNo: string;
  /** Kiểu chơi. */
  playType: string;
  /** Số chọn (pickCount). */
  pickCount: number;
  /** Số trùng với kết quả quay (matchCount). */
  matchCount: number;
  /** Số lần cược nhân bội. */
  betCount: number;
  /** Tiền thắng (VND). 0 nếu không trúng. */
  winAmount: number;
}

/**
 * Chi tiết payout 1 side bet.
 */
export interface KenoFeedSideBetPayout {
  /** Loại side bet. */
  playType: string;
  /** Lựa chọn player đặt. */
  bet: string;
  /** Kết quả quay thực tế (ví dụ: "big8", "even10"). */
  outcome: string;
  /** Thắng hay thua. */
  isWin: boolean;
  /** Số lần cược nhân bội. */
  betCount: number;
  /** Tiền thắng (VND). */
  winAmount: number;
}

/**
 * Chi tiết trả thưởng Keno — gán vào EntryFeedDoc.payoutDetail.
 */
export interface KenoFeedPayoutDetail {
  /** Thời điểm settle (ISO 8601 string). */
  settledAt: string;
  /** Chi tiết theo từng board. */
  boardPayouts: KenoFeedBoardPayout[];
  /** Chi tiết theo từng side bet. */
  sideBetPayouts: KenoFeedSideBetPayout[];
}

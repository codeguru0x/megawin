/**
 * Bingo 18 – Feed Types
 *
 * Strongly-typed interfaces cho các game-specific fields trong EntryFeedDoc:
 * betContent, drawResult, payoutDetail.
 *
 * boards[] chứa cả cơ bản và bổ sung, boardPayouts[] chứa payout cho tất cả boards.
 *
 * Bingo 18: quay 3 số từ {1-6}, tổng 3-18.
 * Cách chơi: singleNum, doubleMatch, tripleMatch, sumTotal, bigSmallDraw — tất cả trong boards[].
 */

// ─────────────────────────────────────────────
// betContent
// ─────────────────────────────────────────────

/**
 * Snapshot 1 board — cả cơ bản và bổ sung.
 *
 * - singleNum/doubleMatch: number bắt buộc.
 * - tripleMatch: tripleKind bắt buộc, number nếu specific.
 * - sumTotal: sum bắt buộc.
 * - bigSmallDraw: bet bắt buộc.
 */
export interface Bingo18FeedBoard {
  /** Mã board: "A"–"F". */
  boardNo: string;
  /** Loại cược: "singleNum" | "doubleMatch" | "tripleMatch" | "sumTotal" | "bigSmallDraw". */
  playType: string;
  /** Số đã chọn (1-6). Cho singleNum, doubleMatch, tripleMatch specific. */
  number?: number;
  /** Phân loại triple: "specific" | "any". Chỉ cho tripleMatch. */
  tripleKind?: string;
  /** Tổng cụ thể (3-18). Chỉ cho sumTotal. */
  sum?: number;
  /** Cược lớn/hoà/nhỏ: "big" | "draw" | "small". Chỉ cho bigSmallDraw. */
  bet?: string;
  /** Số lần tham gia dự thưởng. */
  betCount: number;
}

/**
 * Nội dung cược Bingo 18 — gán vào EntryFeedDoc.betContent.
 */
export interface Bingo18FeedBetContent {
  /** Tất cả boards (cơ bản + bổ sung). */
  boards: Bingo18FeedBoard[];
}

// ─────────────────────────────────────────────
// drawResult
// ─────────────────────────────────────────────

/**
 * Kết quả kỳ quay Bingo 18 — gán vào EntryFeedDoc.drawResult.
 */
export interface Bingo18FeedDrawResult {
  /** 3 số kết quả quay (1-6), giữ nguyên thứ tự. */
  numbers: number[];
}

// ─────────────────────────────────────────────
// payoutDetail
// ─────────────────────────────────────────────

/**
 * Chi tiết payout 1 board — cả cơ bản và bổ sung.
 *
 * - Cơ bản: matchCount + isWin meaningful, outcome = undefined.
 * - Bổ sung: outcome + isWin meaningful, matchCount = null.
 */
export interface Bingo18FeedBoardPayout {
  /** Mã board tương ứng. */
  boardNo: string;
  /** Loại cược. */
  playType: string;
  /** Phân loại triple: "specific" | "any". Chỉ cho tripleMatch. */
  tripleKind?: string;
  /** Số lần số đã chọn xuất hiện trong kết quả (0-3). null cho bổ sung — field không áp dụng. */
  matchCount: number | null;
  /** Tổng đã chọn. Chỉ cho sumTotal. */
  sum?: number;
  /** Cược lớn/hoà/nhỏ. Chỉ cho bigSmallDraw. */
  bet?: string;
  /** Kết quả thực tế. Chỉ cho bổ sung. */
  outcome?: string;
  /** Player thắng hay không. Set cho tất cả play types. */
  isWin: boolean;
  /** Số lần tham gia dự thưởng. */
  betCount: number;
  /** Giá trị giải per-unit trước khi nhân betCount (VND). 0 nếu thua. */
  unitWinAmount: number;
  /** Tiền thắng = unitWinAmount × betCount (VND). */
  winAmount: number;
}

/**
 * Chi tiết trả thưởng Bingo 18 — gán vào EntryFeedDoc.payoutDetail.
 */
export interface Bingo18FeedPayoutDetail {
  /** Chi tiết theo từng board (cả cơ bản và bổ sung). */
  boardPayouts: Bingo18FeedBoardPayout[];
}

/**
 * Bingo 18 – Feed Types
 *
 * Strongly-typed interfaces cho các game-specific fields trong EntryFeedDoc:
 * betContent, drawResult, payoutDetail.
 *
 * Bingo 18: quay 3 số từ {1-6}, tổng 3-18.
 * Cách chơi: singleNum, doubleMatch, tripleMatch (boards) + sumTotal, bigSmallDraw (sideBets).
 */

// ─────────────────────────────────────────────
// betContent
// ─────────────────────────────────────────────

/**
 * Snapshot 1 board cơ bản.
 */
export interface Bingo18FeedBoard {
  /** Mã board: "B01", "B02",... */
  boardNo: string;
  /** Loại cược: "singleNum" | "doubleMatch" | "tripleMatch". */
  playType: string;
  /** Số đã chọn (1-6). undefined cho tripleMatch any. */
  number?: number;
  /** Phân loại triple: "specific" | "any". Chỉ cho tripleMatch. */
  tripleKind?: string;
  /** Số lần tham gia dự thưởng. */
  betCount: number;
}

/**
 * Snapshot 1 side bet.
 */
export interface Bingo18FeedSideBet {
  /** Loại side bet: "sumTotal" | "bigSmallDraw". */
  playType: string;
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
  /** Các boards cơ bản. */
  boards: Bingo18FeedBoard[];
  /** Các side bets (Tổng, Lớn/Hoà/Nhỏ). */
  sideBets: Bingo18FeedSideBet[];
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
  /** Tổng 3 số quay (3-18). */
  sum: number;
  /** Thời điểm công bố kết quả (ISO 8601 string). */
  publishedAt: string;
}

// ─────────────────────────────────────────────
// payoutDetail
// ─────────────────────────────────────────────

/**
 * Chi tiết payout 1 board cơ bản.
 */
export interface Bingo18FeedBoardPayout {
  /** Mã board tương ứng. */
  boardNo: string;
  /** Loại cược. */
  playType: string;
  /** Phân loại triple: "specific" | "any". Chỉ cho tripleMatch. */
  tripleKind?: string;
  /** Số lần số đã chọn xuất hiện trong kết quả (0-3). */
  matchCount: number;
  /** Số lần tham gia dự thưởng. */
  betCount: number;
  /** Giá trị giải per-unit trước khi nhân betCount (VND). 0 nếu thua. */
  unitWinAmount: number;
  /** Tiền thắng = unitWinAmount × betCount (VND). */
  winAmount: number;
}

/**
 * Chi tiết payout 1 side bet.
 */
export interface Bingo18FeedSideBetPayout {
  /** Loại side bet. */
  playType: string;
  /** Tổng đã chọn. Chỉ cho sumTotal. */
  sum?: number;
  /** Cược lớn/hoà/nhỏ. Chỉ cho bigSmallDraw. */
  bet?: string;
  /** Kết quả thực tế của kỳ quay (encode theo playType). */
  outcome: string;
  /** Thắng hay thua. */
  isWin: boolean;
  /** Số lần tham gia dự thưởng. */
  betCount: number;
  /** Giá trị giải per-unit (VND). 0 nếu thua. */
  unitWinAmount: number;
  /** Tiền thắng = unitWinAmount × betCount (VND). */
  winAmount: number;
}

/**
 * Chi tiết trả thưởng Bingo 18 — gán vào EntryFeedDoc.payoutDetail.
 */
export interface Bingo18FeedPayoutDetail {
  /** Thời điểm settle (ISO 8601 string). */
  settledAt: string;
  /** Chi tiết theo từng board cơ bản. */
  boardPayouts: Bingo18FeedBoardPayout[];
  /** Chi tiết theo từng side bet. */
  sideBetPayouts: Bingo18FeedSideBetPayout[];
}

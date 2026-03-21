/**
 * Mega 6/45 – Feed Types
 *
 * Strongly-typed interfaces cho các game-specific fields trong EntryFeedDoc:
 * betContent, drawResult, payoutDetail.
 */

// ─────────────────────────────────────────────
// betContent
// ─────────────────────────────────────────────

/**
 * Snapshot 1 board lựa chọn của người chơi.
 */
export interface Mega645FeedBoard {
  /** Ký hiệu board ("A".."F"). */
  boardNo: string;
  /** Kiểu chơi: standard / bao5 / bao7–bao18. */
  playType: string;
  /** 6 số chính đã chọn ("01"-"45"). */
  mainNumbers: string[];
  /** Số lines expand từ board (standard=1, bao5=40, baoN=C(N,6)). */
  expandedLines: number;
  /** Số lần cược nhân bội. */
  betCount: number;
}

/**
 * Nội dung cược Mega 6/45 — gán vào EntryFeedDoc.betContent.
 */
export interface Mega645FeedBetContent {
  /** Danh sách boards người chơi đã chọn. */
  boards: Mega645FeedBoard[];
}

// ─────────────────────────────────────────────
// drawResult
// ─────────────────────────────────────────────

/**
 * Kết quả kỳ quay Mega 6/45 — gán vào EntryFeedDoc.drawResult.
 */
export interface Mega645FeedDrawResult {
  /** 6 số trúng thưởng (zero-padded "01"-"45"). */
  winningMain: string[];
  /** Thời điểm công bố kết quả (ISO 8601 string). */
  publishedAt: string;
}

// ─────────────────────────────────────────────
// payoutDetail
// ─────────────────────────────────────────────

/**
 * Chi tiết trúng thưởng 1 hạng giải.
 */
export interface Mega645FeedPayoutTier {
  /** Tên hạng giải (jackpot / tier1 / tier2 / tier3). */
  tier: string;
  /** Số lines trúng hạng này. */
  hitCount: number;
  /** Tiền thưởng mỗi hit (VND). Jackpot = giá trị pool tại thời điểm settle. */
  unitAmount: number;
  /** Tổng tiền hạng này (VND). */
  amount: number;
}

/**
 * Chi tiết trả thưởng Mega 6/45 — gán vào EntryFeedDoc.payoutDetail.
 */
export interface Mega645FeedPayoutDetail {
  /** Thời điểm settle (ISO 8601 string). */
  settledAt: string;
  /** Chi tiết theo từng hạng giải. */
  tiers: Mega645FeedPayoutTier[];
}

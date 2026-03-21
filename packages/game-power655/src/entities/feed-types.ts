/**
 * Power 6/55 – Feed Types
 *
 * Strongly-typed interfaces cho các game-specific fields trong EntryFeedDoc:
 * betContent, drawResult, payoutDetail.
 */

// ─────────────────────────────────────────────
// betContent
// ─────────────────────────────────────────────

/**
 * Snapshot 1 board lựa chọn.
 */
export interface Power655FeedBoard {
  /** Ký hiệu board ("A".."E"). */
  boardNo: string;
  /** Kiểu chơi: standard / bao5 / bao7–bao18. */
  playType: string;
  /** 6 số chính đã chọn ("01"-"55"). */
  mainNumbers: string[];
  /** Số lines expand từ board. */
  expandedLines: number;
  /** Số lần cược nhân bội. */
  betCount: number;
}

/**
 * Nội dung cược Power 6/55 — gán vào EntryFeedDoc.betContent.
 */
export interface Power655FeedBetContent {
  /** Danh sách boards người chơi đã chọn. */
  boards: Power655FeedBoard[];
}

// ─────────────────────────────────────────────
// drawResult
// ─────────────────────────────────────────────

/**
 * Kết quả kỳ quay Power 6/55 — gán vào EntryFeedDoc.drawResult.
 */
export interface Power655FeedDrawResult {
  /** 6 số chính trúng thưởng (zero-padded "01"-"55"). */
  winningMain: string[];
  /** Số bonus (quay từ 49 quả còn lại). */
  bonusNumber: string;
  /** Thời điểm công bố kết quả (ISO 8601 string). */
  publishedAt: string;
}

// ─────────────────────────────────────────────
// payoutDetail
// ─────────────────────────────────────────────

/**
 * Chi tiết trúng thưởng 1 hạng giải.
 */
export interface Power655FeedPayoutTier {
  /** Tên hạng giải (jackpot1 / jackpot2 / tier1 / tier2 / tier3). */
  tier: string;
  /** Số lines trúng hạng này. */
  hitCount: number;
  /**
   * Tiền thưởng mỗi hit (VND).
   * JP1/JP2 = 0 tại SettleEntries, patch ở FinalizeSettle khi biết pool chính xác.
   */
  unitAmount: number;
  /** Tổng tiền hạng này (VND). */
  amount: number;
}

/**
 * Chi tiết trả thưởng Power 6/55 — gán vào EntryFeedDoc.payoutDetail.
 */
export interface Power655FeedPayoutDetail {
  /** Thời điểm settle (ISO 8601 string). */
  settledAt: string;
  /** Chi tiết theo từng hạng giải. */
  tiers: Power655FeedPayoutTier[];
}

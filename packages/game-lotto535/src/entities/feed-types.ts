/**
 * Lotto 5/35 – Feed Types
 *
 * Strongly-typed interfaces cho các game-specific fields trong EntryFeedDoc:
 * betContent, drawResult, payoutDetail.
 *
 * Các types này được dùng trong mapper (sync-entry-feed.ts của lotto535-application)
 * và gán vào các unknown fields của EntryFeedDoc.
 *
 * Tenant nhận field này dưới dạng JSON object và parse theo gameProduct.
 */

// ─────────────────────────────────────────────
// betContent
// ─────────────────────────────────────────────

/**
 * Snapshot 1 board lựa chọn của người chơi.
 * Đủ thông tin để tenant hiển thị vé cược cho khách.
 */
export interface Lotto535FeedBoard {
  /** Mã board: "A", "B", "C", "D", "E". */
  boardNo: string;
  /** Kiểu chơi: standard / mainCover / specialCover... */
  playType: string;
  /** Số chính đã chọn (zero-padded "01"-"35"). */
  mainNumbers: string[];
  /** Số đặc biệt đã chọn (zero-padded "01"-"12"). */
  specialNumbers: string[];
  /** Số lines expand từ board. */
  expandedLines: number;
  /** Số lần cược nhân bội. */
  betCount: number;
}

/**
 * Nội dung cược Lotto 5/35 — gán vào EntryFeedDoc.betContent.
 */
export interface Lotto535FeedBetContent {
  /** Danh sách boards người chơi đã chọn. */
  boards: Lotto535FeedBoard[];
}

// ─────────────────────────────────────────────
// drawResult
// ─────────────────────────────────────────────

/**
 * Kết quả kỳ quay Lotto 5/35 — gán vào EntryFeedDoc.drawResult.
 * Chỉ có sau khi draw result được publish.
 */
export interface Lotto535FeedDrawResult {
  /** 5 số chính trúng thưởng (zero-padded "01"-"35"). */
  winningMain: string[];
  /** Số đặc biệt trúng thưởng (zero-padded "01"-"12"). */
  winningSpecial: string;
  /** Thời điểm công bố kết quả (ISO 8601 string). */
  publishedAt: string;
}

// ─────────────────────────────────────────────
// payoutDetail
// ─────────────────────────────────────────────

/**
 * Chi tiết trúng thưởng 1 hạng giải.
 */
export interface Lotto535FeedPayoutTier {
  /** Tên hạng giải (enum string: jackpot / tier1 / tier2...). */
  tier: string;
  /** Số lines trúng hạng này. */
  hitCount: number;
  /** Tiền thưởng mỗi hit (VND). */
  unitAmount: number;
  /** Tổng tiền hạng này = unitAmount × hitCount (VND). */
  amount: number;
}

/**
 * Chi tiết trả thưởng Lotto 5/35 — gán vào EntryFeedDoc.payoutDetail.
 * Chỉ có sau khi settle và outcome = "win".
 */
export interface Lotto535FeedPayoutDetail {
  /** Thời điểm settle (ISO 8601 string). */
  settledAt: string;
  /** Chi tiết theo từng hạng giải. */
  tiers: Lotto535FeedPayoutTier[];
}

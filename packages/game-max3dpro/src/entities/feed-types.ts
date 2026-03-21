/**
 * Max 3D Pro – Feed Types
 *
 * Strongly-typed interfaces cho các game-specific fields trong EntryFeedDoc:
 * betContent, drawResult, payoutDetail.
 *
 * Max 3D Pro: chơi theo cặp bộ ba số (pairs), 8 hạng giải (special→sixth).
 */

// ─────────────────────────────────────────────
// betContent
// ─────────────────────────────────────────────

/**
 * Snapshot 1 board lựa chọn.
 */
export interface Max3dproFeedBoard {
  /** Ký hiệu board: A, B, C, D. */
  boardNo: string;
  /** Cách chơi: "multiNumber" | "multiDigit". */
  playMode: string;
  /** Kiểu chơi: "straight". */
  playType: string;
  /** Danh sách các bộ ba số (zero-padded "000"-"999"). */
  triplets: string[];
  /** Số cặp (pairs) sinh ra = P(n,2). */
  lineCount: number;
  /** Số lần cược nhân bội. */
  betCount: number;
}

/**
 * Nội dung cược Max 3D Pro — gán vào EntryFeedDoc.betContent.
 */
export interface Max3dproFeedBetContent {
  /** Danh sách boards. */
  boards: Max3dproFeedBoard[];
}

// ─────────────────────────────────────────────
// drawResult
// ─────────────────────────────────────────────

/**
 * Kết quả kỳ quay Max 3D Pro — gán vào EntryFeedDoc.drawResult.
 * Cấu trúc giống Max 3D: 20 bộ ba số chia 4 hạng.
 */
export interface Max3dproFeedDrawResult {
  /** 2 bộ ba số giải Đặc Biệt. */
  special: string[];
  /** 4 bộ ba số giải Nhất. */
  first: string[];
  /** 6 bộ ba số giải Nhì. */
  second: string[];
  /** 8 bộ ba số giải Ba. */
  third: string[];
  /** Thời điểm công bố kết quả (ISO 8601 string). */
  publishedAt: string;
}

// ─────────────────────────────────────────────
// payoutDetail
// ─────────────────────────────────────────────

/**
 * Chi tiết trúng thưởng 1 hạng giải (8 hạng: special→sixth).
 */
export interface Max3dproFeedPayoutTier {
  /** Tên hạng giải (special / specialSub / first / second / third / fourth / fifth / sixth). */
  tier: string;
  /** Số pairs trúng hạng này. */
  hitCount: number;
  /**
   * Tiền thưởng trung bình mỗi hit (VND).
   * Bao gồm duplicate multiplier (×2) và betCount.
   */
  unitAmount: number;
  /** Tổng tiền hạng này (VND). */
  amount: number;
}

/**
 * Chi tiết trả thưởng Max 3D Pro — gán vào EntryFeedDoc.payoutDetail.
 */
export interface Max3dproFeedPayoutDetail {
  /** Thời điểm settle (ISO 8601 string). */
  settledAt: string;
  /** Chi tiết theo từng hạng giải. */
  tiers: Max3dproFeedPayoutTier[];
}

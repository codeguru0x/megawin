/**
 * Max 3D – Feed Types
 *
 * Strongly-typed interfaces cho các game-specific fields trong EntryFeedDoc:
 * betContent, drawResult, payoutDetail.
 *
 * Max 3D có 2 cách chơi: basic (1 bộ ba) và plus (2 bộ ba).
 */

// ─────────────────────────────────────────────
// betContent
// ─────────────────────────────────────────────

/**
 * Snapshot 1 board lựa chọn.
 */
export interface Max3dFeedBoard {
  /** Ký hiệu board: A, B, C, D. */
  boardNo: string;
  /** Cách chơi: "basic" | "plus". */
  playMode: string;
  /** Kiểu chơi: "straight" | "combo3" | "combo6". */
  playType: string;
  /** Danh sách bộ ba số đã chọn (zero-padded "000"-"999"). */
  triplets: string[];
  /** Số lines = số lần dự thưởng. */
  lineCount: number;
  /** Số lần cược nhân bội. */
  betCount: number;
}

/**
 * Nội dung cược Max 3D — gán vào EntryFeedDoc.betContent.
 */
export interface Max3dFeedBetContent {
  /** Danh sách boards người chơi đã chọn. */
  boards: Max3dFeedBoard[];
}

// ─────────────────────────────────────────────
// drawResult
// ─────────────────────────────────────────────

/**
 * Kết quả kỳ quay Max 3D — gán vào EntryFeedDoc.drawResult.
 * 20 bộ ba số chia theo 4 hạng giải.
 */
export interface Max3dFeedDrawResult {
  /** 2 bộ ba số giải Đặc Biệt. */
  special: string[];
  /** 4 bộ ba số giải Nhất. */
  first: string[];
  /** 6 bộ ba số giải Nhì. */
  second: string[];
  /** 8 bộ ba số giải Ba. */
  third: string[];
}

// ─────────────────────────────────────────────
// payoutDetail
// ─────────────────────────────────────────────

/**
 * Chi tiết trúng thưởng 1 hạng giải.
 */
export interface Max3dFeedPayoutTier {
  /** Tên hạng giải (special / first / second / third, basic hoặc plus). */
  tier: string;

  /** Cách chơi sinh ra hạng giải này. */
  playMode: string;

  /** Số lần trúng hạng này. */
  hitCount: number;

  /** Tiền thưởng mỗi hit (VND). */
  unitAmount: number;

  /** Tổng tiền hạng này (VND). */
  amount: number;
}

/**
 * Chi tiết trả thưởng Max 3D — gán vào EntryFeedDoc.payoutDetail.
 */
export interface Max3dFeedPayoutDetail {
  /** Chi tiết theo từng hạng giải. */
  tiers: Max3dFeedPayoutTier[];
}

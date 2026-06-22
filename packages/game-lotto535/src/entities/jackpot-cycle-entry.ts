/**
 * Lotto 5/35 – Jackpot Cycle Entry Entity (Cycle Ledger)
 *
 * Mỗi document = 1 kỳ quay đã settle trong 1 jackpot cycle.
 * Single source of truth cho opening/contribution/closing, winner + split flags.
 *
 * ── Quy ước `seq` ───────────────────────────────────────────────────────────
 * `seq` = drawCount SAU khi settle kỳ này (1-based).
 * `cycleDrawCountBefore` = `ledger(T).seq - 1`.
 *
 * Collection: lotto535_jackpot_cycle_entries.
 */

/** MongoDB document cho 1 kỳ trong Cycle Ledger Lotto 5/35. */
export interface JackpotCycleEntryDoc {
  _id: unknown;

  /** Số cycle — liên kết `JackpotCycleDoc.cycleNo`. */
  cycleNo: number;

  /** Mã kỳ quay. Format: `YYYY-MM-DD.NNN`. */
  drawId: string;

  /** Số thứ tự kỳ trong ngày (1=Morning, 2=Evening). */
  drawNo: number;

  /**
   * Số thứ tự kỳ trong cycle (1-based) = drawCount sau settle kỳ này.
   * Dùng cho `sumContributionBefore(cycleNo, seq)` (tính `cycleContributionBefore`)
   * và `findLatestInCycle` (cấp `nextSeq` khi FinalizeSettle).
   */
  seq: number;

  /**
   * Jackpot đầu kỳ (VND) = `closing(T-1)` hoặc seed nếu seq=1.
   * PrepareSettle resettle đọc field này thay vì `activeCycle.currentAmount`.
   */
  opening: number;

  /**
   * Contribution vào jackpot kỳ này (VND) = `DrawFinancial.jackpotContribution`.
   */
  contribution: number;

  /**
   * Jackpot cuối kỳ (VND) = opening + contribution (hoặc pool đã trao nếu có winner).
   */
  closing: number;

  /** Có người trúng Jackpot (5 main + special) trong kỳ này. */
  hasJpWinner: boolean;

  /**
   * Kỳ này đã thực hiện split cycle (chia JP xuống tier1-5).
   * = `isSplitCycleAtSettle && !hasJpWinner && split thực sự xảy ra`.
   */
  didSplit: boolean;

  /**
   * Snapshot `isSplitCycle` tại PrepareSettle (Evening + opening >= threshold).
   * Dùng pre-flight: phát hiện split state change khi sửa kết quả.
   */
  isSplitCycleAtSettle: boolean;

  /** Thời điểm settle (copy từ DrawDoc.settledAt). */
  settledAt: Date;

  /** Lần upsert ledger gần nhất. */
  updatedAt: Date;
}

/** Application entity — `_id` → `id` string. */
export interface JackpotCycleEntryEntity extends Omit<JackpotCycleEntryDoc, "_id"> {
  id: string;
}

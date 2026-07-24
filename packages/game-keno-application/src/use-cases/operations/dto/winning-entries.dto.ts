/**
 * Keno – Winning Entries DTO
 *
 * Danh sách entries trúng thưởng của một kỳ quay, kèm chi tiết.
 * Keno dùng unified boardDetails[] cho cả cơ bản và bổ sung:
 *   - Basic board: matchCount + pickCount + winAmount (không dùng PrizeTier enum)
 *   - Side bet: bet + outcome + isWin + winAmount
 *   - Có thể có cappedPrize khi bậc 8/9/10 bị payout cap
 */

// ─── Input ────────────────────────────────────────────────────────────────────

export interface GetWinningEntriesInput {
  drawId: string;
  /** Cursor-based pagination — entryId của record cuối trang trước. */
  cursor?: string;
  /** Số records mỗi trang, mặc định 50, tối đa 200. */
  limit?: number;
}

// ─── Output ───────────────────────────────────────────────────────────────────

/**
 * Chi tiết kết quả một board trúng thưởng — cả cơ bản và bổ sung.
 *
 * - Cơ bản (pick1-pick10): numbers + matchCount + pickCount meaningful, bet/outcome/isWin = undefined.
 * - Bổ sung (bigSmall/evenOdd): bet + outcome + isWin meaningful, numbers = [], matchCount = null, pickCount = null.
 */
export interface WinningEntryBoardDetail {
  /** Panel identifier: "A", "B", "C". */
  boardNo: string;
  /** Kiểu chơi (pick1-pick10, bigSmall, evenOdd). */
  playType: string;
  /** Số đã chọn (zero-padded, "01"-"80"). Chỉ meaningful cho cơ bản. */
  numbers?: string[];
  /** Số lượng số trúng với kết quả quay. null cho bổ sung — field không áp dụng. */
  matchCount: number | null;
  /** Số lượng số đã chọn. null cho bổ sung — field không áp dụng. */
  pickCount: number | null;
  /** Lựa chọn side bet. Chỉ cho bổ sung. */
  bet?: string;
  /** Outcome thực tế (ví dụ "big13Plus", "even1112"...). Chỉ cho bổ sung. */
  outcome?: string;
  /** Player thắng hay không. Set cho tất cả play types. */
  isWin: boolean;
  /**
   * Số tiền trúng thưởng của board này (VND).
   * Nếu bị payout cap → đây là giá trị sau khi áp cap.
   */
  winAmount: number;
  /**
   * Có bị payout cap không.
   * true = giải đã bị chia sẻ do vượt giới hạn trả thưởng bậc 8/9/10.
   */
  isCapped: boolean;
}

export interface WinningEntryItem {
  entryId: string;
  username: string;
  tenantId: string;
  /** Tổng tiền cược (VND). */
  amount: number;
  /** Tổng tiền trúng thưởng (VND). */
  winAmount: number;
  /**
   * 20 số kết quả kỳ quay (zero-padded, "01"-"80") — snapshot gắn vào entry lúc settle.
   * Dùng để highlight số trúng khi đối chiếu với board.numbers.
   */
  winningNumbers: string[];
  /** Chi tiết từng board trúng (cả cơ bản và bổ sung). */
  boardDetails: WinningEntryBoardDetail[];
  /** Thời điểm đặt cược. */
  createdAt: string;
  /** Thời điểm settle. */
  settledAt: string;
}

export interface WinningEntriesSummary {
  /** Tổng số entries trúng. */
  totalWinningEntries: number;
  /** Tổng tiền thưởng (VND). */
  totalWinAmount: number;
  /** Số entries bị payout cap (bậc 8/9/10 vượt giới hạn). */
  cappedEntries: number;
}

export interface GetWinningEntriesOutput {
  drawId: string;
  entries: WinningEntryItem[];
  summary: WinningEntriesSummary;
  nextCursor: string | null;
}

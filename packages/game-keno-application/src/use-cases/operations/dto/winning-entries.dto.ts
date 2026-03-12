/**
 * Keno – Winning Entries DTO
 *
 * Danh sách entries trúng thưởng của một kỳ quay, kèm chi tiết.
 * Keno khác biệt:
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

/** Chi tiết kết quả một board cơ bản trúng thưởng. */
export interface WinningEntryBoardDetail {
  /** Panel index (0 = A, 1 = B). */
  boardNo: number;
  /** Kiểu chơi (pick1-pick10). */
  playType: string;
  /** Số đã chọn (zero-padded, "01"-"80"). */
  numbers: string[];
  /** Số lượng số trúng với kết quả quay. */
  matchCount: number;
  /** Số lượng số đã chọn. */
  pickCount: number;
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

/** Chi tiết kết quả một side bet trúng thưởng. */
export interface WinningEntrySideBetDetail {
  /** Loại side bet: "bigSmall" | "evenOdd". */
  playType: string;
  /** Lựa chọn của người chơi (big/small/bigSmallDraw/even/odd/...). */
  bet: string;
  /** Outcome thực tế (ví dụ "big13Plus", "even1112"...). */
  outcome: string;
  /** true = trúng thưởng. */
  isWin: boolean;
  /** Tiền trúng (VND), 0 nếu thua. */
  winAmount: number;
}

export interface WinningEntryItem {
  entryId: string;
  username: string;
  tenantId: string;
  /** Tổng tiền cược (VND). */
  amount: number;
  /** Tổng tiền trúng thưởng (VND). */
  winAmount: number;
  /** Chi tiết từng board trúng. */
  boardDetails: WinningEntryBoardDetail[];
  /** Chi tiết từng side bet trúng. */
  sideBetDetails: WinningEntrySideBetDetail[];
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

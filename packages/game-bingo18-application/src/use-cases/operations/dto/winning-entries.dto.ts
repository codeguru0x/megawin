/**
 * Bingo 18 – Winning Entries DTO
 *
 * Danh sách entries trúng thưởng của một kỳ quay, kèm chi tiết.
 * Bingo 18 khác biệt:
 *   - Basic board: matchCount (singleNum: 1/2/3) + tripleKind? + winAmount
 *   - Side bet: sum/bet + isWin + winAmount
 *   - KHÔNG có payout cap (giải cố định, không có bậc 8/9/10 như Keno)
 *   - Outcome tổng hợp: "win" | "partial_win"
 */

import type {
  Bingo18PlayType,
  Bingo18BigSmallBet,
  Bingo18TripleKind,
} from "@megawin/game-bingo18/entities";

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
 * Chi tiết kết quả một board cơ bản trúng thưởng.
 * singleNum: matchCount = 1/2/3 (trúng 1/2/3 lần).
 * doubleMatch: matchCount = 1 (trúng hoặc không).
 * tripleMatch: matchCount = 1 + tripleKind phân biệt specific/any.
 */
export interface WinningBoardDetail {
  /** Mã board (format "B01", "B02",...). */
  boardNo: string;
  /** Loại cược: singleNum | doubleMatch | tripleMatch. */
  playType: Bingo18PlayType;
  /** Số đã chọn (1-6). undefined với tripleMatch-any. */
  number?: number;
  /**
   * Phân loại triple: "specific" hoặc "any".
   * Cần để phân biệt 1.2tr vs 200k.
   */
  tripleKind?: Bingo18TripleKind;
  /**
   * Số lần xuất hiện trong kết quả quay.
   * singleNum: 1/2/3 → giải khác nhau (12k/20k/30k).
   * doubleMatch + tripleMatch: 1 (trúng).
   */
  matchCount: number;
  /** Tiền thắng board này (VND). */
  winAmount: number;
}

/** Chi tiết kết quả một side bet trúng thưởng. */
export interface WinningSideBetDetail {
  /** Loại side bet: sumTotal | bigSmallDraw. */
  playType: Bingo18PlayType;
  /** Tổng đã chọn (3-18). Chỉ set cho sumTotal. */
  sum?: number;
  /** Cược lớn/hòa/nhỏ. Chỉ set cho bigSmallDraw. */
  bet?: Bingo18BigSmallBet;
  /** Kết quả thực tế (giá trị tổng thực tế hoặc outcome "big"/"small"/"draw"). */
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
  boardDetails: WinningBoardDetail[];
  /** Chi tiết từng side bet. */
  sideBetDetails: WinningSideBetDetail[];
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
}

export interface GetWinningEntriesOutput {
  drawId: string;
  entries: WinningEntryItem[];
  summary: WinningEntriesSummary;
  nextCursor: string | null;
}
